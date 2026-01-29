#!/bin/bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/CavalcanteGestor/Olifant.git}"
DOMAIN="${DOMAIN:-crm.olifant.cloud}"
APP_USER="${APP_USER:-crmapp}"
BASE_DIR="${BASE_DIR:-/opt/crm}"
ENV_DIR="${BASE_DIR}/env"
LOG_DIR="/var/log/crm"
REPO_DIR="${BASE_DIR}/current"

echo "🚀 Iniciando deploy do CRM Olifant..."

# 1) Criar usuário isolado (se não existir)
if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  echo "📝 Criando usuário ${APP_USER}..."
  sudo adduser --disabled-password --gecos "" "${APP_USER}"
else
  echo "✅ Usuário ${APP_USER} já existe"
fi

# 2) Criar diretórios isolados
echo "📁 Criando diretórios..."
sudo mkdir -p "${BASE_DIR}" "${ENV_DIR}" "${LOG_DIR}"
sudo chown -R "${APP_USER}:${APP_USER}" "${BASE_DIR}" "${LOG_DIR}"
sudo chmod 700 "${ENV_DIR}"

# 3) Clonar repositório (ou atualizar se já existir)
if [ -d "${REPO_DIR}/.git" ]; then
  echo "🔄 Atualizando repositório existente..."
  sudo -u "${APP_USER}" bash -c "cd ${REPO_DIR} && git fetch origin && git reset --hard origin/main"
else
  echo "📥 Clonando repositório..."
  sudo rm -rf "${REPO_DIR}"
  sudo -u "${APP_USER}" git clone "${REPO_URL}" "${REPO_DIR}"
fi

# 4) Instalar dependências e buildar
echo "📦 Instalando dependências..."
cd "${REPO_DIR}"
sudo -u "${APP_USER}" npm ci --production=false

echo "🔨 Buildando aplicações..."
sudo -u "${APP_USER}" npm run build

# 5) Criar arquivos de env (se não existirem)
echo "⚙️  Criando arquivos de env..."
for env_file in web.env api.env worker.env; do
  env_path="${ENV_DIR}/${env_file}"
  
  if [ ! -f "${env_path}" ]; then
    # Verificar se existe um exemplo de produção no repositório
    example_file=""
    if [ "${env_file}" == "web.env" ] && [ -f "${REPO_DIR}/apps/web/.env.production.example" ]; then
      example_file="${REPO_DIR}/apps/web/.env.production.example"
    elif [ "${env_file}" == "api.env" ] && [ -f "${REPO_DIR}/apps/api/.env.production.example" ]; then
      example_file="${REPO_DIR}/apps/api/.env.production.example"
    elif [ "${env_file}" == "worker.env" ] && [ -f "${REPO_DIR}/apps/worker/.env.production.example" ]; then
      example_file="${REPO_DIR}/apps/worker/.env.production.example"
    fi

    if [ -n "${example_file}" ]; then
      echo "   📄 Criando ${env_file} a partir de exemplo..."
      sudo -u "${APP_USER}" cp "${example_file}" "${env_path}"
    else
      echo "   📄 Criando ${env_file} vazio..."
      sudo -u "${APP_USER}" touch "${env_path}"
    fi
    
    sudo chmod 600 "${env_path}"
    echo "   ⚠️  ATENÇÃO: Edite ${env_path} e preencha as variáveis antes de iniciar!"
  else
    echo "   ✅ ${env_file} já existe (não sobrescrevendo)"
  fi
done

# 6) Instalar PM2 globalmente (se não estiver instalado)
if ! command -v pm2 &> /dev/null; then
  echo "📦 Instalando PM2..."
  sudo npm install -g pm2
else
  echo "✅ PM2 já está instalado"
fi

# 7) Parar processos PM2 existentes (se houver)
echo "🛑 Parando processos PM2 existentes..."
sudo -u "${APP_USER}" pm2 delete crm-web crm-api crm-worker 2>/dev/null || true

# 8) Iniciar aplicações com PM2
echo "🚀 Iniciando aplicações com PM2..."
sudo -u "${APP_USER}" pm2 start "${REPO_DIR}/ecosystem.config.cjs"
sudo -u "${APP_USER}" pm2 save

