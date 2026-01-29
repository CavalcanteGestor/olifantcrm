# 📱 Guia de Configuração do WhatsApp Business API

Este guia explica como configurar o sistema para usar a API oficial do WhatsApp Business da Meta.

## 📋 Pré-requisitos

1. **Conta Meta Business** com acesso ao WhatsApp Business API
2. **App criado no Meta for Developers** (https://developers.facebook.com/)
3. **Token de acesso permanente** do WhatsApp
4. **Phone Number ID** do número de WhatsApp Business
5. **Webhook URL** acessível publicamente (para receber mensagens)

## 🔑 Passo 1: Obter Credenciais da Meta

### 1.1 Criar/Configurar App no Meta for Developers

1. Acesse https://developers.facebook.com/
2. Vá em **Meus Apps** → **Criar App** (ou selecione um existente)
3. Adicione o produto **WhatsApp**
4. Anote:
   - **App ID**
   - **App Secret** (em Configurações → Básico)

### 1.2 Obter Token de Acesso

1. No painel do WhatsApp, vá em **API Setup**
2. Copie o **Temporary Access Token** (válido por 24h)
3. Para token permanente, use o script de renovação automática (veja Passo 4)

### 1.3 Obter Phone Number ID

1. No painel do WhatsApp, vá em **API Setup**
2. Copie o **Phone number ID** (exemplo: `123456789012345`)

### 1.4 Criar Verify Token

Crie um token aleatório para verificação do webhook (exemplo: `meu_token_secreto_123`)

## 🔧 Passo 2: Configurar Variáveis de Ambiente

### 2.1 API (`apps/api/.env`)

Adicione as seguintes variáveis:

```bash
# WhatsApp Webhook
META_APP_SECRET=seu_app_secret_aqui
WHATSAPP_VERIFY_TOKEN=seu_verify_token_aqui

# Opcional: URL pública do webhook (se diferente do padrão)
WEB_ORIGIN=https://seu-dominio.com
```

### 2.2 Worker (`apps/worker/.env`)

Adicione as seguintes variáveis:

```bash
# Token de acesso do WhatsApp
WHATSAPP_ACCESS_TOKEN=seu_token_permanente_aqui

# Versão da API Graph (geralmente v21.0)
META_GRAPH_VERSION=v21.0

# Opcional: para renovação automática do token
META_APP_ID=seu_app_id_aqui
META_APP_SECRET=seu_app_secret_aqui
META_SHORT_LIVED_TOKEN=seu_token_base_aqui
```

## 💾 Passo 3: Configurar WhatsApp Account no Banco de Dados

Execute o seguinte SQL no Supabase (substitua os valores):

```sql
-- Inserir conta WhatsApp para o tenant
INSERT INTO public.whatsapp_accounts (
  tenant_id,
  waba_id,
  phone_number_id,
  business_id,
  verify_token
) VALUES (
  '9b38895a-ce5f-442f-89ea-85db31466432', -- Substitua pelo tenant_id correto
  'seu_waba_id', -- WhatsApp Business Account ID (opcional)
  'seu_phone_number_id', -- Phone Number ID obtido no Passo 1.3
  'seu_business_id', -- Business ID (opcional)
  'seu_verify_token' -- Mesmo token do WHATSAPP_VERIFY_TOKEN
)
ON CONFLICT (tenant_id, phone_number_id) 
DO UPDATE SET
  waba_id = EXCLUDED.waba_id,
  business_id = EXCLUDED.business_id,
  verify_token = EXCLUDED.verify_token;
```

**Nota:** Você pode obter o `tenant_id` executando:

```sql
SELECT id, name FROM tenants;
```

## 🌐 Passo 4: Configurar Webhook no Meta Business Suite

### 4.1 URL do Webhook

O webhook deve ser acessível publicamente. Exemplos:

- **Desenvolvimento local:** Use ngrok ou similar:
  ```bash
  ngrok http 3006
  # Use a URL gerada: https://xxxx.ngrok.io
  ```

- **Produção:** Use sua URL pública:
  ```
  https://seu-dominio.com/webhooks/whatsapp
  ```

### 4.2 Configurar no Meta

1. Acesse https://developers.facebook.com/
2. Vá no seu App → **WhatsApp** → **Configuration**
3. Em **Webhook**, clique em **Edit**
4. Configure:
   - **Callback URL:** `https://seu-dominio.com/webhooks/whatsapp`
   - **Verify Token:** O mesmo valor de `WHATSAPP_VERIFY_TOKEN`
5. Clique em **Verify and Save**
6. Em **Webhook fields**, marque:
   - ✅ `messages`
   - ✅ `message_status`
   - ✅ `message_template_status_update` (opcional)

## 🔄 Passo 5: Renovação Automática do Token (Opcional)

O token do WhatsApp expira. Para renovação automática:

### 5.1 Configurar Script de Renovação

Edite `scripts/refresh-whatsapp-token.js` e configure as variáveis de ambiente.

### 5.2 Adicionar ao Cron (Linux/Mac)

```bash
# Renovar token a cada 50 minutos
*/50 * * * * cd /caminho/do/projeto && node scripts/refresh-whatsapp-token.js
```

## ✅ Passo 6: Verificar Configuração

### 6.1 Testar Webhook

1. Envie uma mensagem para o número do WhatsApp Business
2. Verifique os logs do worker:
   ```bash
   npm run dev:worker
   ```
3. Verifique se a mensagem aparece no banco:
   ```sql
   SELECT * FROM messages ORDER BY created_at DESC LIMIT 5;
   ```

### 6.2 Testar Envio de Mensagem

1. No HUD, selecione uma conversa
2. Envie uma mensagem de texto
3. Verifique se foi enviada:
   ```sql
   SELECT id, direction, status, created_at 
   FROM messages 
   WHERE direction = 'out' 
   ORDER BY created_at DESC 
   LIMIT 5;
   ```

## 🐛 Troubleshooting

### Erro: "whatsapp_not_configured"
- Verifique se `WHATSAPP_ACCESS_TOKEN` está configurado no `worker.env`
- Verifique se o worker está rodando: `npm run dev:worker`

### Erro: "whatsapp_account_not_configured"
- Verifique se há registro na tabela `whatsapp_accounts` para o tenant
- Verifique se o `phone_number_id` está correto

### Webhook não recebe mensagens
- Verifique se a URL do webhook está acessível publicamente
- Verifique se o `META_APP_SECRET` está correto
- Verifique os logs da API: `npm run dev:api`

### Mensagens não são enviadas
- Verifique se o `WHATSAPP_ACCESS_TOKEN` está válido
- Verifique se o worker está processando jobs:
  ```sql
  SELECT * FROM jobs WHERE type = 'wa_send_text' ORDER BY created_at DESC LIMIT 5;
  ```

## 📚 Recursos Adicionais

- [Documentação WhatsApp Business API](https://developers.facebook.com/docs/whatsapp)
- [Meta for Developers](https://developers.facebook.com/)
- [Guia de Webhooks](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks)

## 🔐 Segurança

⚠️ **IMPORTANTE:**
- Nunca commite arquivos `.env` no Git
- Use variáveis de ambiente seguras em produção
- Mantenha o `META_APP_SECRET` e `WHATSAPP_ACCESS_TOKEN` seguros
- Configure HTTPS para o webhook em produção
