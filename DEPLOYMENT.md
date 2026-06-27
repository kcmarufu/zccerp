# ZCC Finance ERP — Production Deployment Guide

**Stack:** Node.js 20 LTS (Express + Prisma) · React 18 (CRA static build) · **MySQL 8** · Nginx · PM2 · Ubuntu 22.04 LTS · DigitalOcean Droplet · Hostinger DNS · Let's Encrypt · GitHub Actions (auto-deploy)

> **Important — Database engine note**
> Your `backend/prisma/schema.prisma` declares `provider = "mysql"` and `backend/package.json` includes the `mysql2` driver. This guide therefore deploys **MySQL 8**, which is what the code actually talks to. If you genuinely want PostgreSQL, see **Appendix A** at the end — it is a schema migration, not just a config change.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Why a DigitalOcean Droplet (vs. App Platform)](#2-why-a-digitalocean-droplet-vs-app-platform)
3. [Server Specifications](#3-server-specifications)
4. [Step 1 — Create & Harden the Droplet](#step-1--create--harden-the-droplet)
5. [Step 2 — Install the Runtime Stack](#step-2--install-the-runtime-stack)
6. [Step 3 — MySQL 8 Setup](#step-3--mysql-8-setup)
7. [Step 4 — Application User & Folder Layout](#step-4--application-user--folder-layout)
8. [Step 5 — Connect the Droplet to GitHub (Deploy Key)](#step-5--connect-the-droplet-to-github-deploy-key)
9. [Step 6 — First Manual Deploy (Backend + Frontend)](#step-6--first-manual-deploy-backend--frontend)
10. [Step 7 — PM2 Process Manager](#step-7--pm2-process-manager)
11. [Step 8 — Nginx Reverse Proxy](#step-8--nginx-reverse-proxy)
12. [Step 9 — Hostinger DNS Configuration](#step-9--hostinger-dns-configuration)
13. [Step 10 — Let's Encrypt SSL/HTTPS](#step-10--lets-encrypt-sslhttps)
14. [Step 11 — Firewall (UFW) & Fail2ban](#step-11--firewall-ufw--fail2ban)
15. [Step 12 — GitHub Actions CI/CD (Auto-deploy)](#step-12--github-actions-cicd-auto-deploy)
16. [Step 13 — Automated Database Backups](#step-13--automated-database-backups)
17. [Step 14 — Monitoring, Logs & Restart Procedures](#step-14--monitoring-logs--restart-procedures)
18. [Step 15 — Scaling Strategy](#step-15--scaling-strategy)
19. [Appendix A — Migrating MySQL → PostgreSQL](#appendix-a--migrating-mysql--postgresql)
20. [Appendix B — Troubleshooting Cheat Sheet](#appendix-b--troubleshooting-cheat-sheet)

---

## 1. Architecture Overview

```
                           Internet (HTTPS)
                                 │
                       ┌─────────▼─────────┐
                       │  Hostinger DNS    │  erp.yourdomain.com → 134.x.x.x
                       └─────────┬─────────┘
                                 │
                       ┌─────────▼─────────┐
                       │  DigitalOcean     │   Ubuntu 22.04 Droplet
                       │  UFW: 22, 80, 443 │
                       └─────────┬─────────┘
                                 │
                       ┌─────────▼─────────┐
                       │  Nginx (443/TLS)  │
                       │  Let's Encrypt    │
                       └────┬─────────┬────┘
                            │         │
              /api/*  ──────┘         └────── / (static)
                            │                 │
                  ┌─────────▼─────┐    ┌──────▼─────────────┐
                  │  PM2 cluster  │    │ /var/www/frontend/ │
                  │  Node :5000   │    │ build/ (CRA)       │
                  └─────────┬─────┘    └────────────────────┘
                            │
                  ┌─────────▼─────────┐
                  │  MySQL 8 (local)  │  bound to 127.0.0.1
                  └───────────────────┘
```

**Deploy flow:** push to `main` → GitHub Actions runs lint/test → SSH into Droplet → `git pull` → install/build → `prisma migrate deploy` → `pm2 reload` (zero-downtime).

---

## 2. Why a DigitalOcean Droplet (vs. App Platform)

| Option | Verdict | Reasoning |
|---|---|---|
| **Droplet (recommended)** | ✅ Best fit | Full control over Nginx, MySQL, PM2, file uploads (multer), and cron backups. Cheapest at this scale (~$18–24/mo all in). |
| App Platform | ❌ Skip | Filesystem is ephemeral → breaks `multer` attachment uploads. Forces you onto managed DB ($15+/mo extra). Per-component pricing inflates cost. |
| Managed Kubernetes | ❌ Overkill | Operational overhead is not justified until you have multiple services and >20k req/min. |

**Pick: Droplet + (later) DigitalOcean Spaces for file uploads + Managed MySQL when you outgrow single-node.**

---

## 3. Server Specifications

| Phase | vCPU | RAM | Disk | Plan | Monthly |
|---|---|---|---|---|---|
| **Launch (≤50 users)** | 2 | 4 GB | 80 GB SSD | Basic Premium AMD | **$24** |
| Growth (50–250 users) | 4 | 8 GB | 160 GB SSD | General Purpose | $63 |
| Scale (250+ users) | App Droplet 4/8 + Managed MySQL | — | — | Split tier | $90+ |

Add: **Backups (+20%)** = ~$5/mo · **Reserved IP** (free while attached) · **Monitoring** (free).

**Region:** Pick the one closest to your users — for Zimbabwe, **Frankfurt (fra1)** or **London (lon1)** gives the best latency.

---

## Step 1 — Create & Harden the Droplet

### 1.1 Create the Droplet
1. DigitalOcean → **Create → Droplets**
2. **Image:** Ubuntu 22.04 (LTS) x64
3. **Plan:** Basic → Premium AMD → 2 vCPU / 4 GB
4. **Region:** Frankfurt
5. **Authentication:** **SSH keys** (paste your public key — never use passwords)
6. **Hostname:** `zcc-erp-prod-01`
7. Enable **Backups** and **Monitoring**
8. Create → note the public IPv4 (e.g. `134.209.x.x`)

### 1.2 First login (as root)
```bash
ssh root@134.209.x.x
```

### 1.3 Patch & set timezone
```bash
apt update && apt upgrade -y
apt install -y unattended-upgrades curl git build-essential ufw fail2ban
timedatectl set-timezone Africa/Harare
dpkg-reconfigure -plow unattended-upgrades   # answer Yes
```

### 1.4 Create a sudo user and disable root SSH
```bash
adduser deploy            # set a strong password (store in your manager)
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
```

Edit `/etc/ssh/sshd_config`:
```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

```bash
systemctl restart ssh
# In a NEW terminal, verify: ssh deploy@134.209.x.x — keep root session open until verified.
```

---

## Step 2 — Install the Runtime Stack

All commands below run as `deploy` (with `sudo` where shown).

### 2.1 Node.js 20 LTS via NodeSource
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v20.x
npm -v
```

### 2.2 Global tools
```bash
sudo npm install -g pm2@latest
```

### 2.3 Nginx
```bash
sudo apt install -y nginx
sudo systemctl enable --now nginx
```

---

## Step 3 — MySQL 8 Setup

### 3.1 Install
```bash
sudo apt install -y mysql-server
sudo systemctl enable --now mysql
sudo mysql_secure_installation
```
Answers: validate password = **Yes (level 2)**, remove anonymous = Yes, disallow root remote = Yes, remove test DB = Yes, reload = Yes.

### 3.2 Create app database + user
```bash
sudo mysql
```
```sql
CREATE DATABASE finance_erp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'erp_user'@'localhost' IDENTIFIED WITH caching_sha2_password BY 'CHANGE_THIS_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON finance_erp.* TO 'erp_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 3.3 Bind to localhost only (critical)
Edit `/etc/mysql/mysql.conf.d/mysqld.cnf`:
```
bind-address = 127.0.0.1
```
```bash
sudo systemctl restart mysql
```

### 3.4 Tune for 4 GB RAM (`/etc/mysql/mysql.conf.d/mysqld.cnf` under `[mysqld]`)
```
innodb_buffer_pool_size = 1G
innodb_log_file_size    = 256M
max_connections         = 100
slow_query_log          = 1
slow_query_log_file     = /var/log/mysql/slow.log
long_query_time         = 1
```
```bash
sudo systemctl restart mysql
```

---

## Step 4 — Application User & Folder Layout

```
/var/www/zcc-erp/                      # owned by deploy:www-data, 2775
├── current/                           # git checkout — entire repo
│   ├── backend/
│   │   ├── src/
│   │   ├── prisma/
│   │   ├── uploads/         → symlink to /var/www/zcc-erp/shared/uploads
│   │   ├── logs/            → symlink to /var/www/zcc-erp/shared/logs
│   │   ├── .env             → symlink to /var/www/zcc-erp/shared/backend.env
│   │   └── ecosystem.config.js
│   └── frontend/
│       ├── build/                     # produced by `npm run build`
│       └── .env.production  → symlink to /var/www/zcc-erp/shared/frontend.env
└── shared/                            # survives every deploy
    ├── backend.env
    ├── frontend.env
    ├── uploads/
    └── logs/
```

```bash
sudo mkdir -p /var/www/zcc-erp/shared/{uploads,logs}
sudo chown -R deploy:www-data /var/www/zcc-erp
sudo chmod -R 2775 /var/www/zcc-erp
```

---

## Step 5 — Connect the Droplet to GitHub (Deploy Key)

A **deploy key** is read-only, repo-scoped, and safer than a personal token.

```bash
ssh-keygen -t ed25519 -C "deploy@zcc-erp-prod" -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub
```

1. Copy the printed public key.
2. GitHub → your repo → **Settings → Deploy keys → Add deploy key** → paste → leave **Allow write access** unchecked → Add.

Tell SSH to use this key for github.com — edit `~/.ssh/config`:
```
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/github_deploy
  IdentitiesOnly yes
```
```bash
chmod 600 ~/.ssh/config
ssh -T git@github.com   # expect: "Hi <repo>! You've successfully authenticated…"
```

---

## Step 6 — First Manual Deploy (Backend + Frontend)

### 6.1 Clone
```bash
cd /var/www/zcc-erp
git clone git@github.com:<your-user>/zcceprsystem.git current
cd current
```

### 6.2 Backend environment (`/var/www/zcc-erp/shared/backend.env`)
```env
NODE_ENV=production
PORT=5000

# Prisma reads DATABASE_URL — required
DATABASE_URL="mysql://erp_user:CHANGE_THIS_STRONG_PASSWORD@127.0.0.1:3306/finance_erp"

# Legacy keys still read by some controllers
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=erp_user
DB_PASSWORD=CHANGE_THIS_STRONG_PASSWORD
DB_NAME=finance_erp

JWT_SECRET=<openssl rand -hex 48>
JWT_EXPIRES_IN=8h
JWT_REFRESH_SECRET=<openssl rand -hex 48>
JWT_REFRESH_EXPIRES_IN=7d

RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=300

LOG_LEVEL=info
CORS_ORIGIN=https://erp.yourdomain.com
```

Generate real secrets:
```bash
openssl rand -hex 48        # paste output into JWT_SECRET, run again for refresh
chmod 600 /var/www/zcc-erp/shared/backend.env
ln -sf /var/www/zcc-erp/shared/backend.env /var/www/zcc-erp/current/backend/.env
```

### 6.3 Frontend environment (`/var/www/zcc-erp/shared/frontend.env`)
```env
REACT_APP_API_BASE_URL=https://erp.yourdomain.com/api
GENERATE_SOURCEMAP=false
```
```bash
ln -sf /var/www/zcc-erp/shared/frontend.env /var/www/zcc-erp/current/frontend/.env.production
```

### 6.4 Install + migrate + build
```bash
cd /var/www/zcc-erp/current/backend
npm ci --omit=dev
npx prisma generate
npx prisma migrate deploy        # applies prisma/migrations/* to prod DB
node prisma/seed.js              # ONE TIME ONLY — comment out idempotent runs

cd /var/www/zcc-erp/current/frontend
npm ci
NODE_OPTIONS=--openssl-legacy-provider npm run build
```

### 6.5 Symlink persistent dirs
```bash
cd /var/www/zcc-erp/current/backend
rm -rf uploads logs
ln -s /var/www/zcc-erp/shared/uploads uploads
ln -s /var/www/zcc-erp/shared/logs    logs
```

---

## Step 7 — PM2 Process Manager

Create `/var/www/zcc-erp/current/backend/ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'zcc-erp-api',
    script: 'src/server.js',
    cwd: '/var/www/zcc-erp/current/backend',
    instances: 'max',           // one process per vCPU
    exec_mode: 'cluster',
    autorestart: true,
    watch: false,
    max_memory_restart: '600M',
    env: { NODE_ENV: 'production' },
    error_file:  '/var/www/zcc-erp/shared/logs/pm2-error.log',
    out_file:    '/var/www/zcc-erp/shared/logs/pm2-out.log',
    merge_logs: true,
    time: true,
    kill_timeout: 5000,
  }],
};
```

Boot it:
```bash
cd /var/www/zcc-erp/current/backend
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u deploy --hp /home/deploy
# Copy & run the sudo command pm2 prints
pm2 status
curl http://127.0.0.1:5000/health
```

---

## Step 8 — Nginx Reverse Proxy

`/etc/nginx/sites-available/zcc-erp`:

```nginx
# --- HTTP → HTTPS redirect (Certbot rewrites this after step 10) ---
server {
    listen 80;
    listen [::]:80;
    server_name erp.yourdomain.com;

    # Certbot ACME challenges
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$host$request_uri; }
}

# --- HTTPS (Certbot fills in ssl_certificate paths in step 10) ---
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name erp.yourdomain.com;

    client_max_body_size 25M;       # multer uploads — match Express limit

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    # gzip
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript application/xml+rss text/xml application/x-font-ttf image/svg+xml;

    # Frontend — CRA static build
    root /var/www/zcc-erp/current/frontend/build;
    index index.html;

    location / {
        try_files $uri /index.html;
    }

    # Cache hashed CRA assets aggressively
    location /static/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # Backend API
    location /api/ {
        proxy_pass         http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_read_timeout 90;
    }

    # Health check (optional)
    location = /health {
        proxy_pass http://127.0.0.1:5000/health;
    }
}
```

Enable + test:
```bash
sudo mkdir -p /var/www/certbot
sudo ln -s /etc/nginx/sites-available/zcc-erp /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

---

## Step 9 — Hostinger DNS Configuration

1. Hostinger panel → **Domains → yourdomain.com → DNS / Name servers → DNS records**
2. Delete any conflicting A records for `erp` and `www.erp`.
3. Add:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `erp` | `134.209.x.x` (your Droplet IP) | 300 |
| A | `www.erp` *(optional)* | `134.209.x.x` | 300 |
| CAA | `@` | `0 issue "letsencrypt.org"` | 3600 |

4. Verify propagation:
```bash
dig +short erp.yourdomain.com
# Or: https://dnschecker.org/#A/erp.yourdomain.com
```
Wait until it returns your Droplet IP **before** running Certbot.

---

## Step 10 — Let's Encrypt SSL/HTTPS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d erp.yourdomain.com -d www.erp.yourdomain.com \
     --redirect --hsts --staple-ocsp \
     -m kudakwashecmarufu@gmail.com --agree-tos --no-eff-email
```

Certbot rewrites your Nginx config, adds the cert paths, and installs a renewal timer.

Verify renewal:
```bash
sudo certbot renew --dry-run
sudo systemctl list-timers | grep certbot
```

Hit your domain — you should see a green padlock and the login page.

---

## Step 11 — Firewall (UFW) & Fail2ban

### 11.1 UFW
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status verbose
```

### 11.2 Fail2ban — block brute-force SSH
`/etc/fail2ban/jail.local`:
```ini
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
port    = ssh
```
```bash
sudo systemctl enable --now fail2ban
sudo fail2ban-client status sshd
```

### 11.3 Security baseline checklist
- [x] Root SSH disabled, password auth disabled
- [x] UFW restricts to 22/80/443
- [x] MySQL bound to 127.0.0.1
- [x] Strong JWT secrets (48 random bytes each)
- [x] `helmet` + rate limiting in Express
- [x] HSTS + TLS 1.2/1.3 only (Certbot default)
- [x] Daily unattended-upgrades for security patches
- [x] `.env` file mode 600

---

## Step 12 — GitHub Actions CI/CD (Auto-deploy)

### 12.1 Create a dedicated SSH key for GitHub → Droplet
On your **local machine** (or any safe place — keep the private key in GitHub secrets only):

```bash
ssh-keygen -t ed25519 -f gha_deploy -N "" -C "github-actions"
```

On the Droplet:
```bash
echo "<contents of gha_deploy.pub>" >> /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
```

### 12.2 GitHub repo secrets
Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `DO_HOST` | `134.209.x.x` |
| `DO_USER` | `deploy` |
| `DO_SSH_KEY` | full contents of `gha_deploy` (the private key) |
| `DO_PORT` | `22` |

### 12.3 Deploy script on the server
`/var/www/zcc-erp/deploy.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/var/www/zcc-erp/current
LOG=/var/www/zcc-erp/shared/logs/deploy.log
ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
exec >>"$LOG" 2>&1

echo "[$(ts)] === Deploy start ==="
cd "$APP_DIR"

git fetch --all --prune
git reset --hard origin/main
git clean -fd

# --- Backend ---
cd "$APP_DIR/backend"
npm ci --omit=dev
npx prisma generate
npx prisma migrate deploy

# --- Frontend ---
cd "$APP_DIR/frontend"
npm ci
NODE_OPTIONS=--openssl-legacy-provider npm run build

# --- Reload services ---
pm2 reload zcc-erp-api --update-env
sudo /usr/sbin/nginx -t && sudo /bin/systemctl reload nginx

echo "[$(ts)] === Deploy OK ==="
```

```bash
chmod +x /var/www/zcc-erp/deploy.sh
```

Allow `deploy` to reload Nginx without a password — `sudo visudo -f /etc/sudoers.d/deploy`:
```
deploy ALL=(root) NOPASSWD: /usr/sbin/nginx -t, /bin/systemctl reload nginx
```

### 12.4 GitHub Actions workflow
`.github/workflows/deploy.yml`:
```yaml
name: Deploy to DigitalOcean

on:
  push:
    branches: [ main ]
  workflow_dispatch:

concurrency:
  group: deploy-prod
  cancel-in-progress: false

jobs:
  test:
    name: Lint & test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: |
            backend/package-lock.json
            frontend/package-lock.json

      - name: Backend install + lint
        working-directory: backend
        run: |
          npm ci
          npm run lint || true   # remove "|| true" once lint is clean
          # npm test            # enable when you have a green test suite

      - name: Frontend install + typecheck + build
        working-directory: frontend
        run: |
          npm ci
          NODE_OPTIONS=--openssl-legacy-provider npm run build

  deploy:
    name: Deploy
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: SSH and run deploy.sh
        uses: appleboy/ssh-action@v1.0.3
        with:
          host:     ${{ secrets.DO_HOST }}
          username: ${{ secrets.DO_USER }}
          key:      ${{ secrets.DO_SSH_KEY }}
          port:     ${{ secrets.DO_PORT }}
          script_stop: true
          script: |
            /var/www/zcc-erp/deploy.sh
```

Commit, push, and the next push to `main` will:
1. Run CI (lint + build) on GitHub's runner.
2. SSH into the Droplet, pull, install, migrate, build, reload PM2.

---

## Step 13 — Automated Database Backups

### 13.1 Local nightly dump
`/usr/local/bin/zcc-erp-backup.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
BACKUP_DIR=/var/backups/mysql
KEEP_DAYS=14
STAMP=$(date -u +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

mysqldump \
  --defaults-extra-file=/etc/mysql/backup.cnf \
  --single-transaction --quick --routines --triggers --events \
  finance_erp | gzip -9 > "$BACKUP_DIR/finance_erp_${STAMP}.sql.gz"

find "$BACKUP_DIR" -name 'finance_erp_*.sql.gz' -mtime +${KEEP_DAYS} -delete
```

`/etc/mysql/backup.cnf` (mode 600, owned by root):
```ini
[client]
user=erp_user
password=CHANGE_THIS_STRONG_PASSWORD
host=127.0.0.1
```

```bash
sudo chmod 700 /usr/local/bin/zcc-erp-backup.sh
sudo chmod 600 /etc/mysql/backup.cnf
```

### 13.2 Cron (root)
```bash
sudo crontab -e
```
```
15 2 * * *  /usr/local/bin/zcc-erp-backup.sh >> /var/log/zcc-erp-backup.log 2>&1
```

### 13.3 Off-site copy to DigitalOcean Spaces (recommended)
```bash
sudo apt install -y s3cmd
s3cmd --configure   # use Spaces access key + endpoint fra1.digitaloceanspaces.com
```
Append to the backup script:
```bash
s3cmd put "$BACKUP_DIR/finance_erp_${STAMP}.sql.gz" \
         s3://zcc-erp-backups/mysql/ --acl-private
```

### 13.4 Always enable DigitalOcean Droplet backups
DO Control Panel → Droplet → **Backups** → enable. Weekly image snapshot at +20% Droplet cost — your insurance against full-host disasters.

### 13.5 Test the restore (do this at least once)
```bash
gunzip < /var/backups/mysql/finance_erp_YYYYMMDD_HHMMSS.sql.gz | \
  mysql -u erp_user -p finance_erp_restore_test
```
**A backup you have never restored is not a backup.**

---

## Step 14 — Monitoring, Logs & Restart Procedures

### 14.1 Where to look

| What | Where | Command |
|---|---|---|
| API stdout/stderr | `/var/www/zcc-erp/shared/logs/pm2-*.log` | `pm2 logs zcc-erp-api` |
| API live status | PM2 | `pm2 status`, `pm2 monit` |
| Nginx access | `/var/log/nginx/access.log` | `sudo tail -f /var/log/nginx/access.log` |
| Nginx errors | `/var/log/nginx/error.log` | `sudo tail -f /var/log/nginx/error.log` |
| MySQL errors | `/var/log/mysql/error.log` | `sudo tail -f /var/log/mysql/error.log` |
| MySQL slow queries | `/var/log/mysql/slow.log` | `sudo mysqldumpslow -t 10 /var/log/mysql/slow.log` |
| Deploy history | `/var/www/zcc-erp/shared/logs/deploy.log` | `tail -f …/deploy.log` |
| Auth/SSH | `/var/log/auth.log` | `sudo tail -f /var/log/auth.log` |
| Fail2ban bans | — | `sudo fail2ban-client status sshd` |

### 14.2 Restart cheat sheet
```bash
pm2 reload zcc-erp-api          # zero-downtime
pm2 restart zcc-erp-api         # hard restart
sudo systemctl reload nginx     # safe Nginx reload
sudo systemctl restart mysql    # mysqld restart (briefly drops connections)
sudo reboot                     # full server reboot
```

### 14.3 Log rotation
PM2 logs grow forever — install the rotation module:
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
```
Nginx + MySQL rotation is handled by stock `/etc/logrotate.d/*` — verify with `sudo logrotate -d /etc/logrotate.conf`.

### 14.4 Health checks
- DigitalOcean **Monitoring** → built-in CPU/RAM/disk/network alerts. Set thresholds: CPU > 80% for 5 min, disk > 80%, memory > 85%.
- **UptimeRobot** (free) → ping `https://erp.yourdomain.com/health` every 5 minutes → email + SMS on outage.

---

## Step 15 — Scaling Strategy

Scale **in this order**, only when metrics demand it:

| Step | Trigger | Action | Effort |
|---|---|---|---|
| 1 | CPU > 70% sustained | Resize Droplet (vertical) | 5 min reboot |
| 2 | RAM-bound | Move to General Purpose 4 vCPU / 8 GB | 5 min reboot |
| 3 | DB CPU dominates | Move MySQL to **DigitalOcean Managed Database** (`mysql://...@private-network:25060/...`) | 1 hr |
| 4 | Disk I/O on uploads | Move `uploads/` to **DigitalOcean Spaces** + CDN; swap `multer` for `multer-s3` | 1–2 days |
| 5 | Single host = SPOF | Add second Droplet → put both behind a **DO Load Balancer** ($12/mo); sessions must be JWT-only (already are) and uploads on Spaces | 1 day |
| 6 | Read-heavy DB | Add MySQL **read replica**, route reports queries to replica | 2 days |
| 7 | Spiky traffic | Front Nginx with **Cloudflare** for caching + WAF + DDoS | 1 hr |

Notes:
- Your Express app already runs in cluster mode → no code change to use all vCPUs after resize.
- Prisma's connection pool defaults to `num_physical_cpus * 2 + 1`; tune via `?connection_limit=20` in `DATABASE_URL` for Managed DB.

---

## Recap — Day-to-Day Workflow

1. Edit code locally.
2. `git commit && git push origin main`.
3. GitHub Actions lints + builds + SSH-deploys.
4. Watch deploy:
   ```bash
   ssh deploy@erp.yourdomain.com 'tail -f /var/www/zcc-erp/shared/logs/deploy.log'
   ```
5. Hot-fix rollback (if needed):
   ```bash
   ssh deploy@erp.yourdomain.com
   cd /var/www/zcc-erp/current
   git log --oneline -n 10
   git reset --hard <previous-good-sha>
   cd backend && npm ci --omit=dev && npx prisma migrate deploy
   cd ../frontend && npm ci && NODE_OPTIONS=--openssl-legacy-provider npm run build
   pm2 reload zcc-erp-api
   ```

---

## Appendix A — Migrating MySQL → PostgreSQL

If you actually want PostgreSQL, it is **not a drop-in swap**:

1. Edit `backend/prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
2. Review the schema for MySQL-only types: `@db.VarChar(n)` → fine, but `@db.MediumText`, `@db.Year`, `@db.UnsignedInt`, `@db.TinyInt(1)` need PG equivalents (`@db.Text`, `Int`, `Boolean`).
3. Replace driver: remove `mysql2` from `package.json`, no PG driver is needed (Prisma ships its own).
4. Generate a fresh baseline:
   ```bash
   rm -rf prisma/migrations
   DATABASE_URL=postgresql://... npx prisma migrate dev --name init
   ```
5. Data migration: dump MySQL via `mysqldump --compatible=postgresql` is unreliable — use **pgloader** instead.
6. Replace MySQL install in Step 3 with:
   ```bash
   sudo apt install -y postgresql-16 postgresql-contrib
   sudo -u postgres createuser --pwprompt erp_user
   sudo -u postgres createdb -O erp_user finance_erp
   ```
7. `DATABASE_URL=postgresql://erp_user:pwd@127.0.0.1:5432/finance_erp?schema=public`.

Plan ~1 day of work and test migrations against a copy of production data.

---

## Appendix B — Troubleshooting Cheat Sheet

| Symptom | First check |
|---|---|
| 502 Bad Gateway | `pm2 status` → API down. `pm2 logs zcc-erp-api --lines 200`. |
| 504 Gateway Timeout | Increase `proxy_read_timeout`; check slow DB queries (`/var/log/mysql/slow.log`). |
| Login works locally, fails in prod | `CORS_ORIGIN` must equal exact prod URL incl. scheme. Check `app.use(cors(...))`. |
| `P1001: Can't reach database` | `systemctl status mysql`, `mysql -u erp_user -p` from shell. |
| GitHub Action hangs on SSH | Confirm `DO_SSH_KEY` is the **private** key (full `-----BEGIN…END-----`), key is added to `authorized_keys`. |
| Cert renewal fails | `sudo certbot renew --dry-run`. Ensure port 80 is open and DNS still points here. |
| Disk full | `du -sh /var/www/zcc-erp/* /var/backups/* /var/log/* | sort -h`; trim PM2 logs / old backups. |
| `prisma migrate deploy` errors on new column | A migration file is missing from the repo — never run `prisma db push` in prod, always commit migrations. |
| File upload returns 413 | `client_max_body_size` in Nginx + `express.json({ limit: '10mb' })` must both be raised. |

---

**End of guide.** Keep this file in the repo and update it whenever the deployment topology changes.
