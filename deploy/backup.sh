#!/usr/bin/env bash
# =============================================================================
# ZCC ERP — Automated Daily Backup
# Scheduled by cron: 0 2 * * *  (runs at 02:00 server time every day)
#
# What it backs up:
#   1. Full MySQL database dump (compressed)
#   2. Uploaded documents/attachments directory
#
# Retention: keeps last 30 days, deletes older backups automatically
# Storage:   /var/backups/zcc-erp/
# =============================================================================
set -euo pipefail

BACKUP_ROOT="/var/backups/zcc-erp"
SHARED="/var/www/zcc-erp/shared"
ENV_FILE="$SHARED/.env"
DATE="$(date '+%Y-%m-%d')"
TIMESTAMP="$(date '+%Y-%m-%d_%H-%M-%S')"
RETAIN_DAYS=30

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# ── Load database credentials from the production .env ───────────────────────
if [ ! -f "$ENV_FILE" ]; then
  log "ERROR: .env not found at $ENV_FILE"
  exit 1
fi
export $(grep -E '^(DB_HOST|DB_PORT|DB_USER|DB_PASSWORD|DB_NAME)=' "$ENV_FILE" | xargs)

# ── Create directories ───────────────────────────────────────────────────────
mkdir -p "$BACKUP_ROOT/db"
mkdir -p "$BACKUP_ROOT/uploads"

# ── 1. Database dump ─────────────────────────────────────────────────────────
DB_DUMP="$BACKUP_ROOT/db/${DB_NAME}_${TIMESTAMP}.sql.gz"
log "▶  Dumping database '$DB_NAME' → $DB_DUMP"

mysqldump \
  --host="${DB_HOST:-localhost}" \
  --port="${DB_PORT:-3306}" \
  --user="$DB_USER" \
  --password="$DB_PASSWORD" \
  --single-transaction \
  --routines \
  --triggers \
  --add-drop-table=false \
  --no-tablespaces \
  "$DB_NAME" | gzip -9 > "$DB_DUMP"

DB_SIZE="$(du -sh "$DB_DUMP" | cut -f1)"
log "✓  Database backup: $DB_SIZE"

# ── 2. Uploads directory ─────────────────────────────────────────────────────
UPLOADS_ARCHIVE="$BACKUP_ROOT/uploads/uploads_${TIMESTAMP}.tar.gz"
log "▶  Archiving uploads → $UPLOADS_ARCHIVE"

tar -czf "$UPLOADS_ARCHIVE" -C "$SHARED" uploads/ 2>/dev/null || true

UP_SIZE="$(du -sh "$UPLOADS_ARCHIVE" | cut -f1)"
log "✓  Uploads backup: $UP_SIZE"

# ── 3. Prune old backups (older than RETAIN_DAYS) ────────────────────────────
log "▶  Removing backups older than $RETAIN_DAYS days..."
find "$BACKUP_ROOT/db"      -name "*.sql.gz"  -mtime +$RETAIN_DAYS -delete
find "$BACKUP_ROOT/uploads" -name "*.tar.gz"  -mtime +$RETAIN_DAYS -delete
REMAINING_DB="$(ls "$BACKUP_ROOT/db" | wc -l)"
log "✓  Pruning done — $REMAINING_DB daily DB backups retained"

# ── 4. Summary ───────────────────────────────────────────────────────────────
TOTAL_SIZE="$(du -sh "$BACKUP_ROOT" | cut -f1)"
log "════ Backup complete — total backup storage: $TOTAL_SIZE ════"
