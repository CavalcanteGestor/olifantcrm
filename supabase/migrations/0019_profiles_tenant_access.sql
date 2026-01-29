-- Migration 0019: Permitir acesso a profiles do mesmo tenant
-- Necessário para funcionalidades como chat interno, transferência de conversas, etc.

-- Adicionar política para permitir ver profiles do mesmo tenant
drop policy if exists profiles_select_tenant on public.profiles;
create policy profiles_select_tenant on public.profiles
for select to authenticated
using (tenant_id = public.current_tenant_id());

-- A política profiles_select_self ainda existe e permite ver o próprio profile
-- A nova política profiles_select_tenant permite ver todos do mesmo tenant
-- Ambas políticas são OR, então qualquer uma que passar permite o acesso

comment on policy profiles_select_tenant on public.profiles is 'Permite ver profiles de todos os usuários do mesmo tenant';
