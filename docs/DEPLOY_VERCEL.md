# Deploy na Vercel (Frontend Apenas)

## ⚠️ IMPORTANTE: Limitações

O sistema CRMOlifant tem **3 componentes principais**:

1. **Frontend Next.js** (`apps/web`) ✅ **PODE rodar na Vercel**
2. **API Fastify** (`apps/api`) ❌ **NÃO pode rodar na Vercel** (precisa de servidor tradicional)
3. **Worker** (`apps/worker`) ❌ **NÃO pode rodar na Vercel** (precisa rodar continuamente)

### Por que a API e Worker não funcionam na Vercel?

- **Vercel** é otimizada para **serverless functions** (execução sob demanda)
- A **API Fastify** é um servidor HTTP tradicional que precisa estar sempre rodando
- O **Worker** precisa rodar em loop contínuo processando jobs, o que não é compatível com o modelo serverless

## 🎯 Solução Recomendada

### Opção 1: Híbrida (Recomendada para testes)
- **Frontend (Next.js)**: Vercel ✅
- **API + Worker**: VPS, Railway, Render ou Fly.io

### Opção 2: Tudo na VPS (Produção)
- Deploy completo na VPS seguindo `docs/deploy-vps.md`

## 📋 Passo a Passo - Deploy Frontend na Vercel

### 1. Preparação

Certifique-se de que:
- ✅ Você tem uma conta na Vercel (grátis)
- ✅ O código está no GitHub/GitLab/Bitbucket
- ✅ A API está rodando em algum lugar acessível (VPS, Railway, etc.)

### 2. Configurar Variáveis de Ambiente na Vercel

Acesse o dashboard da Vercel e configure as seguintes variáveis:

```bash
# Supabase (obrigatório)
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anon_aqui

# API Backend (URL onde sua API Fastify está rodando)
NEXT_PUBLIC_API_BASE_URL=https://sua-api.com
# Exemplo: https://api.olifant.ialumi.cloud
# Exemplo: https://crm-api.railway.app
```

### 3. Deploy via Vercel CLI (Recomendado)

```bash
# Instalar Vercel CLI globalmente
npm i -g vercel

# Na raiz do projeto
cd apps/web

# Fazer login na Vercel
vercel login

# Deploy (primeira vez)
vercel

# Deploy em produção
vercel --prod
```

### 4. Deploy via Dashboard da Vercel

1. Acesse [vercel.com](https://vercel.com)
2. Clique em "New Project"
3. Importe seu repositório Git
4. Configure:
   - **Framework Preset**: Next.js
   - **Root Directory**: `apps/web`
   - **Build Command**: `npm run build` (ou deixe vazio para auto-detect)
   - **Output Directory**: `.next` (ou deixe vazio para auto-detect)
   - **Install Command**: `npm ci` (ou deixe vazio)
5. Adicione as variáveis de ambiente (seção acima)
6. Clique em "Deploy"

### 5. Configurar Domínio Personalizado (Opcional)

Na Vercel:
1. Vá em Settings → Domains
2. Adicione seu domínio
3. Siga as instruções de DNS

## 🔧 Configuração da API Externa

Como a API não pode rodar na Vercel, você precisa hospedá-la em outro lugar:

### Opção A: VPS (Seguir `docs/deploy-vps.md`)
- Deploy completo da API + Worker na VPS
- Configurar `NEXT_PUBLIC_API_BASE_URL` para apontar para sua VPS

### Opção B: Railway (Fácil e Rápido)
1. Acesse [railway.app](https://railway.app)
2. Crie novo projeto
3. Adicione a API como serviço
4. Configure as variáveis de ambiente
5. Railway fornece URL automática (ex: `https://crm-api.up.railway.app`)

### Opção C: Render
1. Acesse [render.com](https://render.com)
2. Crie novo Web Service
3. Conecte o repositório
4. Configure:
   - **Root Directory**: `apps/api`
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `npm start`
5. Render fornece URL automática

## ⚙️ Variáveis de Ambiente Necessárias

### Para o Frontend (Vercel):
```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
NEXT_PUBLIC_API_BASE_URL=https://sua-api.com
```

### Para a API (Onde estiver hospedada):
```bash
NODE_ENV=production
PORT=3006
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...
SUPABASE_ANON_KEY=eyJxxx...
META_APP_SECRET=xxx
WHATSAPP_VERIFY_TOKEN=xxx
WHATSAPP_ACCESS_TOKEN=xxx
WEB_ORIGIN=https://seu-frontend.vercel.app
```

### Para o Worker (Onde estiver hospedada):
```bash
NODE_ENV=production
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...
WHATSAPP_ACCESS_TOKEN=xxx
META_APP_ID=xxx
META_APP_SECRET=xxx
```

## 🧪 Testando Após Deploy

1. **Frontend na Vercel**:
   - Acesse a URL fornecida pela Vercel
   - Teste login
   - Verifique se consegue carregar conversas

2. **API Externa**:
   ```bash
   curl https://sua-api.com/api/ops/health
   # Deve retornar: {"status":"ok"}
   ```

3. **Integração**:
   - No frontend, tente enviar uma mensagem
   - Verifique os logs da API
   - Confirme que o worker está processando jobs

## 🚨 Problemas Comuns

### Erro: "NEXT_PUBLIC_API_BASE_URL is not defined"
- **Solução**: Configure a variável no dashboard da Vercel e faça novo deploy

### Erro: "CORS policy: No 'Access-Control-Allow-Origin'"
- **Solução**: Na API, configure `WEB_ORIGIN` com a URL do frontend Vercel
- Exemplo: `WEB_ORIGIN=https://crmolifant.vercel.app`

### Frontend carrega mas não consegue chamar API
- Verifique se `NEXT_PUBLIC_API_BASE_URL` está correto
- Verifique se a API está acessível publicamente
- Verifique logs da Vercel (Deployments → View Function Logs)

### Webhook do WhatsApp não funciona
- O webhook precisa apontar para sua API externa, não para Vercel
- Configure no Meta Business Suite: `https://sua-api.com/webhooks/whatsapp`

## 📝 Checklist Final

Antes de considerar o deploy completo:

- [ ] Frontend deployado na Vercel
- [ ] API deployada e acessível publicamente (VPS/Railway/Render)
- [ ] Worker rodando e processando jobs
- [ ] Variáveis de ambiente configuradas corretamente
- [ ] Webhook do WhatsApp apontando para API externa
- [ ] CORS configurado na API permitindo domínio Vercel
- [ ] Testes funcionais realizados

## 💡 Recomendação

Para **testes rápidos**: Use Vercel (frontend) + Railway (API/Worker)
Para **produção**: Use VPS completa seguindo `docs/deploy-vps.md`

---

**⚠️ ATENÇÃO**: Este setup (frontend na Vercel + API externa) funciona para testes, mas para produção recomendamos o deploy completo na VPS para melhor performance, menor latência e controle total.

