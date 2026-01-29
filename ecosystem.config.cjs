/* eslint-disable @typescript-eslint/no-var-requires */

const fs = require('fs');
const path = require('path');

/**
 * Carrega variáveis de ambiente de um arquivo .env
 */
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  Arquivo de env não encontrado: ${filePath}`);
    return {};
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};

  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    // Ignora linhas vazias e comentários
    if (trimmed && !trimmed.startsWith('#')) {
      const equalIndex = trimmed.indexOf('=');
      if (equalIndex > 0) {
        const key = trimmed.substring(0, equalIndex).trim();
        const value = trimmed.substring(equalIndex + 1).trim();
        // Remove aspas se houver
        const cleanValue = value.replace(/^["']|["']$/g, '');
        if (key) {
          env[key] = cleanValue;
        }
      }
    }
  });

  return env;
}

// Carrega variáveis de ambiente dos arquivos
const webEnv = loadEnvFile('/opt/crm/env/web.env');
const apiEnv = loadEnvFile('/opt/crm/env/api.env');
const workerEnv = loadEnvFile('/opt/crm/env/worker.env');

/**
 * PM2 ecosystem (produção) — nomes e portas fixas para não conflitar com outros sistemas.
 *
 * Recomendação:
 * - rodar como usuário linux dedicado `crmapp`
 * - manter repo em `/opt/crm/current`
 * - logs em `/var/log/crm/`
 */

module.exports = {
  apps: [
    {
      name: "crm-web",
      cwd: "/opt/crm/current",
      script: "npm",
      args: "run start:pm2 -w apps/web",
      env: {
        ...webEnv,
        NODE_ENV: "production",
        PORT: "3005"
      },
      out_file: "/var/log/crm/web.out.log",
      error_file: "/var/log/crm/web.err.log",
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
      cwd: "/opt/crm/current",
      script: "npm",
      args: "run start -w apps/api",
      env: {
        ...apiEnv,
        NODE_ENV: apiEnv.NODE_ENV || "production",
        PORT: apiEnv.PORT || "3006"
      },
      out_file: "/var/log/crm/api.out.log",
      error_file: "/var/log/crm/api.err.log",
      time: true,
      max_restarts: 20,
      exp_backoff_restart_delay: 200,
      max_memory_restart: "300M",
      exec_mode: "fork",
      instances: 1
    },
    {
      name: "crm-worker",
      cwd: "/opt/crm/current",
      script: "npm",
      args: "run start -w apps/worker",
      env: {
        ...workerEnv,
        NODE_ENV: workerEnv.NODE_ENV || "production"
      },
      out_file: "/var/log/crm/worker.out.log",
      error_file: "/var/log/crm/worker.err.log",
      time: true,
      max_restarts: 20,
      exp_backoff_restart_delay: 200,
      max_memory_restart: "200M",
      exec_mode: "fork",
      instances: 1
    }
  ]
};
