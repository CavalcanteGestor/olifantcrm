-- Migration 0014: Configuração de Alerta de Conversas Sem Resposta

alter table public.tenants
  add column if not exists no_response_alert_minutes int default 5;

comment on column public.tenants.no_response_alert_minutes is 'Tempo em minutos sem resposta para disparar alerta ao atendente';
