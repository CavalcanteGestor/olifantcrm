-- Migration 0021: Configurações de Mensagens Automáticas

-- Adicionar campos para controlar envio de mensagens automáticas
alter table public.tenants
  add column if not exists rating_message_enabled boolean default true,
  add column if not exists close_message_template text default 'Olá {nome}! Obrigado pelo contato. Se precisar de mais alguma coisa, estaremos à disposição!',
  add column if not exists close_message_enabled boolean default true;

-- Comentários para documentação
comment on column public.tenants.rating_message_enabled is 'Se true, envia mensagem de avaliação automaticamente após finalizar conversa';
comment on column public.tenants.close_message_template is 'Template da mensagem enviada ao encerrar conversa. Use {nome} para substituir pelo nome do contato';
comment on column public.tenants.close_message_enabled is 'Se true, envia mensagem de encerramento ao finalizar conversa';
