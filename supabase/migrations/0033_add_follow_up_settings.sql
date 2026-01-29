-- Migration 0033: Adicionar configuração de tempo de follow-up (cliente sem resposta)

alter table public.tenants
  add column if not exists follow_up_alert_minutes int default 120;

comment on column public.tenants.follow_up_alert_minutes is 'Tempo em minutos sem resposta do cliente para disparar alerta de follow-up';
