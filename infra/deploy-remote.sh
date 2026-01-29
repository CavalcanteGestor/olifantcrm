#!/usr/bin/env bash
set -euo pipefail

# Deploy remoto do CRM Olifant (copia envs + atualiza código + build + pm2 restart)
#
# Uso (no seu PC):
#   bash infra/deploy-remote.sh \
#     --host SEU_IP_OU_DOMINIO \
#     --user ubuntu \
#     --repo https://github.com/CavalcanteGestor/olifanttest.git \
#     --branch main \
#     --env-dir /opt/crm/env \
#     --repo-dir /opt/crm/current
#
# Pré-requisitos no seu PC:
# - ssh e scp disponíveis (Windows: PowerShell com OpenSSH, ou Git Bash)
# - chave SSH já configurada (ou use ssh-agent)
#
# Pré-requisitos na VPS:
# - Node >= 20, npm, git
# - pm2 instalado (ou o script tenta instalar)

HOST=""
USER_NAME="root"
REPO_URL=""
BRANCH="main"
ENV_DIR="/opt/crm/env"
REPO_DIR="/opt/crm/current"
APP_USER="crmapp"

usage() {
  echo "Uso: $0 --host HOST --user USER --repo REPO_URL [--branch main] [--env-dir /opt/crm/env] [--repo-dir /opt/crm/current] [--app-user crmapp]"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST="$2"; shift 2 ;;
    --user) USER_NAME="$2"; shift 2 ;;
    --repo) REPO_URL="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --env-dir) ENV_DIR="$2"; shift 2 ;;
    --repo-dir) REPO_DIR="$2"; shift 2 ;;
    --app-user) APP_USER="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Argumento desconhecido: $1"; usage; exit 1 ;;
  esac
done

if [[ -z "${HOST}" || -z "${REPO_URL}" ]]; then
  usage
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

LOCAL_API_ENV="${ROOT_DIR}/api.env"
LOCAL_WEB_ENV="${ROOT_DIR}/web.env"
LOCAL_WORKER_ENV="${ROOT_DIR}/worker.env"

echo "🔐 Verificando envs locais..."
for f in "${LOCAL_API_ENV}" "${LOCAL_WEB_ENV}" "${LOCAL_WORKER_ENV}"; do
  if [[ ! -f "${f}" ]]; then
    echo "❌ Arquivo não encontrado: ${f}"
    echo "   Coloque seus envs na raiz do repo (api.env, web.env, worker.env) ou ajuste o script."
    exit 1
  fi
done

SSH_TARGET="${USER_NAME}@${HOST}"

echo "📦 Enviando envs para ${SSH_TARGET}:${ENV_DIR}/ ..."
ssh "${SSH_TARGET}" "sudo mkdir -p '${ENV_DIR}' && sudo chown -R '${APP_USER}:${APP_USER}' '${ENV_DIR}' && sudo chmod 700 '${ENV_DIR}'"
scp "${LOCAL_API_ENV}" "${SSH_TARGET}:/tmp/api.env"
scp "${LOCAL_WEB_ENV}" "${SSH_TARGET}:/tmp/web.env"
scp "${LOCAL_WORKER_ENV}" "${SSH_TARGET}:/tmp/worker.env"
ssh "${SSH_TARGET}" "sudo mv /tmp/api.env '${ENV_DIR}/api.env' && sudo mv /tmp/web.env '${ENV_DIR}/web.env' && sudo mv /tmp/worker.env '${ENV_DIR}/worker.env' && sudo chown '${APP_USER}:${APP_USER}' '${ENV_DIR}'/*.env && sudo chmod 600 '${ENV_DIR}'/*.env"

echo "🚀 Executando deploy remoto..."
ssh "${SSH_TARGET}" "bash -lc '
  set -euo pipefail

  APP_USER=\"${APP_USER}\"
  REPO_DIR=\"${REPO_DIR}\"
  REPO_URL=\"${REPO_URL}\"
  BRANCH=\"${BRANCH}\"

  if ! id -u \"${APP_USER}\" >/dev/null 2>&1; then
    sudo adduser --disabled-password --gecos \"\" \"${APP_USER}\"
  fi

  sudo mkdir -p \"\$(dirname \"${REPO_DIR}\")\"
  sudo chown -R \"${APP_USER}:${APP_USER}\" \"\$(dirname \"${REPO_DIR}\")\"

  if [ -d \"${REPO_DIR}/.git\" ]; then
    sudo -u \"${APP_USER}\" bash -lc \"cd ${REPO_DIR} && git fetch origin && git reset --hard origin/${BRANCH}\"
  else
    sudo -u \"${APP_USER}\" git clone \"${REPO_URL}\" \"${REPO_DIR}\"
    sudo -u \"${APP_USER}\" bash -lc \"cd ${REPO_DIR} && git checkout ${BRANCH}\"
  fi

  if ! command -v pm2 >/dev/null 2>&1; then
    sudo npm i -g pm2
  fi

  sudo -u \"${APP_USER}\" bash -lc \"cd ${REPO_DIR} && npm ci --production=false\"
  sudo -u \"${APP_USER}\" bash -lc \"cd ${REPO_DIR} && npm run build\"

  # Iniciar/reiniciar processos
  if sudo -u \"${APP_USER}\" pm2 list | grep -q \"crm-web\\|crm-api\\|crm-worker\"; then
    sudo -u \"${APP_USER}\" pm2 restart all
  else
    sudo -u \"${APP_USER}\" pm2 start \"${REPO_DIR}/ecosystem.config.cjs\"
  fi
  sudo -u \"${APP_USER}\" pm2 save

  echo \"✅ Deploy concluído\"
  sudo -u \"${APP_USER}\" pm2 list
  echo \"API health: \$(curl -sS http://127.0.0.1:3006/api/health || true)\"
'"

echo "✅ Pronto. Se você usa Nginx, garanta que o vhost/proxy já aponta para 3005/3006."
