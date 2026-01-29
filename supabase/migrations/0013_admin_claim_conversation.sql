-- Permitir que admin/coordenador possam pegar qualquer conversa
-- (mesmo que já esteja atribuída a outro atendente)

create or replace function public.claim_conversation(p_conversation_id uuid)
returns public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.conversations;
  is_admin_or_coord boolean;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  -- Verificar se o usuário é admin ou coordenador
  is_admin_or_coord := public.user_has_role('admin') or public.user_has_role('coordenador');

  select * into c
  from public.conversations
  where id = p_conversation_id
    and tenant_id = public.current_tenant_id()
  for update;

  if not found then
    raise exception 'not_found';
  end if;

  -- Se já está atribuída, só permite pegar se for admin/coordenador ou se for a própria conversa
  if c.assigned_user_id is not null and c.assigned_user_id <> auth.uid() and not is_admin_or_coord then
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

