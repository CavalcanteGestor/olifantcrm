-- Migration 0008: Sistema de Avaliações de Conversas

-- Tabela para avaliações dos clientes
create table if not exists public.conversation_ratings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  contact_phone text, -- telefone do cliente que avaliou
  created_at timestamptz not null default now(),
  unique(conversation_id)
);

-- Índices para métricas
create index if not exists conversation_ratings_tenant_idx on public.conversation_ratings(tenant_id, created_at desc);
create index if not exists conversation_ratings_conv_idx on public.conversation_ratings(conversation_id);
create index if not exists conversation_ratings_rating_idx on public.conversation_ratings(tenant_id, rating);

-- RLS
alter table public.conversation_ratings enable row level security;

drop policy if exists conversation_ratings_select on public.conversation_ratings;
create policy conversation_ratings_select on public.conversation_ratings
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

-- Adicionar campo em tenants para mensagem de avaliação customizável
alter table public.tenants
  add column if not exists rating_message_template text 
  default 'Olá! Como foi seu atendimento? De 1 a 5 estrelas, como você avalia?';

