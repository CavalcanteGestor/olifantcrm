# Guia de Build e Configuração - Olifant CRM

Este documento explica como configurar, compilar e implantar o projeto.

## Estrutura do Projeto

O projeto é um monorepo gerenciado pelo NPM Workspaces com a seguinte estrutura:

- `apps/web`: Frontend (Next.js)
- `apps/api`: Backend API (Node.js/Express)
- `apps/worker`: Worker de processamento (Node.js)
- `packages/*`: Pacotes compartilhados (se houver)

## Pré-requisitos

- Node.js >= 20
- NPM

## Configuração de Variáveis de Ambiente (.env)

O sistema utiliza arquivos `.env` para configuração. Em produção, eles são carregados de `/opt/crm/env/`.

### Localização dos Arquivos
- **Produção (VPS):**
  - `/opt/crm/env/web.env` -> Variáveis do Frontend
  - `/opt/crm/env/api.env` -> Variáveis da API
  - `/opt/crm/env/worker.env` -> Variáveis do Worker

### Como criar os arquivos .env

Crie um arquivo para cada serviço com as chaves necessárias.

#### Exemplo: `api.env` e `worker.env`
```ini
NODE_ENV=production
PORT=3006
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role
# Para integração com WhatsApp Cloud API
META_GRAPH_VERSION=v21.0
WHATSAPP_ACCESS_TOKEN=seu-token-permanente
```

#### Exemplo: `web.env`
```ini
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anonima
NEXT_PUBLIC_API_URL=https://api.seudominio.com
```

> **Nota:** O carregamento desses arquivos em produção é gerenciado pelo `ecosystem.config.cjs` do PM2.

## Build (Compilação)

Para compilar todo o projeto (todos os workspaces):

```bash
# Na raiz do projeto
npm install
npm run build
```

Isso executará o script de build de cada aplicação (`apps/web`, `apps/api`, `apps/worker`) em paralelo ou sequência, gerando as pastas `dist` ou `.next`.

### Build Individual

Se precisar compilar apenas um serviço:

```bash
# Apenas a API
npm run build -w apps/api

# Apenas o Worker
npm run build -w apps/worker

# Apenas o Web
npm run build -w apps/web
```

## Deploy e Execução (PM2)

O projeto utiliza PM2 para gerenciamento de processos em produção. O arquivo de configuração é `ecosystem.config.cjs`.

### Comandos de Deploy

```bash
# 1. Atualizar código (ex: git pull)
git pull origin main

# 2. Instalar dependências
npm install

# 3. Build
npm run build

# 4. Reiniciar processos PM2
pm2 restart ecosystem.config.cjs
# OU se já estiver rodando:
pm2 restart all
```

### Logs

Para ver os logs de execução:

```bash
pm2 logs
# Ou específico
pm2 logs crm-worker
pm2 logs crm-api
```
