/**
 * PM2 ecosystem para /var/www/app
 */

module.exports = {
  apps: [
    {
      name: "crm-web",
      cwd: "/var/www/app/apps/web",
      script: "npm",
      args: "run start",
      env: {
        NODE_ENV: "production",
        PORT: "3000"
      },
      time: true,
      max_restarts: 5,
      exp_backoff_restart_delay: 5000,
      max_memory_restart: "500M",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false
    },
    {
      name: "crm-api",
      cwd: "/var/www/app/apps/api",
      script: "npm",
      args: "run start",
      env: {
        NODE_ENV: "production",
        PORT: "3006"
      },
      time: true,
      max_restarts: 20,
      exp_backoff_restart_delay: 200,
      max_memory_restart: "300M",
      exec_mode: "fork",
      instances: 1,
      autorestart: true
    },
    {
      name: "crm-worker",
      cwd: "/var/www/app/apps/worker",
      script: "npm",
      args: "run start",
      env: {
        NODE_ENV: "production"
      },
      time: true,
      max_restarts: 20,
      exp_backoff_restart_delay: 200,
      max_memory_restart: "200M",
      exec_mode: "fork",
      instances: 1,
      autorestart: true
    }
  ]
};
