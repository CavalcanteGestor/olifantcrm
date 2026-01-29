do $$
begin
  update storage.buckets
  set allowed_mime_types = (
    select array_agg(distinct v)
    from unnest(coalesce(allowed_mime_types, array[]::text[]) || array[
      'audio/wav',
      'audio/x-wav',
      'audio/opus',
      'audio/webm',
      'video/webm',
      'video/quicktime'
    ]) as v
  )
  where id = 'whatsapp-media';
exception
  when undefined_table then
    null;
end $$;
