-- Adicionar campo para nome de exibição nas mensagens
alter table public.tenants
  add column if not exists message_display_name text default 'Clínica Olifant';

-- Comentário explicativo
comment on column public.tenants.message_display_name is 'Nome que aparece nas mensagens enviadas pelo sistema (admin e secretaria)';
