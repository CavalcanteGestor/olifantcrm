-- Migration 0007: Sistema de Turnos e Pausas das Secretárias

-- Tabela para rastrear turnos/trabalho das secretárias
create table if not exists public.agent_shifts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  total_minutes_worked int, -- calculado ao encerrar
  total_minutes_paused int, -- soma de todas as pausas
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tabela para rastrear pausas durante o turno
create table if not exists public.agent_pauses (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.agent_shifts(id) on delete cascade,
  reason text not null check (reason in ('horario_almoco', 'pausa_cafe', 'banheiro', 'outro')),
  reason_detail text, -- obrigatório se reason = 'outro'
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  minutes_duration int, -- calculado ao terminar pausa
  created_at timestamptz not null default now()
);

-- Índices para performance
create index if not exists agent_shifts_user_date_idx on public.agent_shifts(tenant_id, user_id, started_at desc);
create index if not exists agent_shifts_active_idx on public.agent_shifts(tenant_id, user_id, ended_at) where ended_at is null;
create index if not exists agent_pauses_shift_idx on public.agent_pauses(shift_id, started_at);
create index if not exists agent_pauses_active_idx on public.agent_pauses(shift_id, ended_at) where ended_at is null;

-- RLS
alter table public.agent_shifts enable row level security;
alter table public.agent_pauses enable row level security;

-- Policies: usuário vê apenas seus próprios turnos, admin/coordenador vê todos do tenant
drop policy if exists agent_shifts_select_own on public.agent_shifts;
create policy agent_shifts_select_own on public.agent_shifts
  for select to authenticated
  using (
    user_id = auth.uid() 
    or exists (
      select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = auth.uid()
        and ur.tenant_id = agent_shifts.tenant_id
        and r.key in ('admin', 'coordenador')
    )
  );

drop policy if exists agent_pauses_select_shift on public.agent_pauses;
create policy agent_pauses_select_shift on public.agent_pauses
  for select to authenticated
  using (exists (
    select 1 from public.agent_shifts s
    where s.id = agent_pauses.shift_id
    and (
      s.user_id = auth.uid() 
      or exists (
        select 1 from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        where ur.user_id = auth.uid()
          and ur.tenant_id = s.tenant_id
          and r.key in ('admin', 'coordenador')
      )
    )
  ));

-- Função RPC para finalizar turno
create or replace function public.end_agent_shift(p_shift_id uuid)
returns public.agent_shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  shift public.agent_shifts;
  total_paused_minutes int := 0;
begin
  -- Buscar turno
  select * into shift from public.agent_shifts where id = p_shift_id;
  
  if not found then
    raise exception 'shift_not_found';
  end if;
  
  if shift.ended_at is not null then
    raise exception 'shift_already_ended';
  end if;
  
  -- Verificar permissão (só o próprio usuário pode finalizar seu turno)
  if shift.user_id <> auth.uid() then
    raise exception 'forbidden';
  end if;
  
  -- Finalizar pausa ativa se houver
  update public.agent_pauses
  set ended_at = now(),
      minutes_duration = extract(epoch from (now() - started_at))/60::int
  where shift_id = p_shift_id and ended_at is null;
  
  -- Calcular tempo total pausado
  select coalesce(sum(minutes_duration), 0)
  into total_paused_minutes
  from public.agent_pauses
  where shift_id = p_shift_id and ended_at is not null;
  
  -- Calcular tempo total trabalhado (tempo decorrido - tempo pausado)
  declare
    total_elapsed_minutes int;
  begin
    total_elapsed_minutes := extract(epoch from (now() - shift.started_at))/60::int;
    
    -- Finalizar turno
    update public.agent_shifts
    set 
      ended_at = now(),
      total_minutes_worked = greatest(0, total_elapsed_minutes - total_paused_minutes),
      total_minutes_paused = total_paused_minutes,
      updated_at = now()
    where id = p_shift_id
    returning * into shift;
  end;
  
  return shift;
end;
$$;

revoke all on function public.end_agent_shift(uuid) from public;
grant execute on function public.end_agent_shift(uuid) to authenticated;

