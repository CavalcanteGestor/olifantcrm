# 🚀 DEPLOY DIRETO NA VPS (SEM GITHUB)

## 📦 Método 1: Upload via SCP/SFTP (Recomendado)

### Passo 1: Compactar o projeto localmente

No Windows (PowerShell):
```powershell
# Ir para a pasta pai do projeto
cd C:\Users\caval\OneDrive\Documentos\OlifantV1

# Compactar (excluindo node_modules e arquivos desnecessários)
Compress-Archive -Path OlifantFinal\* -DestinationPath olifant-deploy.zip -Force
```

### Passo 2: Enviar para VPS via SCP

```powershell
# Substitua USER e IP_VPS pelos dados da sua VPS
scp olifant-deploy.zip user@IP_VPS:/home/user/
```

### Passo 3: Na VPS, descompactar e configurar

```bash
# Conectar na VPS
ssh user@IP_VPS

# Descompactar
cd /home/user
unzip olifant-deploy.zip -d olifant-crm

# Entrar no projeto
cd olifant-crm

# Instalar dependências
npm install

# Instalar dependências de cada app
cd apps/api && npm install && cd ../..
cd apps/web && npm install && cd ../..
cd apps/worker && npm install && cd ../..

# Buildar tudo
npm run build
```

---

## 📦 Método 2: Upload via FTP/SFTP (FileZilla)

### Passo 1: Instalar FileZilla
- Download: https://filezilla-project.org/

### Passo 2: Conectar na VPS
- Host: IP da VPS
- Usuário: seu usuário SSH
- Senha: sua senha SSH
- Porta: 22

### Passo 3: Fazer upload
1. Lado esquerdo: navegue até `C:\Users\caval\OneDrive\Documentos\OlifantV1\OlifantFinal`
2. Lado direito: navegue até `/home/user/` (ou onde quiser)
3. Arraste a pasta do projeto para o lado direito
4. Aguarde o upload (pode demorar dependendo da internet)

### Passo 4: Na VPS, configurar
```bash
ssh user@IP_VPS
cd /caminho/onde/fez/upload

# Instalar dependências e buildar
npm install
cd apps/api && npm install && cd ../..
cd apps/web && npm install && cd ../..
cd apps/worker && npm install && cd ../..
npm run build
```

---

## 📦 Método 3: Rsync (Mais rápido para atualizações)

### Primeira vez:
```powershell
# No Windows, instalar rsync via WSL ou Git Bash
# Depois executar:
rsync -avz --exclude 'node_modules' --exclude '.next' --exclude 'dist' C:\Users\caval\OneDrive\Documentos\OlifantV1\OlifantFinal/ user@IP_VPS:/home/user/olifant-crm/
```

### Atualizações futuras:
```powershell
# Mesmo comando, rsync só envia arquivos modificados
rsync -avz --exclude 'node_modules' --exclude '.next' --exclude 'dist' C:\Users\caval\OneDrive\Documentos\OlifantV1\OlifantFinal/ user@IP_VPS:/home/user/olifant-crm/
```

---

## ⚙️ Configuração na VPS

### 1. Criar arquivos .env de produção

```bash
cd /caminho/do/projeto

# API
nano apps/api/.env
# Cole o conteúdo de apps/api/.env.production

# Web
nano apps/web/.env.production
# Cole o conteúdo de apps/web/.env.production.local

# Worker
nano apps/worker/.env
# Cole o conteúdo de apps/worker/.env.production
```

### 2. Buildar o projeto

```bash
# Build da API
cd apps/api
npm run build

# Build da Web
cd ../web
npm run build

# Build do Worker
cd ../worker
npm run build
```

### 3. Configurar PM2

```bash
# Instalar PM2 globalmente
npm install -g pm2

# Iniciar os serviços
pm2 start ecosystem.config.cjs

# Salvar configuração
pm2 save

# Configurar para iniciar no boot
pm2 startup
```

### 4. Configurar Nginx

```bash
sudo nano /etc/nginx/sites-available/olifant-crm
```

Cole a configuração:
```nginx
server {
    listen 80;
    server_name crm.olifant.cloud;

    # Web App
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # API
    location /api {
        proxy_pass http://localhost:3006;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Ativar e reiniciar:
```bash
sudo ln -s /etc/nginx/sites-available/olifant-crm /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 5. Configurar SSL (HTTPS)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d crm.olifant.cloud
```

---

## 🔄 Atualizações Futuras

### Método rápido (Rsync):
```powershell
# No Windows
rsync -avz --exclude 'node_modules' --exclude '.next' --exclude 'dist' C:\Users\caval\OneDrive\Documentos\OlifantV1\OlifantFinal/ user@IP_VPS:/home/user/olifant-crm/
```

### Na VPS:
```bash
cd /caminho/do/projeto

# Instalar novas dependências (se houver)
npm install

# Rebuild
npm run build

# Reiniciar serviços
pm2 restart all
```

---

## 📊 Monitoramento

```bash
# Ver logs
pm2 logs

# Ver status
pm2 status

# Monitorar em tempo real
pm2 monit
```

---

## 🆘 Troubleshooting

### Erro de permissões:
```bash
sudo chown -R $USER:$USER /caminho/do/projeto
```

### Porta já em uso:
```bash
# Ver o que está usando a porta
sudo lsof -i :3000
sudo lsof -i :3006

# Matar processo
sudo kill -9 PID
```

### Rebuild completo:
```bash
# Limpar tudo
rm -rf node_modules apps/*/node_modules
rm -rf apps/*/.next apps/*/dist

# Reinstalar e rebuildar
npm install
npm run build
pm2 restart all
```

---

**Última atualização:** 28/01/2026
