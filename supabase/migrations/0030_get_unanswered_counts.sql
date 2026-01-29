create or replace function public.get_unanswered_counts(p_conversation_ids uuid[])
returns table(conversation_id uuid, unanswered_count int)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select tenant_id
    from public.profiles
    where user_id = auth.uid()
    limit 1
  )
  select
    m.conversation_id,
    count(*)::int as unanswered_count
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  join me on me.tenant_id = c.tenant_id
  where m.conversation_id = any(p_conversation_ids)
    and m.direction = 'in'
    and m.created_at > coalesce(c.last_outbound_at, '1970-01-01'::timestamptz)
  group by m.conversation_id;
$$;

revoke all on function public.get_unanswered_counts(uuid[]) from public;
grant execute on function public.get_unanswered_counts(uuid[]) to authenticated;
