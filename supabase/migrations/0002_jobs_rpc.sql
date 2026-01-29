-- RPC para dequeue de jobs (lock com SKIP LOCKED)

create or replace function public.dequeue_jobs(p_limit int, p_worker_id text)
returns setof public.jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select j.id
    from public.jobs j
    where j.status = 'queued'
      and j.run_at <= now()
    order by j.run_at asc, j.id asc
    for update skip locked
    limit p_limit
  ),
  updated as (
    update public.jobs j
    set status = 'running',
        locked_at = now(),
        locked_by = p_worker_id,
        attempts = j.attempts + 1
    where j.id in (select id from picked)
    returning j.*
  )
  select * from updated;
end;
$$;

revoke all on function public.dequeue_jobs(int, text) from public;
-- Apenas service role/backends devem usar (não expor ao client).


