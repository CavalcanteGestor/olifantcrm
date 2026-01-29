#!/bin/bash

# Script para configurar Nginx + SSL para crm.olifant.cloud
# Uso: sudo bash infra/setup-nginx-ssl.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ $1${NC}"; }

echo "=========================================="
echo "  Configuração Nginx + SSL"
echo "  Domínio: crm.olifant.cloud"
echo "=========================================="
echo ""

# Verificar se está rodando como root
if [ "$EUID" -ne 0 ]; then 
    print_error "Este script precisa ser executado como root (use sudo)"
    exit 1
fi

# Variáveis
DOMAIN="crm.olifant.cloud"
EMAIL="seu-email@exemplo.com"  # ALTERE AQUI!

print_warning "IMPORTANTE: Certifique-se que o DNS de $DOMAIN aponta para este servidor!"
read -p "Pressione ENTER para continuar ou Ctrl+C para cancelar..."

echo ""
echo "=========================================="
echo "  Passo 1: Instalando Nginx"
echo "=========================================="
echo ""

if ! command -v nginx &> /dev/null; then
    print_info "Instalando Nginx..."
    apt update
    apt install -y nginx
    print_success "Nginx instalado"
else
    print_success "Nginx já instalado"
fi

# Iniciar Nginx
systemctl start nginx
systemctl enable nginx
print_success "Nginx iniciado e habilitado"

echo ""
echo "=========================================="
echo "  Passo 2: Instalando Certbot (Let's Encrypt)"
echo "=========================================="
echo ""

if ! command -v certbot &> /dev/null; then
    print_info "Instalando Certbot..."
    apt install -y certbot python3-certbot-nginx
    print_success "Certbot instalado"
else
    print_success "Certbot já instalado"
fi

echo ""
echo "=========================================="
echo "  Passo 3: Configurando Nginx"
echo "=========================================="
echo ""

# Criar configuração do Nginx
NGINX_CONFIG="/etc/nginx/sites-available/$DOMAIN"

print_info "Criando configuração do Nginx..."

cat > "$NGINX_CONFIG" << 'EOF'
# Configuração para crm.olifant.cloud

# Redirecionar www para não-www
server {
    listen 80;
    listen [::]:80;
    server_name www.crm.olifant.cloud;
    return 301 https://crm.olifant.cloud$request_uri;
}

# Servidor principal
server {
    listen 80;
    listen [::]:80;
    server_name crm.olifant.cloud;

    # Certbot vai adicionar SSL aqui automaticamente

    # Logs
    access_log /var/log/nginx/crm.olifant.cloud.access.log;
    error_log /var/log/nginx/crm.olifant.cloud.error.log;

    # Aumentar tamanho máximo de upload (para imagens/arquivos)
    client_max_body_size 50M;

    # Frontend (Next.js)
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeout para requisições longas
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # API (Backend)
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeout para requisições longas
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # WebSocket (se necessário)
    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
EOF

print_success "Configuração criada em $NGINX_CONFIG"

# Criar link simbólico
if [ -L "/etc/nginx/sites-enabled/$DOMAIN" ]; then
    rm "/etc/nginx/sites-enabled/$DOMAIN"
fi
ln -s "$NGINX_CONFIG" "/etc/nginx/sites-enabled/$DOMAIN"
print_success "Site habilitado"

# Remover configuração padrão se existir
if [ -L "/etc/nginx/sites-enabled/default" ]; then
    rm "/etc/nginx/sites-enabled/default"
    print_info "Configuração padrão removida"
fi

# Testar configuração
print_info "Testando configuração do Nginx..."
nginx -t

if [ $? -eq 0 ]; then
    print_success "Configuração válida"
else
    print_error "Erro na configuração do Nginx"
    exit 1
fi

# Recarregar Nginx
systemctl reload nginx
print_success "Nginx recarregado"

echo ""
echo "=========================================="
echo "  Passo 4: Obtendo Certificado SSL"
echo "=========================================="
echo ""

print_warning "Certifique-se que:"
print_warning "1. O domínio $DOMAIN aponta para este servidor"
print_warning "2. As portas 80 e 443 estão abertas no firewall"
echo ""
read -p "Tudo pronto? Pressione ENTER para continuar..."

print_info "Obtendo certificado SSL..."
certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos --email "$EMAIL" --redirect

if [ $? -eq 0 ]; then
    print_success "Certificado SSL instalado com sucesso!"
else
    print_error "Falha ao obter certificado SSL"
    print_info "Verifique se o DNS está configurado corretamente"
    exit 1
fi

# Configurar renovação automática
print_info "Configurando renovação automática..."
systemctl enable certbot.timer
systemctl start certbot.timer
print_success "Renovação automática configurada"

echo ""
echo "=========================================="
echo "  Passo 5: Configurando Firewall (UFW)"
echo "=========================================="
echo ""

if command -v ufw &> /dev/null; then
    print_info "Configurando firewall..."
    ufw allow 'Nginx Full'
    ufw delete allow 'Nginx HTTP'
    print_success "Firewall configurado"
else
    print_warning "UFW não instalado, pule este passo se usar outro firewall"
fi

echo ""
echo "=========================================="
echo "  ✓ Configuração Concluída!"
echo "=========================================="
echo ""
print_success "Seu site está disponível em:"
echo ""
echo "  🌐 https://crm.olifant.cloud"
echo ""
print_info "Comandos úteis:"
echo "  nginx -t                    - Testar configuração"
echo "  systemctl reload nginx      - Recarregar Nginx"
echo "  systemctl status nginx      - Ver status do Nginx"
echo "  certbot renew --dry-run     - Testar renovação SSL"
echo "  certbot certificates        - Ver certificados instalados"
echo ""
print_warning "Lembre-se de atualizar os .env com as URLs corretas:"
echo "  - apps/web/.env.production: NEXT_PUBLIC_APP_URL=https://crm.olifant.cloud"
echo "  - apps/api/.env: WEB_ORIGIN=https://crm.olifant.cloud"
echo ""
