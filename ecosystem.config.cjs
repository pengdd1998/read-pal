module.exports = {
  apps: [
    {
      name: 'read-pal-api',
      cwd: '/home/ubuntu/read-pal/packages/server',
      script: '/home/ubuntu/.local/bin/uv',
      args: 'run uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2',
      time: true,
      env: {
        APP_ENV: 'production',
      },
      max_memory_restart: '500M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/home/ubuntu/.pm2/logs/read-pal-api-error.log',
      out_file: '/home/ubuntu/.pm2/logs/read-pal-api-out.log',
      merge_logs: true,
    },
    {
      name: 'read-pal-web',
      cwd: '/home/ubuntu/read-pal/packages/web',
      script: '/home/ubuntu/read-pal/packages/web/.next/standalone/packages/web/server.js',
      time: true,
      env: {
        HOSTNAME: '0.0.0.0',
        PORT: '3000',
      },
      max_memory_restart: '300M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/home/ubuntu/.pm2/logs/read-pal-web-error.log',
      out_file: '/home/ubuntu/.pm2/logs/read-pal-web-out.log',
      merge_logs: true,
    },
  ],
};
