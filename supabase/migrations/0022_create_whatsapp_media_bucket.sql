-- Criar bucket whatsapp-media para armazenar mídias do WhatsApp (áudios, imagens, vídeos, documentos)

-- Criar bucket se não existir
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'whatsapp-media',
  'whatsapp-media',
  false, -- bucket privado (requer autenticação)
  52428800, -- 50MB limite por arquivo
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'audio/ogg',
    'audio/mpeg',
    'audio/mp4',
    'audio/aac',
    'audio/amr',
    'video/mp4',
    'video/3gpp',
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do nothing;

-- Política RLS: usuários autenticados podem fazer upload de mídias
create policy "Usuários autenticados podem fazer upload de mídias"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'whatsapp-media');

-- Política RLS: usuários autenticados podem ler mídias do próprio tenant
-- (a verificação de tenant será feita via signed URLs na API)
create policy "Usuários autenticados podem ler mídias"
on storage.objects
for select
to authenticated
using (bucket_id = 'whatsapp-media');

-- Política RLS: usuários autenticados podem deletar mídias (para LGPD/retention)
create policy "Usuários autenticados podem deletar mídias"
on storage.objects
for delete
to authenticated
using (bucket_id = 'whatsapp-media');
