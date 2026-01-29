-- Migration 0012: Comentários Internos sobre Atendentes

create table if not exists public.agent_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, -- atendente sobre quem é a nota
  note_text text not null,
  created_by_user_id uuid not null references auth.users(id), -- quem criou a nota
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_notes_user_idx on public.agent_notes(tenant_id, user_id, created_at desc);

alter table public.agent_notes enable row level security;

drop policy if exists agent_notes_select on public.agent_notes;
create policy agent_notes_select on public.agent_notes
  for select to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = auth.uid()
        and ur.tenant_id = agent_notes.tenant_id
        and r.key in ('admin', 'coordenador')
    )
  );

drop policy if exists agent_notes_insert on public.agent_notes;
create policy agent_notes_insert on public.agent_notes
  for insert to authenticated
  with check (
    exists (
      select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = auth.uid()
        and ur.tenant_id = agent_notes.tenant_id
        and r.key in ('admin', 'coordenador')
    )
    and created_by_user_id = auth.uid()
  );

drop policy if exists agent_notes_update on public.agent_notes;
create policy agent_notes_update on public.agent_notes
  for update to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = auth.uid()
        and ur.tenant_id = agent_notes.tenant_id
        and r.key in ('admin', 'coordenador')
    )
    and created_by_user_id = auth.uid()
  );

drop policy if exists agent_notes_delete on public.agent_notes;
create policy agent_notes_delete on public.agent_notes
  for delete to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = auth.uid()
        and ur.tenant_id = agent_notes.tenant_id
        and r.key in ('admin', 'coordenador')
    )
    and created_by_user_id = auth.uid()
  );

