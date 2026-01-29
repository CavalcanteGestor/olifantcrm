-- Políticas de retenção (LGPD) por tenant

create table if not exists public.retention_policies (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  access_log_days int not null default 365,
  media_days int not null default 365,
  webhook_event_days int not null default 30,
  job_days int not null default 30,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.retention_policies enable row level security;

drop policy if exists retention_select on public.retention_policies;
create policy retention_select on public.retention_policies
for select to authenticated
using (tenant_id = public.current_tenant_id());

-- Escrita via backend/service role (na V1)

alter table public.media_assets
  add column if not exists deleted_at timestamptz;

create index if not exists media_assets_deleted_idx on public.media_assets(tenant_id, deleted_at);


