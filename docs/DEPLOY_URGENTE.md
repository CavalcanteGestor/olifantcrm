# 🚨 DEPLOY URGENTE - 3 HORAS

## ⚠️ IMPORTANTE: Access Verification do Meta

**O Access Verification NÃO bloqueia o uso básico do WhatsApp Business API!**

Você pode usar o WhatsApp normalmente enquanto a verificação está em revisão. A verificação é necessária apenas para:
- Usar múltiplos apps sem restrições
- Funcionalidades avançadas de Tech Provider

**Para uso básico com 1 número, você pode ignorar a verificação por enquanto.**

---

## 🎯 PASSO A PASSO URGENTE

### 1️⃣ Preparar Arquivo Web (.env.local) - LOCAL

Crie o arquivo `apps/web/.env.local` com:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon-aqui
NEXT_PUBLIC_API_BASE_URL=http://localhost:3006
```

**Onde encontrar:**
- Supabase Dashboard → Settings → API
- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- anon public → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 2️⃣ Testar Localmente (OPCIONAL - pode pular se urgente)

```bash
npm run dev
```

Verificar:
- Web: http://localhost:3005
- API: http://localhost:3006/health

### 3️⃣ Deploy na VPS (CRÍTICO)

**Conecte na VPS via SSH:**

```bash
ssh usuario@seu-servidor
```

**Execute o script de atualização:**

```bash
cd /opt/crm/current
sudo bash infra/update-vps.sh
```

**OU manualmente (se script falhar):**

```bash
cd /opt/crm/current
sudo -u crmapp pm2 stop all
sudo -u crmapp git pull origin main
sudo -u crmapp npm ci --production=false
sudo -u crmapp npm run build
sudo -u crmapp pm2 restart all
sudo -u crmapp pm2 save
```

### 4️⃣ Configurar Variáveis de Ambiente na VPS

**Editar arquivos de env:**

```bash
sudo nano /opt/crm/env/web.env
```

**Conteúdo mínimo:**

```env
NODE_ENV=production
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon-aqui
NEXT_PUBLIC_API_BASE_URL=https://seu-dominio.com:3006
```

```bash
sudo nano /opt/crm/env/api.env
```

**Conteúdo mínimo:**

```env
NODE_ENV=production
PORT=3006
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key-aqui
SUPABASE_ANON_KEY=sua-chave-anon-aqui
META_APP_SECRET=seu-app-secret
WHATSAPP_VERIFY_TOKEN=seu-verify-token
WEB_ORIGIN=https://seu-dominio.com
```

```bash
sudo nano /opt/crm/env/worker.env
```

**Conteúdo mínimo:**

```env
NODE_ENV=production
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key-aqui
WORKER_POLL_MS=250
META_GRAPH_VERSION=v21.0
WHATSAPP_ACCESS_TOKEN=seu-access-token
```

**Aplicar permissões:**

```bash
sudo chmod 600 /opt/crm/env/*.env
sudo chown crmapp:crmapp /opt/crm/env/*.env
```

### 5️⃣ Reiniciar Serviços

```bash
sudo -u crmapp pm2 restart all
sudo -u crmapp pm2 logs --lines 50
```

**Verificar se está rodando:**

```bash
sudo -u crmapp pm2 list
```

Deve mostrar:
- ✅ crm-web (online)
- ✅ crm-api (online)
- ✅ crm-worker (online)

### 6️⃣ Configurar WhatsApp na VPS

**Registrar número no banco:**

```sql
-- Execute no Supabase SQL Editor
INSERT INTO whatsapp_accounts (
  tenant_id,
  phone_number_id,
  phone_number,
  waba_id,
  access_token
) VALUES (
  'seu-tenant-id',
  'seu-phone-number-id',
  '+5511999999999',
  'seu-waba-id',
  'seu-access-token'
)
ON CONFLICT (tenant_id, phone_number) 
DO UPDATE SET
  phone_number_id = EXCLUDED.phone_number_id,
  access_token = EXCLUDED.access_token,
  waba_id = EXCLUDED.waba_id;
```

### 7️⃣ Configurar Webhook no Meta

1. Acesse: https://developers.facebook.com/apps
2. Selecione seu app
3. WhatsApp → Configuration
4. Webhook URL: `https://seu-dominio.com:3006/webhooks/whatsapp`
5. Verify Token: (mesmo do `WHATSAPP_VERIFY_TOKEN`)
6. Subscribe to: `messages`, `message_status`

### 8️⃣ Testar

**Health check:**
```bash
curl https://seu-dominio.com:3006/health
```

**Webhook (deve retornar 200):**
```bash
curl https://seu-dominio.com:3006/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=seu-token&hub.challenge=test
```

---

## 🔥 CHECKLIST RÁPIDO

- [ ] Arquivo `apps/web/.env.local` criado localmente
- [ ] Código commitado e pushado no GitHub
- [ ] VPS atualizada (`git pull`)
- [ ] Build feito na VPS (`npm run build`)
- [ ] Arquivos `/opt/crm/env/*.env` configurados
- [ ] PM2 reiniciado (`pm2 restart all`)
- [ ] WhatsApp account registrado no Supabase
- [ ] Webhook configurado no Meta
- [ ] Testes de health check passando

---

## 🆘 SE ALGO DER ERRADO

**Ver logs:**
```bash
sudo -u crmapp pm2 logs
```

**Ver logs específicos:**
```bash
sudo tail -f /var/log/crm/api.err.log
sudo tail -f /var/log/crm/web.err.log
sudo tail -f /var/log/crm/worker.err.log
```

**Reiniciar tudo:**
```bash
sudo -u crmapp pm2 delete all
sudo -u crmapp pm2 start /opt/crm/current/ecosystem.config.cjs
sudo -u crmapp pm2 save
```

---

## 📞 SUPORTE

Se precisar de ajuda urgente, verifique:
1. Logs do PM2
2. Logs do Nginx (se usar proxy reverso)
3. Firewall (portas 3005, 3006 abertas)
4. Certificado SSL válido (se usar HTTPS)
