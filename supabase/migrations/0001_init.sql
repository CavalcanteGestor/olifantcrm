-- CRMOlifant - Supabase schema v1
-- Observação: este arquivo é para rodar no Supabase (SQL editor ou migrations via CLI).

create extension if not exists pgcrypto;

-- =========================
-- Core tables
-- =========================

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  full_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists profiles_tenant_id_idx on public.profiles(tenant_id);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique, -- secretaria | coordenador | admin
  name text not null
);

insert into public.roles (key, name) values
  ('secretaria', 'Secretária'),
  ('coordenador', 'Coordenador'),
  ('admin', 'Administrador')
on conflict (key) do nothing;

create table if not exists public.user_roles (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id, role_id)
);

create index if not exists user_roles_user_idx on public.user_roles(user_id);

-- =========================
-- Helpers (tenant e roles)
-- =========================

create or replace function public.current_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.tenant_id
  from public.profiles p
  where p.user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.current_tenant_id() from public;
grant execute on function public.current_tenant_id() to authenticated;

create or replace function public.user_has_role(role_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and ur.tenant_id = public.current_tenant_id()
      and r.key = role_key
  );
$$;

revoke all on function public.user_has_role(text) from public;
grant execute on function public.user_has_role(text) to authenticated;

-- =========================
-- CRM / Funil / Atendimento
-- =========================

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  phone_e164 text not null,
  display_name text,
  status text not null check (status in ('lead','paciente','paciente_recorrente')),
  source text,
  procedure_interest text,
  tags text[] not null default '{}',
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, phone_e164)
);

create index if not exists contacts_tenant_status_idx on public.contacts(tenant_id, status);

create table if not exists public.funnel_stages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  default_sla_seconds int,
  created_at timestamptz not null default now()
);

create index if not exists funnel_stages_tenant_sort_idx on public.funnel_stages(tenant_id, sort_order);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  status_fila text not null check (status_fila in ('aguardando_atendimento','em_atendimento','aguardando_paciente','finalizado')),
  assigned_user_id uuid references auth.users(id) on delete set null,
  priority int not null default 0,
  current_stage_id uuid references public.funnel_stages(id) on delete set null,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_patient_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_queue_idx
  on public.conversations(tenant_id, status_fila, priority desc, last_patient_message_at asc nulls first);
create index if not exists conversations_contact_idx on public.conversations(contact_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  type text not null check (type in ('text','image','audio','document','location','template')),
  body_json jsonb not null,
  meta_message_id text,
  status text not null default 'sent' check (status in ('queued','sent','delivered','read','failed')),
  sent_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (meta_message_id)
);

create index if not exists messages_conv_created_idx on public.messages(conversation_id, created_at desc);

create table if not exists public.funnel_moves (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  from_stage_id uuid references public.funnel_stages(id) on delete set null,
  to_stage_id uuid references public.funnel_stages(id) on delete set null,
  moved_by_user_id uuid references auth.users(id) on delete set null,
  moved_at timestamptz not null default now()
);

create index if not exists funnel_moves_conv_idx on public.funnel_moves(conversation_id, moved_at desc);

-- =========================
-- SLA
-- =========================

create table if not exists public.sla_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  stage_id uuid references public.funnel_stages(id) on delete cascade,
  contact_status text check (contact_status in ('lead','paciente','paciente_recorrente')),
  response_seconds int not null,
  warning_threshold_percent int not null default 80 check (warning_threshold_percent between 1 and 99),
  created_at timestamptz not null default now()
);

create index if not exists sla_policies_tenant_idx on public.sla_policies(tenant_id);

create table if not exists public.sla_timers (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  current_policy_id uuid references public.sla_policies(id) on delete set null,
  started_at timestamptz not null,
  due_at timestamptz not null,
  breached_at timestamptz,
  paused_at timestamptz
);

-- =========================
-- WhatsApp (Meta Cloud API)
-- =========================

create table if not exists public.whatsapp_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  waba_id text not null,
  phone_number_id text not null,
  business_id text,
  verify_token text,
  app_secret_ref text,
  created_at timestamptz not null default now(),
  unique (tenant_id, phone_number_id)
);

create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  language text not null,
  category text,
  approved_status text,
  components_json jsonb not null default '[]'::jsonb,
  last_synced_at timestamptz,
  unique (tenant_id, name, language)
);

create table if not exists public.whatsapp_webhook_events (
  id bigserial primary key,
  event_hash text,
  raw_json jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);

create unique index if not exists whatsapp_webhook_events_hash_uq
  on public.whatsapp_webhook_events(event_hash)
  where event_hash is not null;

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  kind text not null check (kind in ('image','audio','document','video','sticker')),
  meta_media_id text,
  storage_path text not null,
  content_type text,
  size_bytes bigint,
  checksum text,
  created_at timestamptz not null default now()
);

