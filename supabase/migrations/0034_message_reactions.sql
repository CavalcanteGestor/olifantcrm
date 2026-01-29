-- Migration 0034: Message Reactions

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

alter table public.message_reactions enable row level security;

-- Policies
create policy message_reactions_select on public.message_reactions
  for select to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id
      and m.tenant_id = public.current_tenant_id()
    )
  );

create policy message_reactions_insert on public.message_reactions
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
  );

create policy message_reactions_delete on public.message_reactions
  for delete to authenticated
  using (
    user_id = auth.uid()
  );