# 9) Configurar PM2 para iniciar no boot (se ainda não estiver)
if [ ! -f "/etc/systemd/system/pm2-${APP_USER}.service" ]; then
  echo "⚙️  Configurando PM2 para iniciar no boot..."
  sudo env PATH="${PATH}:/usr/bin" "${APP_USER}" pm2 startup systemd -u "${APP_USER}" --hp "/home/${APP_USER}" | grep sudo | bash || true
fi

# 10) Configurar Nginx
echo "🌐 Configurando Nginx..."
NGINX_CONF="/etc/nginx/sites-available/${DOMAIN}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}"

# Criar config do Nginx (ajustando domínio)
sudo tee "${NGINX_CONF}" > /dev/null <<EOF
# Nginx vhost for: ${DOMAIN}

map \$http_upgrade \$connection_upgrade {
  default upgrade;
  '' close;
}

limit_req_zone \$binary_remote_addr zone=whatsapp_webhook:10m rate=20r/s;

server {
  listen 80;
  server_name ${DOMAIN};
  
  # Redirect to HTTPS (descomente após configurar SSL)
  # return 301 https://\$host\$request_uri;
  
  # Por enquanto, permite HTTP para teste (remova após SSL)
  location / {
    proxy_pass http://127.0.0.1:3005;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;
    proxy_read_timeout 30s;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:3006;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 30s;
  }

  location = /webhooks/whatsapp {
    limit_req zone=whatsapp_webhook burst=200 nodelay;
    proxy_pass http://127.0.0.1:3006;
    proxy_connect_timeout 2s;
    proxy_send_timeout 5s;
    proxy_read_timeout 5s;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}

# Descomente este bloco após configurar SSL com Certbot
# server {
#   listen 443 ssl http2;
#   server_name ${DOMAIN};
#
#   ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
#   ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
#
#   client_max_body_size 25m;
#
#   proxy_set_header Host \$host;
#   proxy_set_header X-Real-IP \$remote_addr;
#   proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
#   proxy_set_header X-Forwarded-Proto \$scheme;
#
#   location / {
#     proxy_pass http://127.0.0.1:3005;
#     proxy_http_version 1.1;
#     proxy_set_header Upgrade \$http_upgrade;
#     proxy_set_header Connection \$connection_upgrade;
#     proxy_read_timeout 30s;
#   }
#
#   location /api/ {
#     proxy_pass http://127.0.0.1:3006;
#     proxy_read_timeout 30s;
#   }
#
#   location = /webhooks/whatsapp {
#     limit_req zone=whatsapp_webhook burst=200 nodelay;
#     proxy_pass http://127.0.0.1:3006;
#     proxy_connect_timeout 2s;
#     proxy_send_timeout 5s;
#     proxy_read_timeout 5s;
#   }
# }
EOF

# Habilitar site
sudo ln -sf "${NGINX_CONF}" "${NGINX_ENABLED}"

# Testar configuração do Nginx
echo "🧪 Testando configuração do Nginx..."
if sudo nginx -t; then
  echo "✅ Configuração do Nginx válida"
  echo "🔄 Recarregando Nginx..."
  sudo systemctl reload nginx
else
  echo "❌ Erro na configuração do Nginx! Corrija antes de continuar."
  exit 1
fi

# 11) Verificar status
echo ""
echo "✅ Deploy concluído!"
echo ""
echo "📊 Status dos processos PM2:"
sudo -u "${APP_USER}" pm2 list

echo ""
echo "🧪 Testes rápidos:"
echo "  - Health check API: curl -sS http://127.0.0.1:3006/api/health"
echo "  - Web local: curl -sS http://127.0.0.1:3005 | head -n 5"
echo ""
echo "⚠️  PRÓXIMOS PASSOS:"
echo "  1. Edite os arquivos de env em ${ENV_DIR}/ e preencha as variáveis:"
echo "     - sudo nano ${ENV_DIR}/web.env"
echo "     - sudo nano ${ENV_DIR}/api.env"
echo "     - sudo nano ${ENV_DIR}/worker.env"
echo ""
echo "  2. Reinicie os processos PM2 após preencher os envs:"
echo "     sudo -u ${APP_USER} pm2 restart all"
echo ""
echo "  3. Configure SSL com Certbot:"
echo "     sudo certbot --nginx -d ${DOMAIN}"
echo "     (Depois edite ${NGINX_CONF} e descomente o bloco HTTPS)"
echo ""
echo "  4. Verifique os logs:"
echo "     sudo tail -f ${LOG_DIR}/*.log"
echo "     sudo -u ${APP_USER} pm2 logs"
echo ""

