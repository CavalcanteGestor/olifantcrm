-- Migration 0015: Chat Interno entre Atendentes

create table if not exists public.internal_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  from_user_id uuid not null references auth.users(id) on delete cascade,
  to_user_id uuid references auth.users(id) on delete cascade, -- null = mensagem para todos
  conversation_id uuid references public.conversations(id) on delete set null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists internal_messages_tenant_idx on public.internal_messages(tenant_id, created_at desc);
create index if not exists internal_messages_to_user_idx on public.internal_messages(to_user_id, read_at) where to_user_id is not null;
create index if not exists internal_messages_conversation_idx on public.internal_messages(conversation_id);
create index if not exists internal_messages_unread_idx on public.internal_messages(to_user_id, read_at) where to_user_id is not null and read_at is null;

alter table public.internal_messages enable row level security;

-- Políticas RLS
drop policy if exists internal_messages_select on public.internal_messages;
create policy internal_messages_select on public.internal_messages
for select to authenticated
using (tenant_id = public.current_tenant_id() and (
  from_user_id = auth.uid() or 
  to_user_id = auth.uid() or 
  to_user_id is null
));

drop policy if exists internal_messages_insert on public.internal_messages;
create policy internal_messages_insert on public.internal_messages
for insert to authenticated
with check (tenant_id = public.current_tenant_id() and from_user_id = auth.uid());

drop policy if exists internal_messages_update on public.internal_messages;
create policy internal_messages_update on public.internal_messages
for update to authenticated
using (tenant_id = public.current_tenant_id() and to_user_id = auth.uid())
with check (tenant_id = public.current_tenant_id() and to_user_id = auth.uid());

comment on table public.internal_messages is 'Mensagens internas entre atendentes';
comment on column public.internal_messages.to_user_id is 'null = mensagem para todos do tenant';
