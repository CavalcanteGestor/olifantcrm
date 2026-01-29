# Configuração de Envio de Mensagens WhatsApp

## Como Funciona o Envio

O sistema usa um **sistema de fila assíncrona** para enviar mensagens:

1. **API recebe a requisição** (`/api/conversations/:id/send-text`)
2. **Cria mensagem** na tabela `messages` com status `queued`
3. **Cria job** na tabela `jobs` com tipo `wa_send_text`
4. **Worker processa** os jobs e envia via Meta Graph API
5. **Atualiza status** da mensagem para `sent` após sucesso

## Requisitos para Envio Funcionar

### 1. Variáveis de Ambiente no Worker

**Arquivo: `/opt/crm/env/worker.env`**

```bash
NODE_ENV=production
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
WHATSAPP_ACCESS_TOKEN=seu-token-permanente-aqui
META_APP_ID=seu-app-id
META_APP_SECRET=seu-app-secret
META_GRAPH_VERSION=v21.0
WORKER_POLL_MS=250
```

**⚠️ IMPORTANTE:**
- `WHATSAPP_ACCESS_TOKEN` é **obrigatório** para envio funcionar
- Sem este token, o worker não processará jobs de envio
- O token deve ser um **token permanente** (não expira em 24h)

### 2. Phone Number ID Cadastrado no Banco

**Tabela: `whatsapp_accounts`**

Você precisa ter um registro na tabela `whatsapp_accounts` com:
- `tenant_id`: ID do seu tenant
- `phone_number_id`: ID do número do WhatsApp (obtido no Meta Business Suite)

**Para cadastrar:**
```sql
-- Execute no SQL Editor do Supabase
INSERT INTO public.whatsapp_accounts (tenant_id, phone_number_id)
VALUES (
  'seu-tenant-id-aqui',
  'seu-phone-number-id-aqui'
)
ON CONFLICT (tenant_id, phone_number_id) DO NOTHING;
```

**Onde encontrar o Phone Number ID:**
1. Acesse o Meta Business Suite
2. Vá em Configurações > WhatsApp > Números de telefone
3. Copie o "ID do número de telefone"

### 3. Validação de 24 Horas

O sistema **valida automaticamente** se a conversa está dentro da janela de 24 horas:

- ✅ **Dentro de 24h**: Permite envio de mensagem normal
- ❌ **Fora de 24h**: Bloqueia envio normal, sugere usar template

**Regra:**
- Conta a partir da última mensagem do paciente (`last_patient_message_at`)
- Se não houver última mensagem do paciente, considera fora da janela
- Mensagens fora da janela devem usar templates do WhatsApp

## Verificar se Está Configurado

### 1. Verificar Token no Worker
```bash
# Na VPS
grep WHATSAPP_ACCESS_TOKEN /opt/crm/env/worker.env
```

### 2. Verificar Phone Number ID no Banco
```sql
-- No SQL Editor do Supabase
SELECT tenant_id, phone_number_id 
FROM public.whatsapp_accounts;
```

### 3. Verificar se Worker está Processando
```bash
# Na VPS - ver logs do worker
sudo -u crmapp pm2 logs crm-worker --lines 50 | grep -i "outbound\|whatsapp\|job"
```

### 4. Verificar Jobs na Fila
```sql
-- No SQL Editor do Supabase
SELECT id, type, status, attempts, created_at, last_error
FROM public.jobs
WHERE status IN ('queued', 'processing', 'failed')
ORDER BY created_at DESC
LIMIT 10;
```

## Troubleshooting

### Mensagens não estão sendo enviadas

1. **Verificar se o Worker está rodando:**
   ```bash
   sudo -u crmapp pm2 list
   ```

2. **Verificar se o token está configurado:**
   ```bash
   grep WHATSAPP_ACCESS_TOKEN /opt/crm/env/worker.env
   ```

3. **Verificar logs do worker:**
   ```bash
   sudo -u crmapp pm2 logs crm-worker --lines 100
   ```

4. **Verificar se há jobs na fila:**
   ```sql
   SELECT COUNT(*) FROM public.jobs WHERE status = 'queued';
   ```

5. **Verificar se phone_number_id está cadastrado:**
   ```sql
   SELECT * FROM public.whatsapp_accounts;
   ```

### Erro: "wa_provider_missing_account"

**Causa:** Phone Number ID não cadastrado no banco

**Solução:**
```sql
INSERT INTO public.whatsapp_accounts (tenant_id, phone_number_id)
VALUES ('seu-tenant-id', 'seu-phone-number-id');
```

### Erro: "outside_24h_window"

**Causa:** Tentativa de enviar mensagem fora da janela de 24 horas

**Solução:** Use um template do WhatsApp (botão "Templates" na HUD)

### Jobs ficam em "queued" e não são processados

**Possíveis causas:**
1. Worker não está rodando
2. `WHATSAPP_ACCESS_TOKEN` não está configurado
3. Worker está com erro (verificar logs)

**Solução:**
```bash
# Reiniciar worker
sudo -u crmapp pm2 restart crm-worker

# Verificar logs
sudo -u crmapp pm2 logs crm-worker
```

## Renovação Automática do Token

Para evitar que o token expire, configure renovação automática:

**Arquivo: `/opt/crm/env/token-refresh.env`** (opcional)
```bash
META_APP_ID=seu-app-id
META_APP_SECRET=seu-app-secret
META_SHORT_LIVED_TOKEN=seu-token-base
WHATSAPP_ENV_FILE=/opt/crm/env/worker.env
```

**Cron job (renova a cada 50 minutos):**
```bash
*/50 * * * * cd /opt/crm/current && export $(cat /opt/crm/env/token-refresh.env | xargs) && node scripts/refresh-whatsapp-token.js >> /var/log/crm/token-refresh.log 2>&1
```

## Fluxo Completo

```
1. Usuário digita mensagem na HUD
   ↓
2. Frontend chama API: POST /api/conversations/:id/send-text
   ↓
3. API valida:
   - Conversa existe?
   - Dentro de 24h?
   - Usuário tem permissão?
   ↓
4. API cria:
   - Registro em messages (status: queued)
   - Job em jobs (type: wa_send_text)
   ↓
5. Worker (a cada 250ms):
   - Busca jobs pendentes
   - Processa job
   - Envia via Meta Graph API
   - Atualiza status da mensagem
   ↓
6. Frontend atualiza via Realtime
```

## Status das Mensagens

- `queued`: Aguardando processamento pelo worker
- `sent`: Enviada com sucesso para a Meta
- `delivered`: Entregue ao destinatário (via webhook)
- `read`: Lida pelo destinatário (via webhook)
- `failed`: Falha no envio (verificar `last_error`)

## Monitoramento

Para monitorar o envio de mensagens:

```sql
-- Mensagens por status
SELECT status, COUNT(*) 
FROM public.messages 
WHERE direction = 'out'
GROUP BY status;

-- Jobs por status
SELECT status, COUNT(*) 
FROM public.jobs 
WHERE type LIKE 'wa_send%'
GROUP BY status;

-- Últimas mensagens enviadas
SELECT id, conversation_id, status, created_at, 
       (body_json->>'text') as text
FROM public.messages 
WHERE direction = 'out'
ORDER BY created_at DESC
LIMIT 20;
```
