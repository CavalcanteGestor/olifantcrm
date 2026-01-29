import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

const MediaMetaSchema = z.object({
  id: z.string().min(5),
  mime_type: z.string().optional(),
  sha256: z.string().optional()
});

function guessKind(mime: string | undefined): "image" | "audio" | "document" | "video" | "sticker" {
  if (!mime) return "document";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "document";
}

export async function ingestMediaFromInboundMessage(opts: {
  supabase: SupabaseClient;
  meta: { graphVersion: string; accessToken: string };
  tenantId: string;
  conversationId: string;
  messageId: string;
  media: unknown;
  log: { info: (o: any, m?: string) => void; warn: (o: any, m?: string) => void; error: (o: any, m?: string) => void };
}) {
  const { supabase, meta, tenantId, conversationId, messageId, media, log } = opts;
  const parsed = MediaMetaSchema.safeParse(media);
  if (!parsed.success) return;

  const metaMediaId = parsed.data.id;
  const url = `https://graph.facebook.com/${meta.graphVersion}/${metaMediaId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${meta.accessToken}` }
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    log.warn({ metaMediaId, status: res.status, json }, "media_meta_fetch_failed");
    return;
  }

  const downloadUrl = json?.url as string | undefined;
  const mimeType = (json?.mime_type as string | undefined) ?? parsed.data.mime_type;
  if (!downloadUrl) return;

  const binRes = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${meta.accessToken}` } });
  if (!binRes.ok) {
    log.warn({ metaMediaId, status: binRes.status }, "media_download_failed");
    return;
  }

  const arr = new Uint8Array(await binRes.arrayBuffer());
  const kind = guessKind(mimeType);
  const storagePath = `${tenantId}/${conversationId}/${metaMediaId}`;

  // Bucket esperado: "whatsapp-media"
  const { error: upErr } = await supabase.storage.from("whatsapp-media").upload(storagePath, arr, {
    contentType: mimeType ?? "application/octet-stream",
    upsert: true
  });
  if (upErr) throw upErr;

  const { error: dbErr } = await supabase.from("media_assets").upsert(
    {
      tenant_id: tenantId,
      conversation_id: conversationId,
      message_id: messageId,
      kind,
      meta_media_id: metaMediaId,
      storage_path: storagePath,
      content_type: mimeType ?? null,
      size_bytes: arr.byteLength,
      checksum: parsed.data.sha256 ?? null
    },
    { onConflict: "storage_path" }
  );
  if (dbErr) throw dbErr;

  // Atualizar a mensagem original com o media_asset_id para o frontend saber que existe
  const { data: msg } = await supabase
    .from("messages")
    .select("body_json")
    .eq("id", messageId)
    .single();

  if (msg) {
    const newBody = { ...msg.body_json, media_asset_id: metaMediaId }; // metaMediaId é o ID do asset na tabela se usarmos ele como PK, mas aqui o PK é UUID.
    // Espere, o media_assets tem ID UUID. O meta_media_id é o ID do Facebook.
    // O upsert acima usa onConflict storage_path, mas não retorna o ID gerado (UUID).
    
    // Precisamos buscar o ID do asset criado/atualizado
    const { data: asset } = await supabase
      .from("media_assets")
      .select("id")
      .eq("storage_path", storagePath)
      .single();

    if (asset) {
      log.info({ messageId, mediaAssetId: asset.id }, "linking_media_asset_to_message");
      const bodyWithAsset = { ...msg.body_json, media_asset_id: asset.id };
      await supabase.from("messages").update({ body_json: bodyWithAsset }).eq("id", messageId);
    } else {
      // Tentar uma segunda vez após um breve delay, pois pode haver latência na replicação/leitura
      await new Promise(r => setTimeout(r, 500));
      const { data: assetRetry } = await supabase
        .from("media_assets")
        .select("id")
        .eq("storage_path", storagePath)
        .single();
        
      if (assetRetry) {
         log.info({ messageId, mediaAssetId: assetRetry.id }, "linking_media_asset_to_message_retry");
         const bodyWithAsset = { ...msg.body_json, media_asset_id: assetRetry.id };
         await supabase.from("messages").update({ body_json: bodyWithAsset }).eq("id", messageId);
      } else {
         log.warn({ messageId, storagePath }, "media_asset_not_found_after_upsert_retry");
      }
    }
  }

  log.info({ metaMediaId, storagePath }, "media_ingested");
}



export async function ingestAdImageFromContext(opts: {
  supabase: SupabaseClient;
  meta: { graphVersion: string; accessToken: string };
  tenantId: string;
  conversationId: string;
  messageId: string;
  context: any;
  log: { info: (o: any, m?: string) => void; warn: (o: any, m?: string) => void; error: (o: any, m?: string) => void };
}) {
  const { supabase, meta, tenantId, conversationId, messageId, context, log } = opts;

  // Extrair URL da imagem do contexto (mesma lógica do frontend)
  let imgUrl: string | null = null;

  if (context?.referred_product?.image_url) {
    imgUrl = context.referred_product.image_url;
  } else if (context?.referred_product?.image) {
    imgUrl = typeof context.referred_product.image === 'string'
      ? context.referred_product.image
      : context.referred_product.image.url || context.referred_product.image.link;
  } else if (context?.ad?.image_url) {
    imgUrl = context.ad.image_url;
  } else if (context?.ad?.image) {
    imgUrl = typeof context.ad.image === 'string'
      ? context.ad.image
      : context.ad.image.url || context.ad.image.link;
  } else if (context?.message?.image?.url) {
    imgUrl = context.message.image.url;
  } else if (context?.header?.image?.url) {
    imgUrl = context.header.image.url;
  } else if (context?.referral?.image_url) {
    imgUrl = context.referral.image_url;
  } else if (context?.referral?.thumbnail_url) {
    imgUrl = context.referral.thumbnail_url;
  } else if (context?.referral?.video_url) {
    imgUrl = context.referral.video_url;
  }

  if (!imgUrl) return null;

  try {
    // Baixar imagem
    // Tentar com Auth header se for domínio do WhatsApp, senão tentar sem (ou com, mal não faz geralmente)
    const headers: Record<string, string> = {};
    if (imgUrl.includes("whatsapp.net") || imgUrl.includes("facebook.com")) {
      headers.Authorization = `Bearer ${meta.accessToken}`;
    }

    const res = await fetch(imgUrl, { headers });
    if (!res.ok) {
      log.warn({ status: res.status, imgUrl }, "ad_image_download_failed");
      return null;
    }

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const buffer = await res.arrayBuffer();
    const arr = new Uint8Array(buffer);

    // Gerar ID único para essa imagem de ad
    const adImageId = `ad_${messageId}`;
    const storagePath = `${tenantId}/${conversationId}/${adImageId}`;

    // Upload
    const { error: upErr } = await supabase.storage.from("whatsapp-media").upload(storagePath, arr, {
      contentType,
      upsert: true
    });

    if (upErr) throw upErr;

    // Persistir em media_assets para facilitar geração de link depois
    // Embora não seja uma mensagem de mídia "pura", é um asset associado
    const { error: dbErr } = await supabase.from("media_assets").upsert(
      {
        tenant_id: tenantId,
        conversation_id: conversationId,
        message_id: messageId,
        kind: "image",
        meta_media_id: adImageId, // ID "fake"
        storage_path: storagePath,
        content_type: contentType,
        size_bytes: arr.byteLength,
        checksum: null
      },
      { onConflict: "storage_path" }
    );

    if (dbErr) throw dbErr;

    log.info({ storagePath }, "ad_image_ingested");
    return storagePath;

  } catch (e) {
    log.error({ err: e, imgUrl }, "ad_image_ingestion_error");
    return null;
  }
}
