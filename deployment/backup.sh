#!/usr/bin/env bash
#######################################################################
# Sauvegarde quotidienne de mindustry-forge.
#
# Ce que ce script protege : une migration qui se passe mal, une
# suppression accidentelle, une bibliotheque de schematiques effacee.
# Autrement dit la panne probable, celle qui vient d'ici.
#
# Ce qu'il ne protege PAS : la perte du serveur lui-meme. Les copies
# vivent sur le meme disque que la base. Un envoi hors site chiffre
# (comme celui de codwingz-api vers Scaleway) reste a faire, et demande
# son propre bucket : melanger un site public avec les factures legales
# dans un meme depot chiffre serait un raccourci qu'on regretterait.
#######################################################################
set -euo pipefail

DB_NAME="mindustry_forge"
BACKUP_ROOT="/var/backups/mindustry-forge"
DB_DIR="${BACKUP_ROOT}/db"
RETENTION_LOCAL_DAYS=14
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
cp /var/www/mindustry-forge/site/.env "$ENV_COPY"
chmod 600 "$ENV_COPY"

log "Purge des copies de plus de ${RETENTION_LOCAL_DAYS} jours..."
find "$DB_DIR" -name "${DB_NAME}_*.sql.gz" -mtime "+${RETENTION_LOCAL_DAYS}" -delete
find "$BACKUP_ROOT" -maxdepth 1 -name "env_*.txt" -mtime "+${RETENTION_LOCAL_DAYS}" -delete

log "Sauvegarde terminee."
