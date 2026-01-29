-- Migration 0011: Sistema de Badges/Reconhecimentos

create table if not exists public.agent_badges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_key text not null, -- "super_atendente", "rapido", "favorito", "consistente", "especialista"
  badge_name text not null, -- nome amigável
  earned_at timestamptz not null default now(),
  metadata jsonb, -- dados adicionais (ex: quantas conversas, qual etapa, etc)
  created_at timestamptz not null default now()
);

create index if not exists agent_badges_user_idx on public.agent_badges(tenant_id, user_id, earned_at desc);
create index if not exists agent_badges_key_idx on public.agent_badges(badge_key);

alter table public.agent_badges enable row level security;

drop policy if exists agent_badges_select on public.agent_badges;
create policy agent_badges_select on public.agent_badges
  for select to authenticated
  using (
    user_id = auth.uid() 
    or exists (
      select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = auth.uid()
        and ur.tenant_id = agent_badges.tenant_id
        and r.key in ('admin', 'coordenador')
    )
  );

