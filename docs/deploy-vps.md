## Deploy na VPS (PM2 + Nginx) — sem conflito com outros sistemas

### VPS do zero (Ubuntu/Debian)

Com a VPS resetada, primeiro instale o básico (Node 20 + Nginx + Certbot + PM2):

```bash
cd /tmp
curl -fsSLO https://raw.githubusercontent.com/CavalcanteGestor/Olifant/main/infra/bootstrap-vps-ubuntu.sh
chmod +x bootstrap-vps-ubuntu.sh
sudo DOMAIN=crm.olifant.cloud ./bootstrap-vps-ubuntu.sh
```

### Premissas

- Você já tem **Nginx** rodando e consegue criar um `server_name` separado.
- Você vai rodar esse CRM com **PM2** (Node direto).
- O código fica em `/opt/crm/current` e roda como usuário `crmapp`.
- Domínio: `crm.olifant.cloud`
- Portas: Web `3005`, API `3006`

### Opção 1: Deploy Automatizado (Recomendado)

Execute o script automatizado que faz tudo para você:

```bash
cd /tmp
curl -O https://raw.githubusercontent.com/CavalcanteGestor/Olifant/main/infra/deploy-vps.sh
chmod +x deploy-vps.sh
sudo DOMAIN=crm.olifant.cloud ./deploy-vps.sh
```

**OU** se já tiver o código clonado:

```bash
cd /opt/crm/current
sudo bash infra/deploy-vps.sh
```

O script faz automaticamente:
- Cria usuário `crmapp` e diretórios isolados
- Clona/atualiza o repositório
- Instala dependências e faz build
- Cria arquivos de env (baseados em examples)
- Configura PM2 com 3 processos
- Configura Nginx para `crm.olifant.cloud`

**Após o script**, você ainda precisa:
1. Editar os arquivos de env em `/opt/crm/env/` e preencher as variáveis
2. Reiniciar os processos PM2: `sudo -u crmapp pm2 restart all`
3. Configurar SSL com Certbot (opcional): `sudo certbot --nginx -d crm.olifant.cloud`

---

### Opção 2: Deploy Manual (Passo a Passo)

Se preferir fazer manualmente ou entender cada etapa:

#### 1) Criar usuário e diretórios

```bash
sudo adduser --disabled-password --gecos "" crmapp
sudo mkdir -p /opt/crm /var/log/crm
sudo chown -R crmapp:crmapp /opt/crm /var/log/crm
```

#### 2) Subir o código

```bash
sudo -u crmapp mkdir -p /opt/crm/current
sudo -u crmapp git clone https://github.com/CavalcanteGestor/olifanttest.git /opt/crm/current
```

#### 3) Instalar deps e buildar

```bash
cd /opt/crm/current
sudo -u crmapp npm ci --production=false
sudo -u crmapp npm run build
```

#### 4) Configurar env

Crie arquivos **fora do repo** (mais seguro e sem conflito com outros sistemas):

- `/opt/crm/env/web.env`
- `/opt/crm/env/api.env`
- `/opt/crm/env/worker.env`

E garanta permissões restritas:

```bash
sudo mkdir -p /opt/crm/env
sudo chown -R crmapp:crmapp /opt/crm/env
sudo chmod 700 /opt/crm/env
sudo chmod 600 /opt/crm/env/*.env
```

O PM2 vai carregar esses arquivos via `env_file` no `ecosystem.config.cjs`.

**Importante**: Crie os arquivos de env e preencha as variáveis:

```bash
# Criar arquivos de env vazios
sudo -u crmapp touch /opt/crm/env/web.env
sudo -u crmapp touch /opt/crm/env/api.env
sudo -u crmapp touch /opt/crm/env/worker.env

# Edite cada arquivo e preencha as variáveis necessárias
sudo nano /opt/crm/env/web.env
sudo nano /opt/crm/env/api.env
sudo nano /opt/crm/env/worker.env
```

**Token do WhatsApp**: No arquivo `worker.env`, configure:

```bash
# Token atual do WhatsApp (será atualizado automaticamente)
WHATSAPP_ACCESS_TOKEN=seu_token_aqui

# Credenciais para renovação automática (obrigatório para renovação automática)
META_APP_ID=seu_app_id
META_APP_SECRET=seu_app_secret
META_SHORT_LIVED_TOKEN=seu_token_base_para_renovacao
```

Para renovação automática do token, configure as variáveis META_APP_ID, META_APP_SECRET e META_SHORT_LIVED_TOKEN no arquivo worker.env.