create unique index if not exists media_assets_storage_path_uq on public.media_assets(storage_path);

-- =========================
-- Jobs / outbox
-- =========================

create table if not exists public.jobs (
  id bigserial primary key,
  tenant_id uuid references public.tenants(id) on delete cascade,
  type text not null,
  payload_json jsonb not null,
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  run_at timestamptz not null default now(),
  attempts int not null default 0,
  max_attempts int not null default 10,
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists jobs_ready_idx on public.jobs(status, run_at) where status = 'queued';

create table if not exists public.outbox_events (
  id bigserial primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  type text not null,
  payload_json jsonb not null,
  created_at timestamptz not null default now()
);

-- =========================
-- Auditoria / LGPD
-- =========================

create table if not exists public.audit_logs (
  id bigserial primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  ip inet,
  user_agent text,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.access_logs (
  id bigserial primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  resource_type text not null,
  resource_id text not null,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);

-- =========================
-- Produtividade (HUD)
-- =========================

create table if not exists public.canned_responses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  shortcut text not null,
  body_template text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, shortcut)
);

create table if not exists public.conversation_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  title text not null,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open','done','cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists conversation_tasks_conv_idx on public.conversation_tasks(conversation_id, created_at desc);

-- =========================
-- Imutabilidade (append-only) para mensagens e logs
-- =========================

create or replace function public.prevent_update_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'immutable_table';
end;
$$;

-- Mensagens: permitir apenas UPDATE de status (para delivered/read/failed) e negar DELETE.
create or replace function public.prevent_message_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'immutable_messages';
  end if;

  -- Permite atualizar:
  -- - status (queued/sent/delivered/read/failed)
  -- - meta_message_id apenas quando ele estava null e passa a ter valor (ex.: após enviar para a Meta)
  if ((new.status is distinct from old.status) or (old.meta_message_id is null and new.meta_message_id is not null))
     and new.tenant_id = old.tenant_id
     and new.conversation_id = old.conversation_id
     and new.direction = old.direction
     and new.type = old.type
     and new.body_json = old.body_json
     and new.sent_by_user_id is not distinct from old.sent_by_user_id
     and new.created_at = old.created_at then
    return new;
  end if;

  raise exception 'immutable_messages';
end;
$$;

drop trigger if exists messages_immutable on public.messages;
create trigger messages_immutable
before update or delete on public.messages
for each row execute function public.prevent_message_mutation();

drop trigger if exists audit_logs_immutable on public.audit_logs;
create trigger audit_logs_immutable
before update or delete on public.audit_logs
for each row execute function public.prevent_update_delete();

drop trigger if exists access_logs_immutable on public.access_logs;
create trigger access_logs_immutable
before update or delete on public.access_logs
for each row execute function public.prevent_update_delete();

-- =========================
-- RLS (leitura por tenant; escrita via API/service role na V1)
-- =========================

alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.user_roles enable row level security;
alter table public.contacts enable row level security;
alter table public.funnel_stages enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.funnel_moves enable row level security;
alter table public.sla_policies enable row level security;
alter table public.sla_timers enable row level security;
alter table public.whatsapp_accounts enable row level security;
alter table public.whatsapp_templates enable row level security;
alter table public.whatsapp_webhook_events enable row level security;
alter table public.media_assets enable row level security;
alter table public.jobs enable row level security;
alter table public.outbox_events enable row level security;
alter table public.audit_logs enable row level security;
alter table public.access_logs enable row level security;
alter table public.canned_responses enable row level security;
alter table public.conversation_tasks enable row level security;

-- tenants: somente leitura para membros do tenant
drop policy if exists tenants_select on public.tenants;
create policy tenants_select on public.tenants
for select to authenticated
using (id = public.current_tenant_id());

-- profiles: usuário só vê o próprio profile
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
for select to authenticated
using (user_id = auth.uid());

-- roles: todos autenticados podem ler (lista fixa)
drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles
for select to authenticated
using (true);

-- user_roles: usuário vê apenas do próprio tenant
drop policy if exists user_roles_select on public.user_roles;
create policy user_roles_select on public.user_roles
for select to authenticated
using (tenant_id = public.current_tenant_id());

