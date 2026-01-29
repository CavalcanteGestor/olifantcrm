-- Merge assistido de contatos (sem perda de histórico)

create or replace function public.merge_contacts(p_keep_contact_id uuid, p_merge_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t uuid;
  keep_row public.contacts;
  merge_row public.contacts;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  t := public.current_tenant_id();

  select * into keep_row from public.contacts where id = p_keep_contact_id and tenant_id = t for update;
  if not found then raise exception 'keep_not_found'; end if;

  select * into merge_row from public.contacts where id = p_merge_contact_id and tenant_id = t for update;
  if not found then raise exception 'merge_not_found'; end if;

  -- Reatribui conversas
  update public.conversations
  set contact_id = keep_row.id,
      updated_at = now()
  where tenant_id = t
    and contact_id = merge_row.id;

  -- Mescla campos (mantém o keep como base)
  update public.contacts
  set display_name = coalesce(keep_row.display_name, merge_row.display_name),
      status = case
        when keep_row.status = 'paciente_recorrente' or merge_row.status = 'paciente_recorrente' then 'paciente_recorrente'
        when keep_row.status = 'paciente' or merge_row.status = 'paciente' then 'paciente'
        else 'lead'
      end,
      source = coalesce(keep_row.source, merge_row.source),
      procedure_interest = coalesce(keep_row.procedure_interest, merge_row.procedure_interest),
      tags = (select array(select distinct unnest(keep_row.tags || merge_row.tags))),
      internal_notes = concat_ws(E'\n', keep_row.internal_notes, merge_row.internal_notes),
      updated_at = now()
  where id = keep_row.id;

  -- Remove o contato mesclado
  delete from public.contacts
  where id = merge_row.id;
end;
$$;

revoke all on function public.merge_contacts(uuid, uuid) from public;
grant execute on function public.merge_contacts(uuid, uuid) to authenticated;


