# Configuração para Desenvolvimento Local

## Variáveis de Ambiente Necessárias

### 1. `apps/web/.env.local`
```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon-aqui
NEXT_PUBLIC_API_BASE_URL=http://localhost:3006
```

### 2. `apps/api/.env`
```env
NODE_ENV=development
PORT=3006
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key-aqui
SUPABASE_ANON_KEY=sua-chave-anon-aqui
```

### 3. `apps/worker/.env`
```env
NODE_ENV=development
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key-aqui
WORKER_POLL_MS=250
META_GRAPH_VERSION=v21.0
```

## Como Iniciar

1. Crie os arquivos `.env` acima em cada pasta
2. Preencha com suas credenciais do Supabase
3. Execute:
```bash
npm run dev
```

Isso iniciará:
- **Web**: http://localhost:3005 (Next.js)
- **API**: http://localhost:3006 (Fastify)
- **Worker**: Processando jobs em background

## Onde encontrar as credenciais do Supabase

1. Acesse seu projeto no Supabase Dashboard
2. Vá em Settings > API
3. Copie:
   - **Project URL** → `SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** → `SUPABASE_ANON_KEY` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** → `SUPABASE_SERVICE_ROLE_KEY` (mantenha secreto!)
