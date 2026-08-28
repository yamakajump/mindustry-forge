#!/usr/bin/env bash
#######################################################################
# Sauvegarde quotidienne de mindustry-forge.
#
# Deux niveaux, parce qu'ils ne protegent pas des memes pannes :
#   - une copie locale, qui repond a une migration ratee ou a une
#     suppression, c'est-a-dire au cas frequent ;
#   - une copie chiffree chez Scaleway, qui repond a la perte du serveur,
#     c'est-a-dire au cas rare et definitif.
#
# Le chiffrement se fait cote rclone, contenu ET noms de fichiers : le
# depot distant ne voit que des octets sans structure. Les phrases de
# passe ne sont ecrites nulle part sur cette machine en clair : sans
# elles, les sauvegardes distantes sont definitivement illisibles. Qui
# deploie ce script les garde hors de la machine, et hors du depot.
#
# Le bucket a son propre projet et sa propre cle API : une compromission
# de ce serveur ne donne pas acces aux autres sauvegardes de son
# proprietaire.
#######################################################################
set -euo pipefail

DB_NAME="mindustry_forge"
APP_DIR="/var/www/mindustry-forge"
BACKUP_ROOT="/var/backups/mindustry-forge"
DB_DIR="${BACKUP_ROOT}/db"
REMOTE="scw-mforge-crypt"
RETENTION_LOCAL_DAYS=14
RETENTION_REMOTE_DAYS=90
STAMP=$(date +%F_%H%M%S)
LOG_TAG="mforge-backup"

log() { echo "$*"; logger -t "$LOG_TAG" "$*" 2>/dev/null || true; }

mkdir -p "$DB_DIR"

DUMP="${DB_DIR}/${DB_NAME}_${STAMP}.sql.gz"
log "Dump de la base ${DB_NAME}..."
if ! mysqldump --defaults-file=/etc/mysql/debian.cnf \
    --single-transaction --quick --routines --triggers "$DB_NAME" | gzip > "$DUMP"; then
    log "ERREUR : mysqldump en echec"
    rm -f "$DUMP"
    exit 1
fi

# Un dump vide passe silencieusement les tests d'existence de fichier, et
# ne se decouvre qu'au moment ou on en a besoin.
if [ ! -s "$DUMP" ] || [ "$(stat -c %s "$DUMP")" -lt 1000 ]; then
    log "ERREUR : le dump fait moins de 1 Ko, il est vide ou tronque"
    rm -f "$DUMP"
    exit 1
fi
log "Dump ecrit : ${DUMP} ($(du -h "$DUMP" | cut -f1))"

# Le .env porte la cle applicative et les identifiants Discord : sans lui,
# une restauration de la base ne redonne pas un site qui fonctionne.
ENV_COPY="${BACKUP_ROOT}/env_${STAMP}.txt"
cp "${APP_DIR}/site/.env" "$ENV_COPY"
chmod 600 "$ENV_COPY"

if command -v rclone > /dev/null && rclone listremotes | grep -q "^${REMOTE}:"; then
    log "Envoi hors site (chiffre) vers ${REMOTE}..."
    rclone copy "$DUMP" "${REMOTE}:db/" --no-traverse
    rclone copy "$ENV_COPY" "${REMOTE}:env/" --no-traverse
    log "Purge distante au-dela de ${RETENTION_REMOTE_DAYS} jours..."
    rclone delete "${REMOTE}:db/" --min-age "${RETENTION_REMOTE_DAYS}d"
    rclone delete "${REMOTE}:env/" --min-age "${RETENTION_REMOTE_DAYS}d"
else
    # Volontairement bruyant : une sauvegarde qui ne part plus hors site
    # sans que personne ne le sache est pire que pas de sauvegarde du tout,
    # parce qu'on continue a compter dessus.
    log "ATTENTION : remote ${REMOTE} introuvable, la sauvegarde reste locale"
fi

log "Purge locale au-dela de ${RETENTION_LOCAL_DAYS} jours..."
find "$DB_DIR" -name "${DB_NAME}_*.sql.gz" -mtime "+${RETENTION_LOCAL_DAYS}" -delete
find "$BACKUP_ROOT" -maxdepth 1 -name "env_*.txt" -mtime "+${RETENTION_LOCAL_DAYS}" -delete

log "Sauvegarde terminee."
