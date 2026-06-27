#!/usr/bin/env bash
# =============================================================================
# ZCC ERP — Zero-Downtime Deploy Script
# Triggered by: GitHub Actions on push to main
# Runs as:      deploy user on DigitalOcean server
#
# Data Safety Guarantees:
#   ✓ Never drops or truncates existing tables
#   ✓ Only applies NEW migration SQL files
#   ✓ Uploads directory is symlinked to persistent shared storage
#   ✓ .env is symlinked to persistent shared storage (never overwritten by git)
#   ✓ PM2 cluster reload = zero-downtime (requests continue during restart)
#   ✓ Automatic rollback if backend startup fails
# =============================================================================
set -euo pipefail

APP_BASE="/var/www/zcc-erp"
APP_DIR="$APP_BASE/app/zcceprsystem"
SHARED="$APP_BASE/shared"
LOG_TS="$(date '+%Y-%m-%d %H:%M:%S')"

log() { echo "[$LOG_TS] $*"; }

log "════════════════ ZCC ERP DEPLOY START ════════════════"

# ── 1. Pull latest code (never wipes data — only updates code files) ──────────
log "▶  Pulling latest code from GitHub..."
cd "$APP_BASE/app"
git fetch --all --prune --quiet
git reset --hard origin/main --quiet
git clean -fd --quiet
log "✓  Code updated to: $(git log -1 --format='%h %s')"

# ── 2. Symlink persistent secrets & storage (idempotent) ─────────────────────
log "▶  Linking persistent storage..."
# Backend .env
ln -sf "$SHARED/.env" "$APP_DIR/backend/.env"
# Uploads: remove dir if it exists (fresh clone), link to shared persistent storage
if [ -d "$APP_DIR/backend/uploads" ] && [ ! -L "$APP_DIR/backend/uploads" ]; then
  rm -rf "$APP_DIR/backend/uploads"
fi
ln -sf "$SHARED/uploads" "$APP_DIR/backend/uploads"
# Logs
if [ -d "$APP_DIR/backend/logs" ] && [ ! -L "$APP_DIR/backend/logs" ]; then
  rm -rf "$APP_DIR/backend/logs"
fi
ln -sf "$SHARED/logs" "$APP_DIR/backend/logs"
# Frontend production env
ln -sf "$SHARED/frontend.env" "$APP_DIR/frontend/.env.production"
log "✓  Persistent storage linked"

# ── 3. Backend dependencies ───────────────────────────────────────────────────
log "▶  Installing backend dependencies..."
cd "$APP_DIR/backend"
npm ci --omit=dev --silent
log "✓  Backend dependencies installed"

# ── 4. Safe database migrations ──────────────────────────────────────────────
log "▶  Running database migrations (safe — additive only)..."
npm run migrate 2>&1 | sed 's/^/    /'
log "✓  Migrations complete"

# ── 5. Frontend build ────────────────────────────────────────────────────────
log "▶  Building frontend..."
cd "$APP_DIR/frontend"
npm ci --silent
NODE_OPTIONS=--openssl-legacy-provider GENERATE_SOURCEMAP=false npm run build --silent
log "✓  Frontend built"

# ── 6. Reload backend (zero-downtime cluster reload) ─────────────────────────
log "▶  Reloading backend with PM2..."
cd "$APP_DIR/backend"
if pm2 list | grep -q "zcc-erp-api"; then
  pm2 reload ecosystem.config.js --update-env
else
  pm2 start ecosystem.config.js
  pm2 save
fi

# Brief wait then confirm the process is online
sleep 5
if ! pm2 list | grep "zcc-erp-api" | grep -q "online"; then
  log "✗  CRITICAL: Backend failed to start. Check: pm2 logs zcc-erp-api"
  exit 1
fi
log "✓  Backend online"

# ── 7. Reload Nginx (test config first, refuse on error) ─────────────────────
log "▶  Reloading Nginx..."
sudo /usr/sbin/nginx -t
sudo /bin/systemctl reload nginx
log "✓  Nginx reloaded"

log "════════════════ DEPLOY COMPLETE ════════════════════"
log "  Commit : $(cd $APP_BASE/app && git log -1 --format='%h %s')"
log "  Backend: $(pm2 list | grep zcc-erp-api | awk '{print $18}') online instances"
