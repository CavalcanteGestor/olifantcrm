# Instruções para Atualizar o CRM Olifant na VPS

## Pré-requisitos
- Acesso SSH à VPS
- Projeto já instalado em `/opt/crm/current`
- Variáveis de ambiente já configuradas em `/opt/crm/env/`

## Passo a Passo para Atualização

### 1. Conectar via SSH
```bash
ssh usuario@seu-servidor
```

### 2. Acessar o diretório do projeto
```bash
cd /opt/crm/current
```

### 3. Verificar status atual do PM2
```bash
sudo -u crmapp pm2 list
```

### 4. Parar os processos PM2 (opcional, mas recomendado)
```bash
sudo -u crmapp pm2 stop all
```

### 5. Fazer backup das variáveis de ambiente (segurança)
```bash
sudo cp -r /opt/crm/env /opt/crm/env.backup.$(date +%Y%m%d_%H%M%S)
```

### 6. Atualizar o código do repositório
```bash
sudo -u crmapp git fetch origin
sudo -u crmapp git reset --hard origin/main
```

**OU se preferir fazer pull:**
```bash
sudo -u crmapp git pull origin main
```

### 7. Instalar/atualizar dependências
```bash
sudo -u crmapp npm ci --production=false
```

### 8. Fazer build das aplicações
```bash
sudo -u crmapp npm run build
```

### 9. Verificar se os arquivos de env ainda existem
```bash
sudo ls -la /opt/crm/env/
```

**Se os arquivos não existirem, crie-os novamente:**
```bash
sudo mkdir -p /opt/crm/env
sudo chown -R crmapp:crmapp /opt/crm/env
sudo chmod 700 /opt/crm/env

# Criar arquivos vazios (você precisará preenchê-los depois)
sudo -u crmapp touch /opt/crm/env/web.env
sudo -u crmapp touch /opt/crm/env/api.env
sudo -u crmapp touch /opt/crm/env/worker.env
sudo chmod 600 /opt/crm/env/*.env
```

**⚠️ IMPORTANTE: Garantir que NODE_ENV=production está configurado**

Verifique se os arquivos de env têm `NODE_ENV=production`:

```bash
# Verificar se NODE_ENV está configurado
grep NODE_ENV /opt/crm/env/web.env || echo "NODE_ENV=production" | sudo tee -a /opt/crm/env/web.env
grep NODE_ENV /opt/crm/env/api.env || echo "NODE_ENV=production" | sudo tee -a /opt/crm/env/api.env
grep NODE_ENV /opt/crm/env/worker.env || echo "NODE_ENV=production" | sudo tee -a /opt/crm/env/worker.env
```

**OU edite manualmente cada arquivo e adicione:**
```bash
sudo nano /opt/crm/env/web.env    # Adicione: NODE_ENV=production
sudo nano /opt/crm/env/api.env    # Adicione: NODE_ENV=production
sudo nano /opt/crm/env/worker.env # Adicione: NODE_ENV=production
```

### 10. Reiniciar os processos PM2
```bash
sudo -u crmapp pm2 restart all
```

**OU se os processos não existirem:**
```bash
sudo -u crmapp pm2 start /opt/crm/current/ecosystem.config.cjs
sudo -u crmapp pm2 save
```

### 11. Verificar status dos processos
```bash
sudo -u crmapp pm2 list
sudo -u crmapp pm2 logs --lines 50
```

### 12. Verificar se está funcionando
```bash
# Testar API
curl -sS http://127.0.0.1:3006/api/health

# Testar Web
curl -sS http://127.0.0.1:3005 | head -n 5
```

## Se algo der errado

### Ver logs detalhados
```bash
sudo -u crmapp pm2 logs
```

### Ver logs específicos
```bash
sudo tail -f /var/log/crm/web.err.log
sudo tail -f /var/log/crm/api.err.log
sudo tail -f /var/log/crm/worker.err.log
```

### Restaurar backup das variáveis (se necessário)
```bash
sudo cp -r /opt/crm/env.backup.* /opt/crm/env
sudo chown -R crmapp:crmapp /opt/crm/env
sudo chmod 700 /opt/crm/env
sudo chmod 600 /opt/crm/env/*.env
```

### Reinstalar dependências (se build falhar)
```bash
cd /opt/crm/current
sudo -u crmapp rm -rf node_modules apps/*/node_modules
sudo -u crmapp npm ci --production=false
sudo -u crmapp npm run build
```

## Comando Completo (Copy-Paste)

Se preferir executar tudo de uma vez:

```bash
cd /opt/crm/current && \
sudo -u crmapp pm2 stop all && \
sudo cp -r /opt/crm/env /opt/crm/env.backup.$(date +%Y%m%d_%H%M%S) && \
sudo -u crmapp git fetch origin && \
sudo -u crmapp git reset --hard origin/main && \
sudo -u crmapp npm ci --production=false && \
sudo -u crmapp npm run build && \
sudo -u crmapp pm2 restart all && \
sudo -u crmapp pm2 save && \
echo "✅ Atualização concluída!" && \
sudo -u crmapp pm2 list
```

## Verificação Final

Após a atualização, verifique:

1. ✅ Processos PM2 rodando: `sudo -u crmapp pm2 list`
2. ✅ Sem erros nos logs: `sudo -u crmapp pm2 logs --lines 20`
3. ✅ API respondendo: `curl http://127.0.0.1:3006/api/health`
4. ✅ Web respondendo: `curl http://127.0.0.1:3005 | head -n 5`
5. ✅ Nginx funcionando: `sudo nginx -t && sudo systemctl status nginx`

## Notas Importantes

- ⚠️ **NÃO** delete os arquivos em `/opt/crm/env/` - eles contêm suas variáveis de ambiente
- ⚠️ **GARANTIR que `NODE_ENV=production` está configurado** em todos os arquivos de env
- ⚠️ O build cria os arquivos otimizados em `dist/` (API e Worker) e `.next/` (Web)
- ⚠️ Os processos rodam em modo produção: `next start` (Web) e `node dist/index.js` (API/Worker)
- ⚠️ Se houver conflitos no git, use `git reset --hard origin/main` para forçar atualização
- ⚠️ Se a build falhar, verifique se Node.js >= 20 está instalado: `node -v`
- ⚠️ Se os processos não iniciarem, verifique os logs: `sudo -u crmapp pm2 logs`

## Aplicar Migrações do Supabase (se necessário)

Se houver novas migrações no diretório `supabase/migrations/`, você precisará aplicá-las:

```bash
# Via Supabase CLI (se instalado)
cd /opt/crm/current
supabase db push

# OU via Dashboard do Supabase
# Acesse o SQL Editor e execute cada arquivo em ordem numérica
```

### ⚠️ IMPORTANTE: Chat Interno

O chat interno entre atendentes está incluído no código e funcionará automaticamente após a atualização, **MAS** você precisa garantir que a migração `0015_internal_chat.sql` foi aplicada no Supabase.

**Para verificar se a tabela existe:**
```sql
-- Execute no SQL Editor do Supabase
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'internal_messages'
);
```

**Se não existir, aplique a migração:**
1. Acesse o SQL Editor no Dashboard do Supabase
2. Execute o conteúdo do arquivo `supabase/migrations/0015_internal_chat.sql`
3. Verifique se a tabela foi criada

O chat interno funciona via:
- ✅ Tabela `internal_messages` no Supabase
- ✅ Realtime subscriptions (Supabase Realtime)
- ✅ Componente `InternalChat` já incluído no código
- ✅ Notificações visuais (sino) quando há mensagens não lidas
