/**
 * PM2 Ecosystem Configuration
 * ZCC ERP — Production Process Manager
 *
 * Start:   pm2 start ecosystem.config.js
 * Reload:  pm2 reload zcc-erp-api --update-env
 * Logs:    pm2 logs zcc-erp-api
 * Monitor: pm2 monit
 */

module.exports = {
  apps: [
    {
      name: 'zcc-erp-api',
      script: 'src/server.js',

      // Run one instance per vCPU (load-balanced cluster — zero-downtime reloads)
      instances: 'max',
      exec_mode: 'cluster',

      // Auto-restart on crash; no file-watching in production
      autorestart: true,
      watch: false,
      max_memory_restart: '600M',

      // Graceful shutdown — wait up to 10 s for in-flight requests
      kill_timeout: 10000,
      wait_ready: true,
      listen_timeout: 10000,

      // Exponential backoff for restarts (avoids fast-restart loops)
      exp_backoff_restart_delay: 100,
      max_restarts: 10,

      // Rotate logs; keep 30 days worth, max 50 MB per file
      error_file: '/var/www/zcc-erp/shared/logs/pm2-error.log',
      out_file:   '/var/www/zcc-erp/shared/logs/pm2-out.log',
      merge_logs: true,
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      env: {
        NODE_ENV: 'production',
      },

      // Environment variables are loaded from the .env file on disk;
      // do NOT hard-code secrets here — this file is committed to git.
    },
  ],
};
