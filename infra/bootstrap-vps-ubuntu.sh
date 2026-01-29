#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-crm.olifant.cloud}"

sudo apt-get update -y
sudo apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  git \
  gnupg \
  build-essential \
  nginx \
  ufw \
  certbot \
  python3-certbot-nginx

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  sudo npm install -g pm2
fi

sudo systemctl enable --now nginx

sudo ufw allow OpenSSH
sudo ufw allow "Nginx Full"
sudo ufw --force enable

echo "ok"
echo "domain=${DOMAIN}"
echo "node=$(node -v)"
echo "npm=$(npm -v)"
echo "pm2=$(pm2 -v)"
echo "nginx=$(nginx -v 2>&1)"
