#!/usr/bin/env bash
#######################################################################
# Daily backup of mindustry-forge.
#
# Two levels, because they do not protect against the same failures:
#   - a local copy, which answers a failed migration or a deletion, that
#     is, the frequent case;
#   - an encrypted copy at Scaleway, which answers the loss of the
#     server, that is, the rare and final case.
#
# The encryption happens on the rclone side, contents AND file names: the
# remote store sees nothing but bytes with no structure. The passphrases
# are written nowhere on this machine in the clear: without them, the
# remote backups are permanently unreadable. Whoever deploys this script
# keeps them off the machine, and out of the repository.
#
# The bucket has its own project and its own API key: a compromise of
# this server does not give access to its owner's other backups.
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
log "Dumping the ${DB_NAME} database..."
if ! mysqldump --defaults-file=/etc/mysql/debian.cnf \
    --single-transaction --quick --routines --triggers "$DB_NAME" | gzip > "$DUMP"; then
    log "ERROR: mysqldump failed"
    rm -f "$DUMP"
    exit 1
fi

# An empty dump silently passes the file existence checks, and is only
# discovered at the moment it is needed.
if [ ! -s "$DUMP" ] || [ "$(stat -c %s "$DUMP")" -lt 1000 ]; then
    log "ERROR: the dump is under 1 kB, it is empty or truncated"
    rm -f "$DUMP"
    exit 1
fi
log "Dump written: ${DUMP} ($(du -h "$DUMP" | cut -f1))"

# The .env carries the application key and the Discord credentials:
# without it, restoring the database does not give back a working site.
ENV_COPY="${BACKUP_ROOT}/env_${STAMP}.txt"
cp "${APP_DIR}/site/.env" "$ENV_COPY"
chmod 600 "$ENV_COPY"

if command -v rclone > /dev/null && rclone listremotes | grep -q "^${REMOTE}:"; then
    log "Sending off site (encrypted) to ${REMOTE}..."
    rclone copy "$DUMP" "${REMOTE}:db/" --no-traverse
    rclone copy "$ENV_COPY" "${REMOTE}:env/" --no-traverse
    log "Pruning remotely beyond ${RETENTION_REMOTE_DAYS} days..."
    rclone delete "${REMOTE}:db/" --min-age "${RETENTION_REMOTE_DAYS}d"
    rclone delete "${REMOTE}:env/" --min-age "${RETENTION_REMOTE_DAYS}d"
else
    # Deliberately loud: a backup that stops going off site with nobody
    # knowing is worse than no backup at all, because it is still being
    # counted on.
    log "WARNING: remote ${REMOTE} not found, the backup stays local"
fi

log "Pruning locally beyond ${RETENTION_LOCAL_DAYS} days..."
find "$DB_DIR" -name "${DB_NAME}_*.sql.gz" -mtime "+${RETENTION_LOCAL_DAYS}" -delete
find "$BACKUP_ROOT" -maxdepth 1 -name "env_*.txt" -mtime "+${RETENTION_LOCAL_DAYS}" -delete

log "Backup finished."
