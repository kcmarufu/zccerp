#!/usr/bin/env bash
# =============================================================================
# ZCC ERP — One-Time DigitalOcean Server Setup
# Run as root on a fresh Ubuntu 22.04 droplet
#
# Usage:
#   chmod +x setup-server.sh
#   sudo bash setup-server.sh
#
# After this script:
#   1. Edit  /var/www/zcc-erp/shared/.env   with your real secrets
#   2. Edit  /var/www/zcc-erp/shared/frontend.env  with your domain
#   3. Run   certbot --nginx -d YOUR_DOMAIN
#   4. Run   /var/www/zcc-erp/deploy.sh   (first full deploy)
# =============================================================================
set -euo pipefail

DOMAIN="${1:-YOUR_DOMAIN}"
DEPLOY_USER="deploy"
APP_BASE="/var/www/zcc-erp"
REPO_URL="${2:-https://github.com/YOUR_ORG/YOUR_REPO.git}"
DB_NAME="finance_erp"
DB_USER="zccapp"
DB_PASS="$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)"

echo "════════════════════════════════════════════════════════"
echo "  ZCC ERP — Server Setup"
echo "  Domain : $DOMAIN"
echo "  App dir: $APP_BASE"
echo "════════════════════════════════════════════════════════"

# ── 1. System packages ────────────────────────────────────────────────────────
apt-get update -y && apt-get upgrade -y
apt-get install -y curl git nginx mysql-server certbot python3-certbot-nginx \
                   logrotate fail2ban ufw

# ── 2. Node.js 20 LTS ────────────────────────────────────────────────────────
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
npm install -g pm2

# ── 3. Deploy user (no root, key-only SSH) ───────────────────────────────────
if ! id "$DEPLOY_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$DEPLOY_USER"
  usermod -aG www-data "$DEPLOY_USER"
fi
mkdir -p "/home/$DEPLOY_USER/.ssh"
chmod 700 "/home/$DEPLOY_USER/.ssh"
touch "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
echo "  ▶  Paste your GitHub Actions PUBLIC key into /home/$DEPLOY_USER/.ssh/authorized_keys"

# ── 4. Sudoers — deploy can reload nginx only ────────────────────────────────
cat > /etc/sudoers.d/deploy-nginx << 'EOF'
deploy ALL=(root) NOPASSWD: /usr/sbin/nginx -t, /bin/systemctl reload nginx
EOF
chmod 440 /etc/sudoers.d/deploy-nginx

# ── 5. Directory structure ───────────────────────────────────────────────────
mkdir -p "$APP_BASE"/{shared/{uploads,logs},app}
chown -R "$DEPLOY_USER:www-data" "$APP_BASE"
chmod -R 755 "$APP_BASE"
chmod -R 775 "$APP_BASE/shared/uploads"

# ── 6. MySQL — create database and restricted app user ──────────────────────
mysql -u root << MYSQL
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
GRANT SELECT,INSERT,UPDATE,DELETE,CREATE,ALTER,INDEX,DROP,REFERENCES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';
FLUSH PRIVILEGES;
MYSQL
echo ""
echo "  ═══ SAVE THESE CREDENTIALS ═══════════════════════════════════"
echo "  DB_NAME=$DB_NAME"
echo "  DB_USER=$DB_USER"
echo "  DB_PASS=$DB_PASS"
echo "  ═══════════════════════════════════════════════════════════════"
echo ""

# ── 7. Environment file templates ────────────────────────────────────────────
JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")"

cat > "$APP_BASE/shared/.env" << ENV
NODE_ENV=production
PORT=5000
DB_HOST=localhost
DB_PORT=3306
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASS
DB_CONNECTION_LIMIT=30
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=8h
CORS_ORIGIN=https://$DOMAIN
UPLOAD_DIR=$APP_BASE/shared/uploads
LOG_LEVEL=warn
ENV

cat > "$APP_BASE/shared/frontend.env" << FENV
REACT_APP_API_URL=https://$DOMAIN/api
GENERATE_SOURCEMAP=false
FENV

chmod 600 "$APP_BASE/shared/.env" "$APP_BASE/shared/frontend.env"
chown "$DEPLOY_USER:$DEPLOY_USER" "$APP_BASE/shared/.env" "$APP_BASE/shared/frontend.env"

# ── 8. Clone repository ──────────────────────────────────────────────────────
if [ ! -d "$APP_BASE/app/.git" ]; then
  sudo -u "$DEPLOY_USER" git clone "$REPO_URL" "$APP_BASE/app"
fi

# ── 9. Nginx ─────────────────────────────────────────────────────────────────
cp "$APP_BASE/app/zcceprsystem/deploy/nginx.conf" /etc/nginx/sites-available/zcc-erp
sed -i "s/YOUR_DOMAIN/$DOMAIN/g" /etc/nginx/sites-available/zcc-erp
ln -sf /etc/nginx/sites-available/zcc-erp /etc/nginx/sites-enabled/zcc-erp
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# ── 10. Firewall ─────────────────────────────────────────────────────────────
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# ── 11. PM2 startup on boot ──────────────────────────────────────────────────
sudo -u "$DEPLOY_USER" pm2 startup systemd -u "$DEPLOY_USER" --hp "/home/$DEPLOY_USER" | tail -1 | bash

# ── 12. Backup cron (daily at 02:00) ─────────────────────────────────────────
(crontab -l -u "$DEPLOY_USER" 2>/dev/null; echo "0 2 * * * /var/www/zcc-erp/app/zcceprsystem/deploy/backup.sh >> /var/www/zcc-erp/shared/logs/backup.log 2>&1") \
  | crontab -u "$DEPLOY_USER" -

# ── 13. Deploy script ────────────────────────────────────────────────────────
cp "$APP_BASE/app/zcceprsystem/deploy/deploy.sh" "$APP_BASE/deploy.sh"
chmod +x "$APP_BASE/deploy.sh"
chown "$DEPLOY_USER:$DEPLOY_USER" "$APP_BASE/deploy.sh"

echo ""
echo "  ✓ Server setup complete."
echo ""
echo "  NEXT STEPS:"
echo "  1. Verify /var/www/zcc-erp/shared/.env  has correct values"
echo "  2. Import your database: mysql -u $DB_USER -p $DB_NAME < your_backup.sql"
echo "  3. Mark existing migrations: cd /var/www/zcc-erp/app/zcceprsystem/backend && npm run migrate:mark-all"
echo "  4. SSL: certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m admin@yourdomain.com"
echo "  5. First deploy: /var/www/zcc-erp/deploy.sh"
echo ""
