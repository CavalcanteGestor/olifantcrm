#!/bin/bash
set -euo pipefail

# Script de atualização rápida do CRM Olifant na VPS
# Uso: sudo bash infra/update-vps.sh

APP_USER="crmapp"
REPO_DIR="/opt/crm/current"
ENV_DIR="/opt/crm/env"

echo "🔄 Iniciando atualização do CRM Olifant..."

# Verificar se está no diretório correto
if [ ! -d "${REPO_DIR}/.git" ]; then
  echo "❌ Erro: Diretório ${REPO_DIR} não encontrado ou não é um repositório git"
  exit 1
fi

# 1) Parar processos PM2
echo "🛑 Parando processos PM2..."
sudo -u "${APP_USER}" pm2 stop all 2>/dev/null || echo "⚠️  Nenhum processo PM2 rodando"

# 2) Backup das variáveis de ambiente
if [ -d "${ENV_DIR}" ]; then
  BACKUP_DIR="${ENV_DIR}.backup.$(date +%Y%m%d_%H%M%S)"
  echo "💾 Fazendo backup das variáveis de ambiente em ${BACKUP_DIR}..."
  sudo cp -r "${ENV_DIR}" "${BACKUP_DIR}"
  echo "✅ Backup criado"
else
  echo "⚠️  Diretório de env não encontrado, criando..."
  sudo mkdir -p "${ENV_DIR}"
  sudo chown -R "${APP_USER}:${APP_USER}" "${ENV_DIR}"
  sudo chmod 700 "${ENV_DIR}"
fi

# 3) Atualizar código
echo "📥 Atualizando código do repositório..."
cd "${REPO_DIR}"
sudo -u "${APP_USER}" git fetch origin
sudo -u "${APP_USER}" git reset --hard origin/main
echo "✅ Código atualizado"

# 4) Instalar dependências
echo "📦 Instalando dependências..."
sudo -u "${APP_USER}" npm ci --production=false
echo "✅ Dependências instaladas"

# 5) Build
echo "🔨 Fazendo build das aplicações..."
sudo -u "${APP_USER}" npm run build
echo "✅ Build concluído"

# 6) Verificar arquivos de env
echo "🔍 Verificando arquivos de env..."
for env_file in web.env api.env worker.env; do
  env_path="${ENV_DIR}/${env_file}"
  if [ ! -f "${env_path}" ]; then
    echo "⚠️  Arquivo ${env_file} não encontrado, criando..."
    sudo -u "${APP_USER}" touch "${env_path}"
    sudo chmod 600 "${env_path}"
    echo "   ⚠️  ATENÇÃO: Preencha ${env_path} com as variáveis necessárias!"
  else
    echo "✅ ${env_file} existe"
  fi
  
  # Garantir que NODE_ENV=production está configurado
  if ! grep -q "^NODE_ENV=" "${env_path}" 2>/dev/null; then
    echo "   ⚠️  Adicionando NODE_ENV=production em ${env_file}..."
    echo "NODE_ENV=production" | sudo -u "${APP_USER}" tee -a "${env_path}" > /dev/null
  fi
done

# 7) Reiniciar processos PM2
echo "🚀 Reiniciando processos PM2..."
if sudo -u "${APP_USER}" pm2 list | grep -q "crm-web\|crm-api\|crm-worker"; then
  sudo -u "${APP_USER}" pm2 restart all
else
  echo "   Criando novos processos PM2..."
  sudo -u "${APP_USER}" pm2 start "${REPO_DIR}/ecosystem.config.cjs"
fi
sudo -u "${APP_USER}" pm2 save
echo "✅ Processos PM2 iniciados"

# 8) Verificar status
echo ""
echo "📊 Status dos processos:"
sudo -u "${APP_USER}" pm2 list

echo ""
echo "🧪 Testes rápidos:"
echo "  - Health check API: curl -sS http://127.0.0.1:3006/api/health"
echo "  - Web local: curl -sS http://127.0.0.1:3005 | head -n 5"

echo ""
echo "✅ Atualização concluída!"
echo ""
echo "📝 Próximos passos (se necessário):"
echo "   1. Verificar logs: sudo -u ${APP_USER} pm2 logs"
echo "   2. Verificar se as variáveis de env estão corretas em ${ENV_DIR}/"
echo "   3. Se houver novas migrações, aplicá-las no Supabase"
