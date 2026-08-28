#!/usr/bin/env bash
#######################################################################
# Provisionnement de mindustry-forge sur un serveur nu.
#
#   ssh codwingz-apps "bash /chemin/vers/install-server.sh"
#
# Ce script existe pour une seule raison : que la machine soit
# reconstruisible sans avoir a se souvenir de ce qui a ete tape a la
# main le jour de la mise en ligne. Il est idempotent, on peut donc le
# relancer sur un serveur deja installe sans rien casser.
#
# Ce qu'il NE fait pas, et qui reste manuel :
#   - le nom d'hote public dans le tunnel Cloudflare (dashboard) ;
#   - les identifiants Discord dans le .env (voir a la fin) ;
#   - la regle de redirection www -> apex (dashboard Cloudflare).
#
# Prerequis sur la machine : nginx, php8.3-fpm, mariadb, composer, git.
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

[ "$(id -u)" -eq 0 ] || { echo "❌ Ce script doit tourner en root."; exit 1; }

echo "→ Compte systeme ${APP_USER}..."
if ! id "$APP_USER" >/dev/null 2>&1; then
    adduser --system --group --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi
usermod -a -G www-data "$APP_USER"

echo "→ Base ${DB_NAME}..."
# Le mot de passe n'est genere qu'a la premiere installation : le
# regenerer a chaque passage invaliderait le .env d'un site en place.
if [ ! -s "$DB_PASS_FILE" ]; then
    openssl rand -base64 24 | tr -d '/+=' | head -c 28 > "$DB_PASS_FILE"
    chmod 600 "$DB_PASS_FILE"
fi
DB_PASS=$(cat "$DB_PASS_FILE")
mysql -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -e "CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';"
mysql -e "ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';"
mysql -e "GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost'; FLUSH PRIVILEGES;"

echo "→ Code source..."
if [ ! -d "${APP_DIR}/.git" ]; then
    rm -rf "$APP_DIR"
    git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
fi
# Le depot appartient a mforge et les deploiements tournent en root :
# sans cette exception, git refuse de travailler dessus.
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

echo "→ Pool PHP-FPM..."
install -m 644 "${APP_DIR}/deployment/php-fpm/mforge.conf" /etc/php/8.3/fpm/pool.d/mforge.conf
# restart et pas reload : voir l'avertissement en tete de mforge.conf.
systemctl restart "$PHP_FPM"

echo "→ Vhost nginx..."
install -m 644 "${APP_DIR}/deployment/nginx/mindustryforge.conf" /etc/nginx/sites-available/mindustryforge
ln -sf /etc/nginx/sites-available/mindustryforge /etc/nginx/sites-enabled/mindustryforge
nginx -t
systemctl reload nginx

echo "→ Sauvegarde automatique..."
install -m 644 "${APP_DIR}/deployment/systemd/mforge-backup.service" /etc/systemd/system/
install -m 644 "${APP_DIR}/deployment/systemd/mforge-backup.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now mforge-backup.timer

echo "→ Environnement applicatif..."
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
php artisan config:cache && php artisan route:cache && php artisan view:cache

echo "→ Permissions..."
chown -R "${APP_USER}:www-data" "$APP_DIR"
find "$APP_DIR" -path "${APP_DIR}/.git" -prune -o -type d -exec chmod 755 {} +
find "$APP_DIR" -path "${APP_DIR}/.git" -prune -o -type f -exec chmod 644 {} +
chmod +x "${SITE_DIR}/artisan" "${APP_DIR}"/deployment/*.sh
chmod 600 "${SITE_DIR}/.env"
chmod -R 775 "${SITE_DIR}/storage" "${SITE_DIR}/bootstrap/cache"

echo
echo "✅ Serveur provisionne."
if [ "${NOUVEAU_ENV:-0}" = "1" ]; then
    echo
    echo "⚠️  Il reste trois choses qu'aucun script ne peut deviner :"
    echo "   1. DISCORD_CLIENT_ID et DISCORD_CLIENT_SECRET dans ${SITE_DIR}/.env"
    echo "   2. le nom d'hote public dans le tunnel Cloudflare (-> http://localhost)"
    echo "   3. la regle Cloudflare qui redirige www vers l'apex"
fi
