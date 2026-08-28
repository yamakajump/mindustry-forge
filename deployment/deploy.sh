#!/usr/bin/env bash
#######################################################################
# Deployment of mindustry-forge onto its server.
#
#   ssh <server> "bash /var/www/mindustry-forge/deployment/deploy.sh"
#
# The body sits in main(), called on the last line: bash reads the script
# as it goes, so a `git checkout` that rewrites this file halfway through
# would run anything at all. With main(), everything is parsed before the
# first command.
#
# The server configuration (nginx vhost, PHP-FPM pool, systemd units) is
# copied from the repository on every pass: the repository is the truth,
# not whatever is lying around in /etc.
#######################################################################
set -euo pipefail

APP_DIR="/var/www/mindustry-forge"
SITE_DIR="${APP_DIR}/site"
BRANCH="${DEPLOY_BRANCH:-main}"
DB_NAME="mindustry_forge"
DUMP_DIR="/var/backups/mindustry-forge/pre-deploy"
PHP_FPM="php8.3-fpm"
APP_USER="mforge"
VHOST="/etc/nginx/sites-available/mindustryforge"
POOL="/etc/php/8.3/fpm/pool.d/mforge.conf"

echec() {
    echo "❌ Failed: $1"
    exit 1
}

on_error() {
    echo "❌ Deployment interrupted."
    cd "$SITE_DIR" 2>/dev/null || exit 1
    # A non-Laravel safety net: if composer broke vendor/, `artisan up`
    # fails too and the site would stay stuck in maintenance.
    sudo -u "$APP_USER" php artisan up 2>/dev/null || rm -f "${SITE_DIR}/storage/framework/down"
    echo "⚠️  Site brought out of maintenance: it serves the previous code, not a white page."
}
trap on_error ERR

check_health() {
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: mindustryforge.com" http://127.0.0.1/ || echo 000)
    [ "$code" = "200" ] || echec "the site answers ${code} instead of 200"
    echo "✅ The site answers 200."
}

# Copies a system config from the repository. Returns 0 only if the file
# really changed, so that the caller knows whether it has to reload the
# service concerned.
config_a_change() {
    local source="$1" destination="$2"
    if [ -f "$destination" ] && cmp -s "$source" "$destination"; then
        return 1
    fi
    install -m 644 "$source" "$destination"
    return 0
}

main() {
    echo "→ Fetching ${BRANCH}..."
    cd "$APP_DIR"
    git reset --hard HEAD
    git clean -fd
    git fetch origin "$BRANCH" || echec "cannot reach GitHub"
    git checkout -B "$BRANCH" FETCH_HEAD

    cd "$SITE_DIR"
    echo "→ Dependencies..."
    COMPOSER_ALLOW_SUPERUSER=1 composer install --no-dev --optimize-autoloader --no-interaction \
        || echec "composer install"

    # A BLOCKING dump: a migration that runs with no backup behind it is a
    # bet, not a deployment.
    echo "→ Backing up the database before migrating..."
    mkdir -p "$DUMP_DIR"
    DUMP="${DUMP_DIR}/${DB_NAME}_$(date +%Y%m%d-%H%M%S).sql.gz"
    mysqldump --defaults-file=/etc/mysql/debian.cnf \
        --single-transaction --quick --routines --triggers "$DB_NAME" | gzip > "$DUMP" \
        || echec "mysqldump before migrating"
    [ -s "$DUMP" ] || echec "the pre-migration dump is empty"
    echo "   dump: ${DUMP}"
    ls -1t "${DUMP_DIR}/${DB_NAME}_"*.sql.gz | tail -n +11 | xargs -r rm -f

    echo "→ Going into maintenance..."
    sudo -u "$APP_USER" php artisan down || true

    sudo -u "$APP_USER" php artisan config:clear
    sudo -u "$APP_USER" php artisan route:clear
    sudo -u "$APP_USER" php artisan view:clear
    sudo -u "$APP_USER" php artisan migrate --force || echec "database migration"
    sudo -u "$APP_USER" php artisan config:cache
    sudo -u "$APP_USER" php artisan route:cache
    sudo -u "$APP_USER" php artisan view:cache

    echo "→ Permissions..."
    chown -R "${APP_USER}:www-data" "$APP_DIR"
    find "$APP_DIR" -path "${APP_DIR}/.git" -prune -o -type d -exec chmod 755 {} +
    find "$APP_DIR" -path "${APP_DIR}/.git" -prune -o -type f -exec chmod 644 {} +
    chmod +x "${SITE_DIR}/artisan" "${APP_DIR}"/deployment/*.sh
    chmod 600 "${SITE_DIR}/.env"
    chmod -R 775 "${SITE_DIR}/storage" "${SITE_DIR}/bootstrap/cache"

    # The pool almost never moves, and reloading it is expensive: a new
    # pool needs a restart, which briefly cuts the other sites served by
    # the same PHP-FPM. It is only done when it has changed.
    if config_a_change "${APP_DIR}/deployment/php-fpm/mforge.conf" "$POOL"; then
        echo "→ PHP-FPM pool changed, full restart..."
        systemctl restart "$PHP_FPM" || echec "restart php-fpm"
    else
        echo "→ Reloading PHP-FPM..."
        systemctl reload "$PHP_FPM"
    fi

    SOURCE_VHOST="${APP_DIR}/deployment/nginx/mindustryforge.conf"
    if [ ! -f "$VHOST" ] || ! cmp -s "$SOURCE_VHOST" "$VHOST"; then
        echo "→ nginx vhost changed, checking..."
        cp -a "$VHOST" "${VHOST}.precedent" 2>/dev/null || true
        install -m 644 "$SOURCE_VHOST" "$VHOST"
        ln -sf "$VHOST" /etc/nginx/sites-enabled/mindustryforge
        if ! nginx -t; then
            # A refused vhost must not take the server's other sites with
            # it: the previous one goes back before this fails.
            if [ -f "${VHOST}.precedent" ]; then
                mv "${VHOST}.precedent" "$VHOST"
            else
                rm -f "$VHOST" /etc/nginx/sites-enabled/mindustryforge
            fi
            echec "nginx vhost invalid, previous configuration restored"
        fi
        systemctl reload nginx
        rm -f "${VHOST}.precedent"
    fi

    sudo -u "$APP_USER" php artisan up

    check_health
    echo "✅ Deployment finished."
}

main "$@"
