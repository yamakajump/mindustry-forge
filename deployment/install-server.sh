#!/usr/bin/env bash
#######################################################################
# Provisioning of mindustry-forge on a bare server.
#
#   ssh <server> "bash /path/to/install-server.sh"
#
# This script exists for one reason: so that the machine can be rebuilt
# without having to remember what was typed by hand on the day the site
# went up. It is idempotent, so it can be run again on an already
# installed server without breaking anything.
#
# What it does NOT do, and what stays manual:
#   - the public hostname in the Cloudflare tunnel (dashboard);
#   - the Discord credentials in the .env (see the end);
#   - the www -> apex redirect rule (Cloudflare dashboard).
#
# Prerequisites on the machine: nginx, php8.3-fpm, mariadb, composer,
# git.
#######################################################################
set -euo pipefail

APP_DIR="/var/www/mindustry-forge"
SITE_DIR="${APP_DIR}/site"
REPO="https://github.com/yamakajump/mindustry-forge.git"
BRANCH="${DEPLOY_BRANCH:-main}"
APP_USER="mforge"
DB_NAME="mindustry_forge"
DB_USER="mforge"
DB_PASS_FILE="/root/.mforge-db-pass"
PHP_FPM="php8.3-fpm"

[ "$(id -u)" -eq 0 ] || { echo "❌ This script has to run as root."; exit 1; }

echo "→ System account ${APP_USER}..."
if ! id "$APP_USER" >/dev/null 2>&1; then
    adduser --system --group --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi
usermod -a -G www-data "$APP_USER"

echo "→ Database ${DB_NAME}..."
# The password is only generated at the first installation: regenerating
# it on every pass would invalidate the .env of a site already running.
if [ ! -s "$DB_PASS_FILE" ]; then
    openssl rand -base64 24 | tr -d '/+=' | head -c 28 > "$DB_PASS_FILE"
    chmod 600 "$DB_PASS_FILE"
fi
DB_PASS=$(cat "$DB_PASS_FILE")
mysql -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -e "CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';"
mysql -e "ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';"
mysql -e "GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost'; FLUSH PRIVILEGES;"

echo "→ Source code..."
if [ ! -d "${APP_DIR}/.git" ]; then
    rm -rf "$APP_DIR"
    git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
fi
# The repository belongs to mforge and deployments run as root: without
# this exception, git refuses to work on it.
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

echo "→ Pool PHP-FPM..."
install -m 644 "${APP_DIR}/deployment/php-fpm/mforge.conf" /etc/php/8.3/fpm/pool.d/mforge.conf
# restart rather than reload: see the warning at the top of mforge.conf.
systemctl restart "$PHP_FPM"

echo "→ nginx vhost..."
install -m 644 "${APP_DIR}/deployment/nginx/mindustryforge.conf" /etc/nginx/sites-available/mindustryforge
ln -sf /etc/nginx/sites-available/mindustryforge /etc/nginx/sites-enabled/mindustryforge
nginx -t
systemctl reload nginx

echo "→ Automatic backup..."
install -m 644 "${APP_DIR}/deployment/systemd/mforge-backup.service" /etc/systemd/system/
install -m 644 "${APP_DIR}/deployment/systemd/mforge-backup.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now mforge-backup.timer

echo "→ Application environment..."
cd "$SITE_DIR"
if [ ! -f .env ]; then
    cat > .env <<EOF
APP_NAME="Mindustry Forge"
APP_ENV=production
APP_KEY=
APP_DEBUG=false
APP_URL=https://mindustryforge.com
APP_LOCALE=fr
APP_FALLBACK_LOCALE=fr
APP_FAKER_LOCALE=fr_FR
APP_MAINTENANCE_DRIVER=file
BCRYPT_ROUNDS=12
LOG_CHANNEL=stack
LOG_STACK=daily
LOG_LEVEL=warning
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=${DB_NAME}
DB_USERNAME=${DB_USER}
DB_PASSWORD="${DB_PASS}"
SESSION_DRIVER=database
SESSION_LIFETIME=120
SESSION_ENCRYPT=false
SESSION_PATH=/
SESSION_DOMAIN=null
SESSION_SECURE_COOKIE=true
QUEUE_CONNECTION=database
CACHE_STORE=database
FILESYSTEM_DISK=local
BROADCAST_CONNECTION=log
MAIL_MAILER=log
MAIL_FROM_ADDRESS="contact@mindustryforge.com"
MAIL_FROM_NAME="\${APP_NAME}"
DISCORD_CLIENT_ID=A_RENSEIGNER
DISCORD_CLIENT_SECRET=A_RENSEIGNER
DISCORD_REDIRECT=https://mindustryforge.com/auth/discord/callback
EOF
    chmod 600 .env
    NOUVEAU_ENV=1
fi

COMPOSER_ALLOW_SUPERUSER=1 composer install --no-dev --optimize-autoloader --no-interaction
grep -q '^APP_KEY=base64:' .env || php artisan key:generate --force
php artisan migrate --force
# Previews are written to storage/app/public and served from public/storage. See deploy.sh.
php artisan storage:link --force
php artisan config:cache && php artisan route:cache && php artisan view:cache

echo "→ Permissions..."
chown -R "${APP_USER}:www-data" "$APP_DIR"
find "$APP_DIR" -path "${APP_DIR}/.git" -prune -o -type d -exec chmod 755 {} +
find "$APP_DIR" -path "${APP_DIR}/.git" -prune -o -type f -exec chmod 644 {} +
chmod +x "${SITE_DIR}/artisan" "${APP_DIR}"/deployment/*.sh
chmod 600 "${SITE_DIR}/.env"
chmod -R 775 "${SITE_DIR}/storage" "${SITE_DIR}/bootstrap/cache"

echo
echo "✅ Server provisioned."
if [ "${NOUVEAU_ENV:-0}" = "1" ]; then
    echo
    echo "⚠️  Three things are left that no script can guess:"
    echo "   1. DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET in ${SITE_DIR}/.env"
    echo "   2. the public hostname in the Cloudflare tunnel (-> http://localhost)"
    echo "   3. the Cloudflare rule that redirects www to the apex"
fi
