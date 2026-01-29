# 🚀 Deploy via SSH usando Cursor

## ✅ Sim, o Cursor consegue fazer o deploy completo!

O Cursor tem suporte SSH e pode executar comandos remotos. Aqui está como fazer:

## 📋 Pré-requisitos

1. ✅ Cursor conectado via SSH (já configurado)
2. ✅ Repositório atualizado no Git (já feito)
3. ✅ Credenciais do Supabase prontas
4. ✅ Token do WhatsApp pronto
5. ✅ Acesso sudo na VPS

## 🎯 Passo a Passo

### Opção 1: Deploy Automatizado Completo (Recomendado)

No terminal SSH do Cursor, execute:

```bash
# 1. Baixar o script de deploy
cd /tmp
curl -O https://raw.githubusercontent.com/CavalcanteGestor/olifanttest/main/infra/deploy-vps.sh
chmod +x deploy-vps.sh

# 2. Executar o deploy (faz quase tudo automaticamente)
sudo ./deploy-vps.sh
```

O script faz automaticamente:
- ✅ Cria usuário `crmapp` e diretórios
- ✅ Clona/atualiza repositório do Git
- ✅ Instala dependências (`npm ci`)
- ✅ Faz build de tudo (`npm run build`)
- ✅ Cria arquivos de env vazios
- ✅ Instala PM2 (se necessário)
- ✅ Inicia processos PM2
- ✅ Configura Nginx
- ✅ Testa configuração

**O que você ainda precisa fazer manualmente:**
1. Editar arquivos de env e preencher variáveis
2. Reiniciar PM2 após preencher envs
3. Configurar SSL (opcional)

### Opção 2: Se já tiver o código clonado

```bash
cd /opt/crm/current

# Atualizar código
sudo -u crmapp git pull origin main

# Rebuild
sudo -u crmapp npm ci --production=false
sudo -u crmapp npm run build

# Reiniciar processos
sudo -u crmapp pm2 restart all
```

## ⚙️ Configurar Variáveis de Ambiente

Após o deploy automatizado, você precisa preencher os arquivos de env:

### 1. API (`/opt/crm/env/api.env`)

```bash
sudo nano /opt/crm/env/api.env
```

Adicione:
```bash
NODE_ENV=production
PORT=3006
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
META_APP_SECRET=seu_app_secret_aqui
WHATSAPP_VERIFY_TOKEN=seu_token_verificacao_aqui
WEB_ORIGIN=https://olifant.ialumi.cloud
```

### 2. Worker (`/opt/crm/env/worker.env`)

```bash
sudo nano /opt/crm/env/worker.env
```

Adicione:
```bash
NODE_ENV=production
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
WHATSAPP_ACCESS_TOKEN=seu_token_permanente_aqui
META_APP_ID=seu_app_id_aqui
META_APP_SECRET=seu_app_secret_aqui
META_GRAPH_VERSION=v21.0
WORKER_POLL_MS=250
```

### 3. Web (`/opt/crm/env/web.env`)

```bash
sudo nano /opt/crm/env/web.env
```

Adicione:
```bash
NODE_ENV=production
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_API_BASE_URL=https://olifant.ialumi.cloud/api
PORT=3005
```

### 4. Reiniciar após preencher envs

```bash
sudo -u crmapp pm2 restart all
sudo -u crmapp pm2 save
```

## 🧪 Verificar se Deploy Funcionou

```bash
# Ver status dos processos
sudo -u crmapp pm2 list

# Ver logs
sudo -u crmapp pm2 logs

# Testar API
curl http://127.0.0.1:3006/api/health
# Deve retornar: {"ok":true}

# Testar Web
curl http://127.0.0.1:3005
# Deve retornar HTML

# Verificar Nginx
sudo nginx -t
sudo systemctl status nginx
```

## 🔐 Configurar SSL (Opcional mas Recomendado)

```bash
# Instalar Certbot (se não tiver)
sudo apt update
sudo apt install -y certbot python3-certbot-nginx

# Configurar SSL
sudo certbot --nginx -d olifant.ialumi.cloud

# Após configurar SSL, editar nginx e descomentar bloco HTTPS
sudo nano /etc/nginx/sites-available/olifant.ialumi.cloud

# Recarregar Nginx
sudo systemctl reload nginx
```

## 📝 Configurar Webhook WhatsApp

1. Acesse Meta Business Suite
2. Vá em WhatsApp → Configuração → Webhooks
3. Configure:
   - **URL do Callback**: `https://olifant.ialumi.cloud/webhooks/whatsapp`
   - **Token de Verificação**: (mesmo valor de `WHATSAPP_VERIFY_TOKEN` no `api.env`)
4. Verifique a conexão

## 🔄 Atualizações Futuras (Deploy Incremental)

Para atualizar o sistema após mudanças no código:

```bash
# Via SSH no Cursor, execute:
cd /opt/crm/current
sudo -u crmapp git pull origin main
sudo -u crmapp npm ci --production=false
sudo -u crmapp npm run build
sudo -u crmapp pm2 restart all
```

## ⚠️ Comandos Importantes

### Ver logs em tempo real
```bash
sudo -u crmapp pm2 logs
# ou logs específicos:
sudo -u crmapp pm2 logs crm-api
sudo -u crmapp pm2 logs crm-worker
sudo -u crmapp pm2 logs crm-web
```

### Reiniciar serviços específicos
```bash
sudo -u crmapp pm2 restart crm-api
sudo -u crmapp pm2 restart crm-worker
sudo -u crmapp pm2 restart crm-web
```

### Parar todos os serviços
```bash
sudo -u crmapp pm2 stop all
```

### Ver informações dos processos
```bash
sudo -u crmapp pm2 info crm-api
sudo -u crmapp pm2 monit
```

## 🐛 Troubleshooting

### Build falha
```bash
# Verificar Node.js
node -v  # Deve ser >= 20

# Limpar cache e reinstalar
cd /opt/crm/current
sudo -u crmapp rm -rf node_modules package-lock.json
sudo -u crmapp npm ci --production=false
sudo -u crmapp npm run build
```

### PM2 não inicia processos
```bash
# Verificar logs de erro
sudo -u crmapp pm2 logs --err

# Verificar se envs estão preenchidos
sudo cat /opt/crm/env/api.env
sudo cat /opt/crm/env/worker.env
sudo cat /opt/crm/env/web.env
```

### Porta já em uso
```bash
# Verificar o que está usando as portas
sudo ss -ltnp | grep -E ':(3005|3006)'

# Matar processo se necessário
sudo kill -9 <PID>
```

### Nginx retorna 502
```bash
# Verificar se processos estão rodando
sudo -u crmapp pm2 list

# Ver logs do Nginx
sudo tail -f /var/log/nginx/error.log
```

## ✅ Checklist Final

- [ ] Script de deploy executado com sucesso
- [ ] Arquivos de env criados e preenchidos
- [ ] PM2 processos rodando (`pm2 list` mostra 3 processos online)
- [ ] Health check API retorna `{"ok":true}`
- [ ] Web acessível via navegador
- [ ] Nginx configurado e funcionando
- [ ] SSL configurado (opcional)
- [ ] Webhook WhatsApp configurado
- [ ] Teste de envio de mensagem funcionando
- [ ] Teste de recebimento de mensagem funcionando

---

**🎉 Pronto! O sistema está no ar!**

Para qualquer problema, consulte os logs:
- PM2: `sudo -u crmapp pm2 logs`
- Nginx: `sudo tail -f /var/log/nginx/error.log`
- Sistema: `sudo journalctl -u nginx -f`

