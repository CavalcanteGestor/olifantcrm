# Configurar SSL e Domínio

## Pré-requisitos

1. **DNS configurado**: `crm.olifant.cloud` deve apontar para o IP da VPS
2. **Portas abertas**: 80 (HTTP) e 443 (HTTPS) no firewall
3. **PM2 rodando**: Aplicação já deve estar rodando

## Passo 1: Editar o Script (IMPORTANTE!)

Antes de rodar, edite o email no script:

```bash
nano infra/setup-nginx-ssl.sh
```

Procure e altere esta linha:

```bash
EMAIL="seu-email@exemplo.com"  # ALTERE AQUI!
```

Para:

```bash
EMAIL="seu-email-real@gmail.com"  # Seu email real
```

Salvar: `Ctrl+O` → `Enter` → `Ctrl+X`

## Passo 2: Executar o Script

```bash
cd /var/www/app
sudo bash infra/setup-nginx-ssl.sh
```

O script vai:
- ✅ Instalar Nginx
- ✅ Instalar Certbot (Let's Encrypt)
- ✅ Configurar proxy reverso
- ✅ Obter certificado SSL
- ✅ Configurar renovação automática
- ✅ Configurar firewall

## Passo 3: Atualizar os .env

Depois que o SSL estiver configurado, atualize os .env:

### 3.1 - API (.env)

```bash
nano apps/api/.env
```

Altere:

```env
WEB_ORIGIN=https://crm.olifant.cloud
```

### 3.2 - Web (.env.production)

```bash
nano apps/web/.env.production
```

Altere:

```env
NEXT_PUBLIC_APP_URL=https://crm.olifant.cloud
NEXT_PUBLIC_API_BASE_URL=https://crm.olifant.cloud
```

## Passo 4: Reiniciar Aplicação

```bash
pm2 restart all
pm2 logs
```

## Passo 5: Testar

Acesse: **https://crm.olifant.cloud**

Deve aparecer com cadeado verde (SSL válido)! 🔒

---

## Comandos Úteis

### Ver status do Nginx

```bash
systemctl status nginx
```

### Testar configuração do Nginx

```bash
nginx -t
```

### Recarregar Nginx (após mudanças)

```bash
sudo systemctl reload nginx
```

### Ver logs do Nginx

```bash
# Logs de acesso
tail -f /var/log/nginx/crm.olifant.cloud.access.log

# Logs de erro
tail -f /var/log/nginx/crm.olifant.cloud.error.log
```

### Ver certificados SSL

```bash
sudo certbot certificates
```

### Testar renovação SSL

```bash
sudo certbot renew --dry-run
```

### Forçar renovação SSL

```bash
sudo certbot renew --force-renewal
```

---

## Troubleshooting

### Erro: "Connection refused"

Verifique se a aplicação está rodando:

```bash
pm2 status
curl http://localhost:3000
curl http://localhost:3006/health
```

### Erro: "502 Bad Gateway"

A aplicação não está respondendo:

```bash
pm2 logs
pm2 restart all
```

### Erro: "Certificate validation failed"

DNS não está configurado corretamente:

```bash
# Verificar DNS
nslookup crm.olifant.cloud

# Deve retornar o IP da sua VPS
```

### Erro: "Port 80 already in use"

Outro serviço está usando a porta 80:

```bash
# Ver o que está usando a porta
sudo lsof -i :80

# Parar Apache se estiver rodando
sudo systemctl stop apache2
sudo systemctl disable apache2
```

### Firewall bloqueando

```bash
# Verificar firewall
sudo ufw status

# Permitir Nginx
sudo ufw allow 'Nginx Full'

# Ou abrir portas manualmente
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

---

## Estrutura de Proxy

```
Internet (HTTPS)
    ↓
Nginx (porta 443)
    ↓
    ├─→ / (Frontend)  → localhost:3000 (Next.js)
    └─→ /api (Backend) → localhost:3006 (Fastify)
```

---

## Renovação Automática

O certificado SSL é renovado automaticamente a cada 60 dias.

Verificar se está configurado:

```bash
sudo systemctl status certbot.timer
```

---

## Resumo Rápido

```bash
# 1. Editar email no script
nano infra/setup-nginx-ssl.sh

# 2. Executar script
sudo bash infra/setup-nginx-ssl.sh

# 3. Atualizar .env
nano apps/api/.env
nano apps/web/.env.production

# 4. Reiniciar
pm2 restart all

# 5. Testar
curl https://crm.olifant.cloud
```

Pronto! Site rodando com SSL! 🚀🔒