-- contacts/conversations/messages/etc: leitura por tenant
create or replace function public.row_belongs_to_tenant(row_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select row_tenant_id = public.current_tenant_id();
$$;

revoke all on function public.row_belongs_to_tenant(uuid) from public;
grant execute on function public.row_belongs_to_tenant(uuid) to authenticated;

-- Generic select policies
do $$
declare
  t regclass;
begin
  foreach t in array array[
    'public.contacts'::regclass,
    'public.funnel_stages'::regclass,
    'public.conversations'::regclass,
    'public.messages'::regclass,
    'public.funnel_moves'::regclass,
    'public.sla_policies'::regclass,
    'public.sla_timers'::regclass,
    'public.whatsapp_accounts'::regclass,
    'public.whatsapp_templates'::regclass,
    'public.media_assets'::regclass,
    'public.audit_logs'::regclass,
    'public.access_logs'::regclass,
    'public.canned_responses'::regclass,
    'public.conversation_tasks'::regclass
  ]
  loop
    execute format('drop policy if exists tenant_select on %s;', t);
    execute format(
      'create policy tenant_select on %s for select to authenticated using (public.row_belongs_to_tenant(tenant_id));',
      t
    );
  end loop;
end $$;

-- whatsapp_webhook_events/jobs/outbox: sem acesso pelo client (somente service role / backend)
drop policy if exists deny_all_select on public.whatsapp_webhook_events;
create policy deny_all_select on public.whatsapp_webhook_events
for select to authenticated
using (false);

drop policy if exists deny_all_select_jobs on public.jobs;
create policy deny_all_select_jobs on public.jobs
for select to authenticated
using (false);

drop policy if exists deny_all_select_outbox on public.outbox_events;
create policy deny_all_select_outbox on public.outbox_events
for select to authenticated
using (false);

-- =========================
-- RPCs críticas (claim/transfer/move-stage)
-- =========================

create or replace function public.claim_conversation(p_conversation_id uuid)
returns public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.conversations;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into c
  from public.conversations
  where id = p_conversation_id
    and tenant_id = public.current_tenant_id()
  for update;

  if not found then
    raise exception 'not_found';
  end if;

  if c.assigned_user_id is not null and c.assigned_user_id <> auth.uid() then
    raise exception 'already_assigned';
  end if;

  update public.conversations
  set assigned_user_id = auth.uid(),
      status_fila = 'em_atendimento',
      updated_at = now()
  where id = p_conversation_id
  returning * into c;

  return c;
end;
$$;

revoke all on function public.claim_conversation(uuid) from public;
grant execute on function public.claim_conversation(uuid) to authenticated;

create or replace function public.move_conversation_stage(p_conversation_id uuid, p_to_stage_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.conversations;
  from_stage uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into c
  from public.conversations
  where id = p_conversation_id
    and tenant_id = public.current_tenant_id()
  for update;

  if not found then
    raise exception 'not_found';
  end if;

  from_stage := c.current_stage_id;

  update public.conversations
  set current_stage_id = p_to_stage_id,
      updated_at = now()
  where id = p_conversation_id;

  insert into public.funnel_moves(tenant_id, conversation_id, from_stage_id, to_stage_id, moved_by_user_id)
  values (c.tenant_id, c.id, from_stage, p_to_stage_id, auth.uid());
end;
$$;

revoke all on function public.move_conversation_stage(uuid, uuid) from public;
grant execute on function public.move_conversation_stage(uuid, uuid) to authenticated;

create or replace function public.transfer_conversation(p_conversation_id uuid, p_to_user_id uuid)
returns public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.conversations;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  -- Somente coordenador/admin pode transferir
  if not (public.user_has_role('coordenador') or public.user_has_role('admin')) then
    raise exception 'forbidden';
  end if;

  select * into c
  from public.conversations
  where id = p_conversation_id
    and tenant_id = public.current_tenant_id()
  for update;

  if not found then
    raise exception 'not_found';
  end if;

  update public.conversations
  set assigned_user_id = p_to_user_id,
      status_fila = 'em_atendimento',
      updated_at = now()
  where id = p_conversation_id
  returning * into c;

  return c;
end;
$$;

revoke all on function public.transfer_conversation(uuid, uuid) from public;
grant execute on function public.transfer_conversation(uuid, uuid) to authenticated;

create or replace function public.close_conversation(p_conversation_id uuid)
returns public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.conversations;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into c
  from public.conversations
  where id = p_conversation_id
    and tenant_id = public.current_tenant_id()
  for update;

  if not found then
    raise exception 'not_found';
  end if;

  -- Só quem está atendendo ou coord/admin pode finalizar
  if c.assigned_user_id is not null
     and c.assigned_user_id <> auth.uid()
     and not (public.user_has_role('coordenador') or public.user_has_role('admin')) then
    raise exception 'forbidden';
  end if;

  update public.conversations
  set status_fila = 'finalizado',
      updated_at = now()
  where id = p_conversation_id
  returning * into c;

  return c;
end;
$$;

revoke all on function public.close_conversation(uuid) from public;
grant execute on function public.close_conversation(uuid) to authenticated;


