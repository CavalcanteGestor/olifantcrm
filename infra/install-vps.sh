#!/bin/bash

# Script de instalação automática na VPS
# Uso: bash install-vps.sh

set -e  # Para na primeira falha

echo "=========================================="
echo "  Instalação Automática - VPS"
echo "=========================================="
echo ""

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Função para printar com cor
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Verificar Node.js
echo "Verificando Node.js..."
if ! command -v node &> /dev/null; then
    print_error "Node.js não encontrado!"
    echo "Instale com: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
    exit 1
fi
NODE_VERSION=$(node -v)
print_success "Node.js $NODE_VERSION instalado"

# Verificar PM2
echo "Verificando PM2..."
if ! command -v pm2 &> /dev/null; then
    print_warning "PM2 não encontrado. Instalando..."
    sudo npm install -g pm2
    print_success "PM2 instalado"
else
    print_success "PM2 já instalado"
fi

echo ""
echo "=========================================="
echo "  Passo 1: Instalando Dependências"
echo "=========================================="
echo ""

# Instalar dependências root (COM devDependencies para build)
echo "Instalando dependências root..."
npm install
print_success "Dependências root instaladas"

# Instalar shared (COM devDependencies para build)
echo "Instalando packages/shared..."
cd packages/shared
npm install
cd ../..
print_success "Shared instalado"

# Instalar API (COM devDependencies para build)
echo "Instalando apps/api..."
cd apps/api
npm install
cd ../..
print_success "API instalada"

# Instalar Worker (COM devDependencies para build)
echo "Instalando apps/worker..."
cd apps/worker
npm install
cd ../..
print_success "Worker instalado"

# Instalar Web (COM devDependencies para build)
echo "Instalando apps/web..."
cd apps/web
npm install
cd ../..
print_success "Web instalado"

echo ""
echo "=========================================="
echo "  Passo 2: Configurar Arquivos .env"
echo "=========================================="
echo ""

# Verificar .env da API
if [ ! -f "apps/api/.env" ]; then
    print_warning "Arquivo apps/api/.env não encontrado!"
    echo ""
    echo "Crie o arquivo agora:"
    echo "  nano apps/api/.env"
    echo ""
    read -p "Pressione ENTER depois de criar o arquivo .env da API..."
    
    if [ ! -f "apps/api/.env" ]; then
        print_error "Arquivo apps/api/.env ainda não existe. Abortando."
        exit 1
    fi
fi
print_success "apps/api/.env encontrado"

# Verificar .env do Worker
if [ ! -f "apps/worker/.env" ]; then
    print_warning "Arquivo apps/worker/.env não encontrado!"
    echo ""
    echo "Crie o arquivo agora:"
    echo "  nano apps/worker/.env"
    echo ""
    read -p "Pressione ENTER depois de criar o arquivo .env do Worker..."
    
    if [ ! -f "apps/worker/.env" ]; then
        print_error "Arquivo apps/worker/.env ainda não existe. Abortando."
        exit 1
    fi
fi
print_success "apps/worker/.env encontrado"

# Verificar .env.production do Web
if [ ! -f "apps/web/.env.production" ]; then
    print_warning "Arquivo apps/web/.env.production não encontrado!"
    echo ""
    echo "Crie o arquivo agora:"
    echo "  nano apps/web/.env.production"
    echo ""
    read -p "Pressione ENTER depois de criar o arquivo .env.production do Web..."
    
    if [ ! -f "apps/web/.env.production" ]; then
        print_error "Arquivo apps/web/.env.production ainda não existe. Abortando."
        exit 1
    fi
fi
print_success "apps/web/.env.production encontrado"

echo ""
echo "=========================================="
echo "  Passo 3: Executando Builds"
echo "=========================================="
echo ""

# Build shared
echo "Building packages/shared..."
npm run build --workspace=packages/shared
print_success "Shared buildado"

# Build API
echo "Building apps/api..."
npm run build --workspace=apps/api
print_success "API buildada"

# Build Worker
echo "Building apps/worker..."
npm run build --workspace=apps/worker
print_success "Worker buildado"

# Build Web
echo "Building apps/web..."
npm run build --workspace=apps/web
print_success "Web buildado"

echo ""
echo "=========================================="
echo "  Passo 4: Configurando PM2"
echo "=========================================="
echo ""

# Parar processos antigos se existirem
if pm2 list | grep -q "online\|stopped\|errored"; then
    print_warning "Parando processos PM2 antigos..."
    pm2 delete all || true
fi

# Iniciar com PM2
echo "Iniciando aplicação com PM2..."
pm2 start ecosystem.config.cjs
print_success "Aplicação iniciada"

# Salvar configuração
echo "Salvando configuração PM2..."
pm2 save
print_success "Configuração salva"

# Configurar startup
echo "Configurando PM2 startup..."
pm2 startup | grep "sudo" | bash || print_warning "Execute manualmente o comando de startup que apareceu acima"

echo ""
echo "=========================================="
echo "  Passo 5: Verificando Status"
echo "=========================================="
echo ""

# Aguardar 3 segundos
sleep 3

# Mostrar status
pm2 status

echo ""
echo "=========================================="
echo "  ✓ Instalação Concluída!"
echo "=========================================="
echo ""
echo "Comandos úteis:"
echo "  pm2 logs          - Ver logs em tempo real"
echo "  pm2 status        - Ver status dos processos"
echo "  pm2 restart all   - Reiniciar todos os serviços"
echo "  pm2 stop all      - Parar todos os serviços"
echo ""
echo "Testar API:"
echo "  curl http://localhost:3001/health"
echo ""
print_success "Sistema rodando! 🚀"
