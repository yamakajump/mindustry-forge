#!/usr/bin/env bash
#######################################################################
# Deploiement de mindustry-forge sur son serveur.
#
#   ssh <serveur> "bash /var/www/mindustry-forge/deployment/deploy.sh"
#
# Le corps tient dans main(), appelee sur la derniere ligne : bash lit le
# script au fur et a mesure, donc un `git checkout` qui reecrit ce fichier
# en plein milieu ferait executer n'importe quoi. Avec main(), tout est
# parse avant la premiere commande.
#
# La configuration serveur (vhost nginx, pool PHP-FPM, unites systemd)
# est recopiee depuis le depot a chaque passage : le depot est la verite,
# pas ce qui traine dans /etc.
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
    echo "❌ Echec : $1"
    exit 1
}

on_error() {
    echo "❌ Deploiement interrompu."
    cd "$SITE_DIR" 2>/dev/null || exit 1
    # Filet non-Laravel : si composer a casse le vendor/, `artisan up`
    # echoue lui aussi et le site resterait bloque en maintenance.
    sudo -u "$APP_USER" php artisan up 2>/dev/null || rm -f "${SITE_DIR}/storage/framework/down"
    echo "⚠️  Site ressorti de maintenance : il sert le code d'avant, pas une page blanche."
}
trap on_error ERR

check_health() {
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: mindustryforge.com" http://127.0.0.1/ || echo 000)
    [ "$code" = "200" ] || echec "le site repond ${code} au lieu de 200"
    echo "✅ Le site repond 200."
}

# Recopie une config systeme depuis le depot. Ne renvoie 0 que si le
# fichier a reellement change, pour que l'appelant sache s'il doit
# recharger le service concerne.
config_a_change() {
    local source="$1" destination="$2"
    if [ -f "$destination" ] && cmp -s "$source" "$destination"; then
        return 1
    fi
    install -m 644 "$source" "$destination"
    return 0
}

main() {
    echo "→ Recuperation de ${BRANCH}..."
    cd "$APP_DIR"
    git reset --hard HEAD
    git clean -fd
    git fetch origin "$BRANCH" || echec "impossible de joindre GitHub"
    git checkout -B "$BRANCH" FETCH_HEAD

    cd "$SITE_DIR"
    echo "→ Dependances..."
    COMPOSER_ALLOW_SUPERUSER=1 composer install --no-dev --optimize-autoloader --no-interaction \
        || echec "composer install"

    # Dump BLOQUANT : une migration qui tourne sans sauvegarde derriere
    # elle est un pari, pas un deploiement.
    echo "→ Sauvegarde de la base avant migration..."
    mkdir -p "$DUMP_DIR"
    DUMP="${DUMP_DIR}/${DB_NAME}_$(date +%Y%m%d-%H%M%S).sql.gz"
    mysqldump --defaults-file=/etc/mysql/debian.cnf \
        --single-transaction --quick --routines --triggers "$DB_NAME" | gzip > "$DUMP" \
        || echec "mysqldump avant migration"
    [ -s "$DUMP" ] || echec "le dump avant migration est vide"
    echo "   dump : ${DUMP}"
    ls -1t "${DUMP_DIR}/${DB_NAME}_"*.sql.gz | tail -n +11 | xargs -r rm -f

    echo "→ Mise en maintenance..."
    sudo -u "$APP_USER" php artisan down || true

    sudo -u "$APP_USER" php artisan config:clear
    sudo -u "$APP_USER" php artisan route:clear
    sudo -u "$APP_USER" php artisan view:clear
    sudo -u "$APP_USER" php artisan migrate --force || echec "migration de la base"
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

    # Le pool ne bouge presque jamais, et le recharger coute cher : un
    # nouveau pool exige un restart, qui coupe brievement les autres
    # sites servis par le meme PHP-FPM. On ne le fait que s'il a change.
    if config_a_change "${APP_DIR}/deployment/php-fpm/mforge.conf" "$POOL"; then
        echo "→ Pool PHP-FPM modifie, redemarrage complet..."
        systemctl restart "$PHP_FPM" || echec "restart php-fpm"
    else
        echo "→ Rechargement de PHP-FPM..."
        systemctl reload "$PHP_FPM"
    fi

    SOURCE_VHOST="${APP_DIR}/deployment/nginx/mindustryforge.conf"
    if [ ! -f "$VHOST" ] || ! cmp -s "$SOURCE_VHOST" "$VHOST"; then
        echo "→ Vhost nginx modifie, verification..."
        cp -a "$VHOST" "${VHOST}.precedent" 2>/dev/null || true
        install -m 644 "$SOURCE_VHOST" "$VHOST"
        ln -sf "$VHOST" /etc/nginx/sites-enabled/mindustryforge
        if ! nginx -t; then
            # Un vhost refuse ne doit pas emporter les autres sites du
            # serveur avec lui : on remet celui d'avant avant d'echouer.
            if [ -f "${VHOST}.precedent" ]; then
                mv "${VHOST}.precedent" "$VHOST"
            else
                rm -f "$VHOST" /etc/nginx/sites-enabled/mindustryforge
            fi
            echec "vhost nginx invalide, configuration precedente restauree"
        fi
        systemctl reload nginx
        rm -f "${VHOST}.precedent"
    fi

    sudo -u "$APP_USER" php artisan up

    check_health
    echo "✅ Deploiement termine."
}

main "$@"
