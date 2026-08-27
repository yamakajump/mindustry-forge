#!/usr/bin/env bash
#######################################################################
# Deploiement de mindustry-forge sur le VPS codwingz-apps.
#
#   ssh codwingz-apps "bash /var/www/mindustry-forge/deployment/deploy.sh"
#
# Le corps tient dans main(), appelee sur la derniere ligne : bash lit le
# script au fur et a mesure, donc un `git checkout` qui reecrit ce fichier
# en plein milieu ferait executer n'importe quoi. Avec main(), tout est
# parse avant la premiere commande.
#######################################################################
set -euo pipefail

APP_DIR="/var/www/mindustry-forge"
SITE_DIR="${APP_DIR}/site"
BRANCH="${DEPLOY_BRANCH:-restart/place-de-marche}"
DB_NAME="mindustry_forge"
DUMP_DIR="/var/backups/mindustry-forge/pre-deploy"
PHP_FPM="php8.3-fpm"
APP_USER="mforge"

on_error() {
    echo "❌ Echec du deploiement."
    cd "$SITE_DIR" 2>/dev/null || exit 1
    # Filet non-Laravel : si composer a casse le vendor/, `artisan up` echoue
    # lui aussi et le site resterait bloque en maintenance.
    sudo -u "$APP_USER" php artisan up 2>/dev/null || rm -f "${SITE_DIR}/storage/framework/down"
    echo "⚠️  Site ressorti de maintenance. Verifier l'etat avant de relancer."
}
trap on_error ERR

check_health() {
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: mindustryforge.com" http://127.0.0.1/ || echo 000)
    if [ "$code" != "200" ]; then
        echo "❌ Le site repond ${code} au lieu de 200."
        return 1
    fi
    echo "✅ Le site repond 200."
}

main() {
    cd "$SITE_DIR"

    # Git et composer AVANT la mise en maintenance : seule la migration exige
    # que le site soit ferme, et le reste prend bien plus de temps qu'elle.
    echo "→ Recuperation de ${BRANCH}..."
    cd "$APP_DIR"
    git reset --hard HEAD
    git clean -fd
    git fetch origin "$BRANCH"
    git checkout -B "$BRANCH" FETCH_HEAD

    cd "$SITE_DIR"
    echo "→ Dependances..."
    COMPOSER_ALLOW_SUPERUSER=1 composer install --no-dev --optimize-autoloader --no-interaction

    # Dump BLOQUANT : une migration qui tourne sans sauvegarde derriere elle
    # est un pari, pas un deploiement.
    echo "→ Sauvegarde de la base avant migration..."
    mkdir -p "$DUMP_DIR"
    DUMP="${DUMP_DIR}/${DB_NAME}_$(date +%Y%m%d-%H%M%S).sql.gz"
    mysqldump --defaults-file=/etc/mysql/debian.cnf \
        --single-transaction --quick --routines --triggers "$DB_NAME" | gzip > "$DUMP"
    echo "   dump : ${DUMP}"
    # Ne garder que les 10 derniers dumps pre-deploiement.
    ls -1t "${DUMP_DIR}/${DB_NAME}_"*.sql.gz | tail -n +11 | xargs -r rm -f

    echo "→ Mise en maintenance..."
    sudo -u "$APP_USER" php artisan down || true

    sudo -u "$APP_USER" php artisan config:clear
    sudo -u "$APP_USER" php artisan route:clear
    sudo -u "$APP_USER" php artisan view:clear
    sudo -u "$APP_USER" php artisan migrate --force
    sudo -u "$APP_USER" php artisan config:cache
    sudo -u "$APP_USER" php artisan route:cache
    sudo -u "$APP_USER" php artisan view:cache

    echo "→ Permissions..."
    chown -R "${APP_USER}:www-data" "$APP_DIR"
    chmod 600 "${SITE_DIR}/.env"
    chmod -R 775 "${SITE_DIR}/storage" "${SITE_DIR}/bootstrap/cache"

    # reload et pas restart : ce serveur heberge aussi le panel de facturation
    # et le site de Sandrine, qu'un restart couperait le temps du redemarrage.
    echo "→ Rechargement de PHP-FPM..."
    systemctl reload "$PHP_FPM"

    sudo -u "$APP_USER" php artisan up

    check_health
    echo "✅ Deploiement termine."
}

main "$@"
