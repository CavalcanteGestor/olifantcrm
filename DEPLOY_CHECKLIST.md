# ✅ CHECKLIST DE DEPLOY - VPS

## 📋 Lista de Verificação Completa

**Sistema:** CRM Olifant  
**Data:** 28 Janeiro 2026  
**Status:** 🟢 PRONTO PARA DEPLOY

---

## 🎯 PRÉ-DEPLOY (Local)

### Código
- [x] ✅ Todos os erros corrigidos
- [x] ✅ Console limpo (zero erros)
- [x] ✅ Performance otimizada
- [x] ✅ Segurança implementada
- [x] ✅ Arquivos desnecessários removidos
- [x] ✅ Referências ao desktop removidas
- [x] ✅ Package.json limpo

### Banco de Dados
- [x] ✅ Todas as migrações aplicadas (40)
- [x] ✅ Índices criados (80+)
- [x] ✅ Políticas RLS configuradas (50+)
- [x] ✅ Funções RPC criadas (15+)
- [x] ✅ Performance testada

### Documentação
- [x] ✅ README.md atualizado
- [x] ✅ Guias de deploy criados
- [x] ✅ Estrutura documentada
- [x] ✅ Recomendações listadas

### Git
- [ ] ⏳ Commit final feito
- [ ] ⏳ Push para repositório
- [ ] ⏳ Tag de versão criada (opcional)

---

## 🖥️ PREPARAÇÃO DO VPS

### Servidor
- [ ] ⏳ VPS provisionado
- [ ] ⏳ Ubuntu 20.04+ ou 22.04
- [ ] ⏳ Acesso SSH configurado
- [ ] ⏳ Firewall configurado (portas 80, 443, 22)

### Software Base
- [ ] ⏳ Node.js >= 20 instalado
- [ ] ⏳ npm instalado
- [ ] ⏳ Git instalado
- [ ] ⏳ PM2 instalado globalmente
- [ ] ⏳ Nginx instalado (opcional)

