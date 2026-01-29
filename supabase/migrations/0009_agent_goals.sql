-- Migration 0009: Metas e Objetivos por Atendente

create table if not exists public.agent_goals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  month_year text not null, -- formato: "2025-01"
  goal_conversations int, -- meta de conversas atendidas
  goal_avg_rating numeric(3, 2), -- meta de nota média (1-5)
  goal_avg_response_seconds int, -- meta de tempo médio de resposta
  goal_sla_compliance_percent numeric(5, 2), -- meta de % de compliance com SLA
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, user_id, month_year)
);

create index if not exists agent_goals_user_month_idx on public.agent_goals(tenant_id, user_id, month_year desc);

alter table public.agent_goals enable row level security;

drop policy if exists agent_goals_select on public.agent_goals;
create policy agent_goals_select on public.agent_goals
  for select to authenticated
  using (
    user_id = auth.uid() 
    or exists (
      select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = auth.uid()
        and ur.tenant_id = agent_goals.tenant_id
        and r.key in ('admin', 'coordenador')
    )
  );

drop policy if exists agent_goals_insert on public.agent_goals;
create policy agent_goals_insert on public.agent_goals
  for insert to authenticated
  with check (
    exists (
      select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = auth.uid()
        and ur.tenant_id = agent_goals.tenant_id
        and r.key in ('admin', 'coordenador')
    )
  );

drop policy if exists agent_goals_update on public.agent_goals;
create policy agent_goals_update on public.agent_goals
  for update to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = auth.uid()
        and ur.tenant_id = agent_goals.tenant_id
        and r.key in ('admin', 'coordenador')
    )
  );

