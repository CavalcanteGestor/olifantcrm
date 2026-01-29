-- Adicionar campo para foto de perfil dos contatos

alter table public.contacts
  add column if not exists profile_picture_url text;

comment on column public.contacts.profile_picture_url is 'URL da foto de perfil do contato (pode ser do WhatsApp ou upload manual)';