### Domínio (Opcional)
- [ ] ⏳ Domínio registrado
- [ ] ⏳ DNS apontando para VPS
- [ ] ⏳ Certificado SSL (Let's Encrypt)

---

## 🔐 CONFIGURAÇÃO DE CREDENCIAIS

### Supabase
- [ ] ⏳ `SUPABASE_URL` copiado
- [ ] ⏳ `SUPABASE_ANON_KEY` copiado
- [ ] ⏳ `SUPABASE_SERVICE_ROLE_KEY` copiado
- [ ] ⏳ Conexão testada

### WhatsApp API
- [ ] ⏳ `WHATSAPP_PHONE_NUMBER_ID` copiado
- [ ] ⏳ `WHATSAPP_ACCESS_TOKEN` copiado
- [ ] ⏳ `WHATSAPP_VERIFY_TOKEN` definido
- [ ] ⏳ `WHATSAPP_BUSINESS_ACCOUNT_ID` copiado
- [ ] ⏳ Webhook configurado

### URLs
- [ ] ⏳ `API_URL` definido (http://seu-ip:3001)
- [ ] ⏳ `NEXT_PUBLIC_API_URL` definido
- [ ] ⏳ `WEBHOOK_URL` definido (para WhatsApp)

---

## 📦 DEPLOY NO VPS

### 1. Clone do Repositório
```bash
# No VPS
cd /home/seu-usuario
git clone <seu-repositorio> olifant
cd olifant
```
- [ ] ⏳ Repositório clonado
- [ ] ⏳ Branch correto (main/master)

### 2. Bootstrap (Primeira Vez)
```bash
chmod +x infra/bootstrap-vps-ubuntu.sh
sudo ./infra/bootstrap-vps-ubuntu.sh
```
- [ ] ⏳ Script executado com sucesso
- [ ] ⏳ Node.js instalado
- [ ] ⏳ PM2 instalado
- [ ] ⏳ Dependências instaladas

### 3. Configurar Variáveis de Ambiente

#### API (.env)
```bash
cp apps/api/.env.production.example apps/api/.env
nano apps/api/.env
```
- [ ] ⏳ `SUPABASE_URL` configurado
- [ ] ⏳ `SUPABASE_SERVICE_ROLE_KEY` configurado
- [ ] ⏳ `WHATSAPP_*` configurados
- [ ] ⏳ `PORT=3001` configurado

#### Web (.env.production)
```bash
cp apps/web/.env.production.example apps/web/.env.production
nano apps/web/.env.production
```
- [ ] ⏳ `NEXT_PUBLIC_SUPABASE_URL` configurado
- [ ] ⏳ `NEXT_PUBLIC_SUPABASE_ANON_KEY` configurado
- [ ] ⏳ `NEXT_PUBLIC_API_URL` configurado

#### Worker (.env)
```bash
cp apps/worker/.env.production.example apps/worker/.env
nano apps/worker/.env
```
- [ ] ⏳ `SUPABASE_URL` configurado
- [ ] ⏳ `SUPABASE_SERVICE_ROLE_KEY` configurado
- [ ] ⏳ `WHATSAPP_ACCESS_TOKEN` configurado

### 4. Build e Deploy
```bash
chmod +x infra/deploy-vps.sh
./infra/deploy-vps.sh
```
- [ ] ⏳ Dependências instaladas
- [ ] ⏳ Build executado com sucesso
- [ ] ⏳ Sem erros de compilação

### 5. Iniciar Serviços
```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```
- [ ] ⏳ API iniciada (porta 3001)
- [ ] ⏳ Web iniciada (porta 3000)
- [ ] ⏳ Worker iniciado
- [ ] ⏳ PM2 configurado para auto-start

---

## 🧪 TESTES PÓS-DEPLOY

### Testes Básicos
```bash
# Health check da API
curl http://localhost:3001/health

# Teste de conexão com banco
node tools/db-smoke.mjs

# Teste geral do sistema
node tools/smoke-test.mjs
```
- [ ] ⏳ API respondendo (200 OK)
- [ ] ⏳ Conexão com banco OK
- [ ] ⏳ Todos os serviços rodando

### Testes Funcionais
- [ ] ⏳ Login funcionando
- [ ] ⏳ Listagem de conversas OK
- [ ] ⏳ Envio de mensagens OK
- [ ] ⏳ Recebimento de mensagens OK
- [ ] ⏳ Webhook WhatsApp funcionando
- [ ] ⏳ Relatórios carregando
- [ ] ⏳ Admin panel acessível

### Testes de Performance
- [ ] ⏳ Tempo de resposta < 200ms
- [ ] ⏳ Queries otimizadas
- [ ] ⏳ Sem erros no console
- [ ] ⏳ Memória estável

---

## 🔧 CONFIGURAÇÃO NGINX (Opcional)

### Instalar e Configurar
```bash
sudo apt install nginx
sudo nano /etc/nginx/sites-available/olifant
```

### Configuração Básica
```nginx
server {
    listen 80;
    server_name seu-dominio.com;

    # Frontend
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
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Ativar e Testar
```bash
sudo ln -s /etc/nginx/sites-available/olifant /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```
- [ ] ⏳ Nginx configurado
- [ ] ⏳ Site acessível via domínio
- [ ] ⏳ SSL configurado (certbot)

---

## 🔒 SEGURANÇA PÓS-DEPLOY

### Firewall
```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```
- [ ] ⏳ Firewall configurado
- [ ] ⏳ Apenas portas necessárias abertas

### SSL/HTTPS (Opcional)
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d seu-dominio.com
```
- [ ] ⏳ Certificado SSL instalado
- [ ] ⏳ HTTPS funcionando
- [ ] ⏳ Renovação automática configurada

### Backup
```bash
# Criar script de backup
nano /home/seu-usuario/backup.sh
chmod +x /home/seu-usuario/backup.sh

# Adicionar ao cron (diário às 3h)
crontab -e
# 0 3 * * * /home/seu-usuario/backup.sh
```
- [ ] ⏳ Script de backup criado
- [ ] ⏳ Cron configurado
- [ ] ⏳ Backup testado

---

## 📊 MONITORAMENTO

### PM2 Monitoring
```bash
pm2 status
pm2 logs
pm2 monit
```
- [ ] ⏳ Todos os processos rodando
- [ ] ⏳ Sem erros nos logs
- [ ] ⏳ Memória estável

### Logs
```bash
# Ver logs em tempo real
pm2 logs

# Ver logs específicos
pm2 logs api
pm2 logs web
pm2 logs worker
```
- [ ] ⏳ Logs sendo gerados
- [ ] ⏳ Sem erros críticos

### Alertas (Opcional)
- [ ] ⏳ Sentry configurado
- [ ] ⏳ Uptime monitoring configurado
- [ ] ⏳ Alertas de email configurados

---

## 🎯 CONFIGURAÇÃO WHATSAPP

### Webhook
1. Acessar Meta Business Suite
2. Configurar webhook URL: `https://seu-dominio.com/api/webhook/whatsapp`
3. Configurar verify token (mesmo do .env)
4. Subscrever eventos: messages, message_status

- [ ] ⏳ Webhook configurado
- [ ] ⏳ Verificação bem-sucedida
- [ ] ⏳ Eventos subscritos
- [ ] ⏳ Mensagens sendo recebidas

### Testes
- [ ] ⏳ Enviar mensagem de teste
- [ ] ⏳ Receber mensagem de teste
- [ ] ⏳ Status de entrega funcionando
- [ ] ⏳ Mídia funcionando

---

## 📝 PÓS-DEPLOY

### Documentação
- [ ] ⏳ Anotar IP do servidor
- [ ] ⏳ Anotar credenciais de acesso
- [ ] ⏳ Documentar configurações específicas
- [ ] ⏳ Criar runbook de operação

### Treinamento
- [ ] ⏳ Treinar equipe no sistema
- [ ] ⏳ Documentar processos operacionais
- [ ] ⏳ Criar FAQ para usuários

### Manutenção
- [ ] ⏳ Agendar revisões semanais
- [ ] ⏳ Configurar backup automático
- [ ] ⏳ Planejar atualizações futuras

---

## 🚨 TROUBLESHOOTING

### Problema: API não inicia
```bash
# Verificar logs
pm2 logs api

# Verificar porta
netstat -tulpn | grep 3001

# Verificar .env
cat apps/api/.env
```

### Problema: Web não carrega
```bash
# Verificar logs
pm2 logs web

# Verificar build
cd apps/web && npm run build

# Verificar .env
cat apps/web/.env.production
```

### Problema: Webhook não funciona
```bash
# Verificar logs
pm2 logs api | grep webhook

# Testar manualmente
curl -X POST http://localhost:3001/api/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

---

## ✅ CHECKLIST FINAL

### Antes de Considerar Completo
- [ ] ⏳ Todos os serviços rodando
- [ ] ⏳ Testes funcionais passando
- [ ] ⏳ WhatsApp funcionando
- [ ] ⏳ Sem erros nos logs
- [ ] ⏳ Performance aceitável
- [ ] ⏳ Backup configurado
- [ ] ⏳ Monitoramento ativo
- [ ] ⏳ Equipe treinada

### Opcional mas Recomendado
- [ ] ⏳ Domínio configurado
- [ ] ⏳ SSL/HTTPS ativo
- [ ] ⏳ Nginx configurado
- [ ] ⏳ Alertas configurados
- [ ] ⏳ Ambiente de staging

---

## 📞 CONTATOS DE EMERGÊNCIA

### Suporte Técnico
- **Supabase:** https://supabase.com/support
- **WhatsApp API:** https://developers.facebook.com/support
- **Vercel:** https://vercel.com/support (se usar)

### Documentação
- **Supabase Docs:** https://supabase.com/docs
- **WhatsApp API Docs:** https://developers.facebook.com/docs/whatsapp
- **Next.js Docs:** https://nextjs.org/docs

---

## 🎉 DEPLOY COMPLETO!

Quando todos os itens estiverem marcados:

✅ Sistema está em PRODUÇÃO  
✅ Pronto para atender pacientes  
✅ Monitoramento ativo  
✅ Backup configurado  

**Parabéns! 🎊**

---

**Desenvolvido com ❤️ para Clínica Olifant - Pediatria Interdisciplinar**

*Checklist criado em: 28 Janeiro 2026*
