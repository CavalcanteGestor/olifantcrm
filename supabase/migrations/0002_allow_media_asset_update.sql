-- Permitir atualização do body_json para adicionar media_asset_id
-- Isso é necessário porque o worker baixa a mídia após criar a mensagem

create or replace function public.prevent_message_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'immutable_messages';
  end if;

  -- Permite atualizar:
  -- - status (queued/sent/delivered/read/failed)
  -- - meta_message_id apenas quando ele estava null e passa a ter valor (ex.: após enviar para a Meta)
  -- - body_json APENAS para adicionar media_asset_id ou _downloaded_ad_image (download de mídia pelo worker)
  
  -- Verificar se é apenas atualização de status ou meta_message_id (comportamento original)
  if ((new.status is distinct from old.status) or (old.meta_message_id is null and new.meta_message_id is not null))
     and new.tenant_id = old.tenant_id
     and new.conversation_id = old.conversation_id
     and new.direction = old.direction
     and new.type = old.type
     and new.body_json = old.body_json
     and new.sent_by_user_id is not distinct from old.sent_by_user_id
     and new.created_at = old.created_at then
    return new;
  end if;

  -- Verificar se é apenas atualização do body_json para adicionar media_asset_id ou _downloaded_ad_image
  -- Isso acontece quando o worker baixa a mídia após criar a mensagem
  if new.tenant_id = old.tenant_id
     and new.conversation_id = old.conversation_id
     and new.direction = old.direction
     and new.type = old.type
     and new.status = old.status
     and (old.meta_message_id is null or new.meta_message_id = old.meta_message_id)
     and new.sent_by_user_id is not distinct from old.sent_by_user_id
     and new.created_at = old.created_at then
    
    -- Verificar se apenas media_asset_id ou _downloaded_ad_image foram adicionados/modificados no body_json
    -- Permitir se o body_json antigo é um subset do novo (apenas campos adicionados, não removidos/modificados)
    declare
      old_json jsonb := old.body_json::jsonb;
      new_json jsonb := new.body_json::jsonb;
      old_without_media jsonb;
      new_without_media jsonb;
    begin
      -- Remover campos relacionados a mídia para comparação
      old_without_media := old_json - 'media_asset_id' - '_downloaded_ad_image';
      new_without_media := new_json - 'media_asset_id' - '_downloaded_ad_image';
      
      -- Se o resto do JSON é idêntico, permitir a atualização
      if old_without_media = new_without_media then
        return new;
      end if;
    end;
  end if;

  raise exception 'immutable_messages';
end;
$$;

-- Comentário explicativo
comment on function public.prevent_message_mutation() is 
'Previne mutação de mensagens, exceto para: 
1. Atualização de status (queued/sent/delivered/read/failed)
2. Definição inicial de meta_message_id (quando null -> valor)
3. Adição de media_asset_id ou _downloaded_ad_image no body_json (download de mídia pelo worker)';
