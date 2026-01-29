-- Eventos de SLA (histórico) + funções de relatório v1

create table if not exists public.sla_events (
  id bigserial primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  assigned_user_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('breach','response')),
  started_at timestamptz not null,
  due_at timestamptz not null,
  occurred_at timestamptz not null default now(),
  response_seconds int,
  policy_id uuid references public.sla_policies(id) on delete set null
);

create index if not exists sla_events_tenant_time_idx on public.sla_events(tenant_id, occurred_at desc);
create index if not exists sla_events_user_time_idx on public.sla_events(tenant_id, assigned_user_id, occurred_at desc);

alter table public.sla_events enable row level security;
drop policy if exists tenant_select on public.sla_events;
create policy tenant_select on public.sla_events
for select to authenticated
using (public.row_belongs_to_tenant(tenant_id));

drop trigger if exists sla_events_immutable on public.sla_events;
create trigger sla_events_immutable
before update or delete on public.sla_events
for each row execute function public.prevent_update_delete();

-- Relatório por atendente
create or replace function public.report_agents(p_tenant_id uuid, p_from timestamptz, p_to timestamptz)
returns table (
  user_id uuid,
  out_messages bigint,
  in_messages bigint,
  sla_breaches bigint,
  avg_response_seconds numeric
)
language sql
stable
as $$
  with outm as (
    select m.sent_by_user_id as user_id, count(*) as out_messages
    from public.messages m
    where m.tenant_id = p_tenant_id
      and m.direction = 'out'
      and m.sent_by_user_id is not null
      and m.created_at >= p_from and m.created_at < p_to
    group by m.sent_by_user_id
  ),
  inm as (
    select c.assigned_user_id as user_id, count(*) as in_messages
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.tenant_id = p_tenant_id
      and m.direction = 'in'
      and c.assigned_user_id is not null
      and m.created_at >= p_from and m.created_at < p_to
    group by c.assigned_user_id
  ),
  breaches as (
    select e.assigned_user_id as user_id, count(*) as sla_breaches
    from public.sla_events e
    where e.tenant_id = p_tenant_id
      and e.type = 'breach'
      and e.occurred_at >= p_from and e.occurred_at < p_to
      and e.assigned_user_id is not null
    group by e.assigned_user_id
  ),
  responses as (
    select e.assigned_user_id as user_id, avg(e.response_seconds)::numeric as avg_response_seconds
    from public.sla_events e
    where e.tenant_id = p_tenant_id
      and e.type = 'response'
      and e.occurred_at >= p_from and e.occurred_at < p_to
      and e.assigned_user_id is not null
      and e.response_seconds is not null
    group by e.assigned_user_id
  ),
  users as (
    select distinct user_id from outm
    union select distinct user_id from inm
    union select distinct user_id from breaches
    union select distinct user_id from responses
  )
  select
    u.user_id,
    coalesce(o.out_messages, 0) as out_messages,
    coalesce(i.in_messages, 0) as in_messages,
    coalesce(b.sla_breaches, 0) as sla_breaches,
    r.avg_response_seconds
  from users u
  left join outm o on o.user_id = u.user_id
  left join inm i on i.user_id = u.user_id
  left join breaches b on b.user_id = u.user_id
  left join responses r on r.user_id = u.user_id;
$$;

-- Relatório do funil (movimentações)
create or replace function public.report_funnel_moves(p_tenant_id uuid, p_from timestamptz, p_to timestamptz)
returns table (
  stage_id uuid,
  stage_name text,
  moved_in bigint
)
language sql
stable
as $$
  select
    s.id as stage_id,
    s.name as stage_name,
    count(fm.id) as moved_in
  from public.funnel_stages s
  left join public.funnel_moves fm
    on fm.tenant_id = s.tenant_id
   and fm.to_stage_id = s.id
   and fm.moved_at >= p_from and fm.moved_at < p_to
  where s.tenant_id = p_tenant_id
  group by s.id, s.name
  order by s.name asc;
$$;

-- Volume de mensagens (por dia)
create or replace function public.report_message_volume_daily(p_tenant_id uuid, p_from timestamptz, p_to timestamptz)
returns table (
  day date,
  inbound bigint,
  outbound bigint
)
language sql
stable
as $$
  select
    (date_trunc('day', m.created_at))::date as day,
    count(*) filter (where m.direction = 'in') as inbound,
    count(*) filter (where m.direction = 'out') as outbound
  from public.messages m
  where m.tenant_id = p_tenant_id
    and m.created_at >= p_from and m.created_at < p_to
  group by 1
  order by 1 asc;
$$;


