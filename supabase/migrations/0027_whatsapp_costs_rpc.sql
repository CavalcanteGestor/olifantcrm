-- Migration 0027: Função para calcular custos estimados do WhatsApp

create or replace function public.get_whatsapp_costs(p_start_date timestamptz, p_end_date timestamptz)
returns table (
  category text,
  quantity bigint
)
language plpgsql
security definer
as $$
begin
  return query
  select
    case
      when m.type = 'template' then 'Marketing/Template'
      else 'Service/Conversational'
    end as category,
    count(*) as quantity
  from public.messages m
  where m.created_at >= p_start_date
    and m.created_at <= p_end_date
    and m.direction = 'out'
    and m.tenant_id = (select tenant_id from public.profiles where user_id = auth.uid())
  group by 1;
end;
$$;
