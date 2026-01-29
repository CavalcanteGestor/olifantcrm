# Como Instalar na VPS - Guia Completo

## 🚀 Instalação Rápida (Recomendado)

Depois de clonar o repositório, use o script automático:

```bash
cd /home/usuario/app
bash infra/install-vps.sh
```

O script vai:
1. ✅ Verificar Node.js e PM2
2. ✅ Instalar todas as dependências
3. ⏸️ **PAUSAR** para você criar os arquivos .env
4. ✅ Fazer todos os builds
5. ✅ Iniciar com PM2

**Quando o script pausar**, crie os .env:
```bash
nano apps/api/.env          # Cole o conteúdo e salve (Ctrl+O, Enter, Ctrl+X)
nano apps/worker/.env       # Cole o conteúdo e salve
nano apps/web/.env.production  # Cole o conteúdo e salve
```

Depois pressione ENTER e o script continua sozinho!

---

## 📋 Instalação Manual (Passo a Passo)

## Pré-requisitos na VPS

Antes de começar, sua VPS precisa ter:

```bash
# Verificar se tem Node.js 18+
node --version

# Verificar se tem npm
npm --version

# Se não tiver, instalar:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar PM2 globalmente
sudo npm install -g pm2
```

---

## Passo 1: Clonar do GitHub

```bash
# Conectar na VPS via SSH
ssh usuario@seu-ip-vps

# Navegar para onde quer instalar
cd /home/usuario/

# Clonar o repositório
git clone https://github.com/seu-usuario/seu-repo.git app

# Entrar na pasta
cd app
```

---

## Passo 2: Criar os arquivos .env

**IMPORTANTE:** Os arquivos .env NÃO estão no GitHub por segurança. Você precisa criá-los manualmente.

### 2.1 - Criar .env da API

```bash
cd /home/usuario/app/apps/api
nano .env
```

Cole o conteúdo do seu arquivo local `apps/api/.env.production`:

```env
# Cole aqui as variáveis do seu .env.production local
PORT=3001
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
# etc...
```

Salvar: `Ctrl+O`, Enter, `Ctrl+X`

### 2.2 - Criar .env do Worker

```bash
cd /home/usuario/app/apps/worker
nano .env
```

Cole o conteúdo do seu arquivo local `apps/worker/.env.production`

Salvar: `Ctrl+O`, Enter, `Ctrl+X`

### 2.3 - Criar .env.production do Web

```bash
cd /home/usuario/app/apps/web
nano .env.production
```

Cole o conteúdo do seu arquivo local `apps/web/.env.production`

Salvar: `Ctrl+O`, Enter, `Ctrl+X`

---

## Passo 3: Instalar Dependências

```bash
cd /home/usuario/app

# Instalar dependências root
npm install --production

# Instalar shared (dependência dos outros)
cd packages/shared
npm install --production
cd ../..

# Instalar API
cd apps/api
npm install --production
cd ../..

# Instalar Worker
cd apps/worker
npm install --production
cd ../..

# Instalar Web
cd apps/web
npm install --production
cd ../..
```

---

## Passo 4: Build na VPS

```bash
cd /home/usuario/app

# Build na ordem correta
npm run build --workspace=packages/shared
npm run build --workspace=apps/api
npm run build --workspace=apps/worker
npm run build --workspace=apps/web
```

---

## Passo 5: Iniciar com PM2

```bash
cd /home/usuario/app

# Iniciar todos os serviços
pm2 start ecosystem.config.cjs

# Verificar se está rodando
pm2 status

# Ver logs
pm2 logs

# Salvar configuração do PM2
pm2 save

# Configurar PM2 para iniciar no boot
pm2 startup
# Copie e execute o comando que aparecer
```

---

## Passo 6: Verificar se está funcionando

```bash
# Testar API
curl http://localhost:3001/health

# Ver logs em tempo real
pm2 logs

# Ver status
pm2 status
```

---

## Comandos Úteis

### Ver logs
```bash
pm2 logs              # Todos os logs
pm2 logs api          # Só da API
pm2 logs worker       # Só do Worker
pm2 logs web          # Só do Web
```

### Reiniciar serviços
```bash
pm2 restart all       # Reiniciar tudo
pm2 restart api       # Reiniciar só API
pm2 restart worker    # Reiniciar só Worker
pm2 restart web       # Reiniciar só Web
```

### Parar serviços
```bash
pm2 stop all          # Parar tudo
pm2 stop api          # Parar só API
```

### Deletar processos
```bash
pm2 delete all        # Deletar todos
pm2 delete api        # Deletar só API
```

---

## Como Atualizar (Deploy de novas versões)

```bash
cd /home/usuario/app

# Parar serviços
pm2 stop all

# Puxar código novo do GitHub
git pull origin main

# Instalar novas dependências (se houver)
npm install --production

# Rebuild
npm run build --workspace=packages/shared
npm run build --workspace=apps/api
npm run build --workspace=apps/worker
npm run build --workspace=apps/web

# Reiniciar
pm2 restart all

# Ver logs
pm2 logs
```

---

## Configurar Nginx (Opcional - para domínio)

Se você quiser acessar via domínio (ex: app.seusite.com):

```bash
sudo nano /etc/nginx/sites-available/app
```

Cole:

```nginx
server {
    listen 80;
    server_name seu-dominio.com;

    # Web (Frontend)
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # API (Backend)
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Ativar:

```bash
sudo ln -s /etc/nginx/sites-available/app /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## Troubleshooting

### Erro: "Cannot find module"
```bash
# Reinstalar dependências
cd /home/usuario/app
npm install --production
cd apps/api && npm install --production && cd ../..
cd apps/worker && npm install --production && cd ../..
cd apps/web && npm install --production && cd ../..
```

### Erro: "Port already in use"
```bash
# Ver o que está usando a porta
sudo lsof -i :3001

# Matar processo
pm2 delete all
```

### Erro: "Permission denied"
```bash
# Ajustar permissões
sudo chown -R $USER:$USER /home/usuario/app
chmod -R 755 /home/usuario/app
```

### Ver logs de erro
```bash
pm2 logs --err
```

---

## Checklist Final

- [ ] Node.js 18+ instalado
- [ ] PM2 instalado
- [ ] Repositório clonado do GitHub
- [ ] Arquivos .env criados (API, Worker, Web)
- [ ] Dependências instaladas
- [ ] Build executado com sucesso
- [ ] PM2 iniciado: `pm2 status` mostra todos rodando
- [ ] Logs sem erros: `pm2 logs`
- [ ] API respondendo: `curl http://localhost:3001/health`
- [ ] PM2 configurado para auto-start: `pm2 startup`

---

## Resumo Rápido

```bash
# 1. Clonar
git clone https://github.com/seu-usuario/repo.git app
cd app

# 2. Criar .env (manualmente com nano)
nano apps/api/.env
nano apps/worker/.env
nano apps/web/.env.production

# 3. Instalar
npm install --production
cd packages/shared && npm install --production && cd ../..
cd apps/api && npm install --production && cd ../..
cd apps/worker && npm install --production && cd ../..
cd apps/web && npm install --production && cd ../..

# 4. Build
npm run build --workspace=packages/shared
npm run build --workspace=apps/api
npm run build --workspace=apps/worker
npm run build --workspace=apps/web

# 5. Iniciar
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Pronto! Sistema rodando 24/7 na VPS! 🚀