**Configurar renovação automática do token** (recomendado):

```bash
# Criar arquivo de configuração para renovação
sudo -u crmapp cat > /opt/crm/env/token-refresh.env << 'EOF'
META_APP_ID=seu_app_id_aqui
META_APP_SECRET=seu_app_secret_aqui
META_SHORT_LIVED_TOKEN=seu_token_base_aqui
WHATSAPP_ENV_FILE=/opt/crm/env/worker.env
EOF

# Adicionar cron job (renova a cada 50 minutos)
(sudo -u crmapp crontab -l 2>/dev/null; echo "*/50 * * * * cd /opt/crm/current && export \$(cat /opt/crm/env/token-refresh.env | xargs) && node scripts/refresh-whatsapp-token.js >> /var/log/crm/token-refresh.log 2>&1") | sudo -u crmapp crontab -

# Verificar se foi adicionado
sudo -u crmapp crontab -l
```

#### 5) PM2

```bash
# Instalar PM2 globalmente (se não estiver instalado)
sudo npm i -g pm2

# Iniciar aplicações
sudo -u crmapp pm2 start /opt/crm/current/ecosystem.config.cjs
sudo -u crmapp pm2 save

# Configurar PM2 para iniciar no boot do sistema
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u crmapp --hp /home/crmapp
# (Execute o comando que o PM2 retornar)
```

#### 6) Nginx

```bash
# O script deploy-vps.sh já cria a configuração do Nginx automaticamente
# Se precisar criar manualmente, execute o script deploy-vps.sh novamente
# ou consulte o script para criar a configuração inline

# Habilitar site (se não foi habilitado automaticamente pelo script)
sudo ln -sf /etc/nginx/sites-available/crm.olifant.cloud /etc/nginx/sites-enabled/

# Testar configuração
sudo nginx -t

# Recarregar Nginx
sudo systemctl reload nginx
```

**Configurar SSL (Opcional mas Recomendado)**:

```bash
sudo certbot --nginx -d crm.olifant.cloud
# Depois edite /etc/nginx/sites-available/crm.olifant.cloud e descomente o bloco HTTPS
```

### Portas e Isolamento

O sistema está configurado para rodar isolado:

- **Web (Next.js)**: `127.0.0.1:3005` (apenas localhost)
- **API (Fastify)**: `127.0.0.1:3006` (apenas localhost)
- **Worker**: Sem porta (processo em background)
- **Nginx**: Escuta na porta 80/443 e faz proxy reverso

Isso garante que não há conflitos com outros sistemas rodando na mesma VPS.

### Verificação Pós-Deploy

```bash
# Verificar status dos processos PM2
sudo -u crmapp pm2 list

# Verificar logs
sudo -u crmapp pm2 logs

# Testar health check da API
curl http://127.0.0.1:3006/api/health

# Testar web localmente
curl http://127.0.0.1:3005 | head -n 5

# Verificar configuração do Nginx
sudo nginx -t

# Ver logs do Nginx (se necessário)
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Troubleshooting

**Problemas comuns**:

1. **PM2 não inicia**: Verifique se os arquivos de env estão preenchidos corretamente
   ```bash
   sudo -u crmapp pm2 logs
   ```

2. **Nginx retorna 502**: Verifique se os processos estão rodando
   ```bash
   sudo -u crmapp pm2 list
   ```

3. **Porta já em uso**: Verifique se outro sistema está usando as portas 3005/3006
   ```bash
   sudo ss -ltnp | grep -E ':(3005|3006)'
   ```

4. **Build falha**: Verifique se Node.js >= 20 está instalado
   ```bash
   node -v
   ```

### Atualizações Futuras

Para atualizar o código após alterações:

```bash
cd /opt/crm/current
sudo -u crmapp git pull origin main
sudo -u crmapp npm ci --production=false
sudo -u crmapp npm run build
sudo -u crmapp pm2 restart all
```

---

## Desenvolvimento Local (Windows)

Para rodar localmente no Windows durante o desenvolvimento:

Para desenvolvimento local, crie os arquivos `.env` em cada app:

- `apps/api/.env`
- `apps/worker/.env`
- `apps/web/.env.local`

E rode o dev normalmente:

```powershell
# Terminal 1 - API
npm run dev -w apps/api

# Terminal 2 - Worker
npm run dev -w apps/worker

# Terminal 3 - Web
npm run dev -w apps/web
```

**OU** use o script combinado (se configurado):

```powershell
npm run dev
```

Isso inicia os 3 processos simultaneamente usando `concurrently`.


