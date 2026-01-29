-- Adiciona timestamp de última mudança de etapa para suportar reinício de SLA ao mover no funil

alter table public.conversations
  add column if not exists last_stage_moved_at timestamptz;

create index if not exists conversations_last_stage_moved_idx
  on public.conversations(tenant_id, last_stage_moved_at desc);

-- Atualiza RPC move_conversation_stage para registrar last_stage_moved_at
create or replace function public.move_conversation_stage(p_conversation_id uuid, p_to_stage_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.conversations;
  from_stage uuid;
  moved_at timestamptz := now();
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
      last_stage_moved_at = moved_at,
      updated_at = moved_at
  where id = p_conversation_id;

  insert into public.funnel_moves(tenant_id, conversation_id, from_stage_id, to_stage_id, moved_by_user_id, moved_at)
  values (c.tenant_id, c.id, from_stage, p_to_stage_id, auth.uid(), moved_at);
end;
$$;

revoke all on function public.move_conversation_stage(uuid, uuid) from public;
grant execute on function public.move_conversation_stage(uuid, uuid) to authenticated;


