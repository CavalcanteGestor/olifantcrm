import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ingestMediaFromInboundMessage, ingestAdImageFromContext } from "./media.js";
import { processRatingResponse } from "../ratings/process.js";

const WebhookSchema = z.object({
  entry: z
    .array(
      z.object({
        changes: z.array(
          z.object({
            value: z.any()
          })
        )
      })
    )
    .optional()
});

function normalizeWaIdToE164(waId: string) {
  const trimmed = waId.trim();
  return trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
}

type TenantCache = Map<string, string>;
type StageCache = Map<string, string | null>;

export async function processPendingWhatsAppWebhookEvents(opts: {
  supabase: SupabaseClient;
  limit: number;
  tenantCache: TenantCache;
  stageCache: StageCache;
  meta?: { graphVersion: string; accessToken: string };
  log: { info: (o: any, m?: string) => void; warn: (o: any, m?: string) => void; error: (o: any, m?: string) => void };
}) {
  const { supabase, limit, tenantCache, stageCache, meta, log } = opts;

  const { data: events, error } = await supabase
    .from("whatsapp_webhook_events")
    .select("id, raw_json")
    .is("processed_at", null)
    .order("id", { ascending: true })
    .limit(limit);

  if (error) throw error;
  if (!events || events.length === 0) return 0;

  for (const ev of events) {
    try {
      await processOneEvent({ supabase, tenantCache, stageCache, ...(meta ? { meta } : {}), payload: ev.raw_json, log });
      await supabase
        .from("whatsapp_webhook_events")
        .update({ processed_at: new Date().toISOString(), processing_error: null })
        .eq("id", ev.id);
    } catch (e) {
      log.error({ err: e, eventId: ev.id }, "whatsapp_event_processing_failed");
      await supabase
        .from("whatsapp_webhook_events")
        .update({ processed_at: new Date().toISOString(), processing_error: String(e) })
        .eq("id", ev.id);
    }
  }

  return events.length;
}

async function getTenantIdByPhoneNumberId(opts: {
  supabase: SupabaseClient;
  phoneNumberId: string;
  tenantCache: TenantCache;
}) {
  const { supabase, phoneNumberId, tenantCache } = opts;
  const cached = tenantCache.get(phoneNumberId);
  if (cached) return cached;

  const { data, error } = await supabase
    .from("whatsapp_accounts")
    .select("tenant_id")
    .eq("phone_number_id", phoneNumberId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.tenant_id) throw new Error("unknown_phone_number_id");
  tenantCache.set(phoneNumberId, data.tenant_id);
  return data.tenant_id as string;
}

async function getInitialStageId(opts: { supabase: SupabaseClient; tenantId: string; stageCache: StageCache }) {
  const { supabase, tenantId, stageCache } = opts;
  if (stageCache.has(tenantId)) return stageCache.get(tenantId) ?? null;

  const { data, error } = await supabase
    .from("funnel_stages")
    .select("id")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  const id = (data?.id as string | undefined) ?? null;
  stageCache.set(tenantId, id);
  return id;
}

async function processOneEvent(opts: {
  supabase: SupabaseClient;
  payload: unknown;
  tenantCache: TenantCache;
  stageCache: StageCache;
  meta?: { graphVersion: string; accessToken: string };
  log: { info: (o: any, m?: string) => void; warn: (o: any, m?: string) => void; error: (o: any, m?: string) => void };
}) {
  const { supabase, payload, tenantCache, stageCache, meta, log } = opts;

  const parsed = WebhookSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("invalid_webhook_payload");
  }

  const entries = parsed.data.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes) {
      const value: any = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id as string | undefined;
      if (!phoneNumberId) continue;

      const tenantId = await getTenantIdByPhoneNumberId({ supabase, phoneNumberId, tenantCache });
      const initialStageId = await getInitialStageId({ supabase, tenantId, stageCache });

      const contactsArr: any[] = Array.isArray(value?.contacts) ? value.contacts : [];
      const nameByWaId = new Map<string, string>();
      const profilePicByWaId = new Map<string, string>();
      for (const c of contactsArr) {
        const waId = c?.wa_id;
        const nm = c?.profile?.name;
        const pic = c?.profile?.picture?.url;
        if (typeof waId === "string" && typeof nm === "string") nameByWaId.set(waId, nm);
        if (typeof waId === "string" && typeof pic === "string") profilePicByWaId.set(waId, pic);
      }

      // Processar status updates (sent, delivered, read)
      const statuses: any[] = Array.isArray(value?.statuses) ? value.statuses : [];
      for (const status of statuses) {
        const metaMessageId = status?.id as string | undefined;
        const statusValue = status?.status as string | undefined;
        const recipientId = status?.recipient_id as string | undefined;
        if (!metaMessageId || !statusValue) continue;

        const normalizedStatus = statusValue === "sent" ? "sent" 
          : statusValue === "delivered" ? "delivered" 
          : statusValue === "read" ? "read" 
          : "sent";

        // Primeiro verificar se a mensagem existe e qual é o status atual
        const { data: existingMsg } = await supabase
          .from("messages")
          .select("status")
          .eq("meta_message_id", metaMessageId)
          .eq("tenant_id", tenantId)
          .maybeSingle();

        // Só atualizar se o status for diferente (evita erro de imutabilidade)
        if (existingMsg && existingMsg.status !== normalizedStatus) {
          const { error: statusErr } = await supabase
            .from("messages")
            .update({ status: normalizedStatus })
            .eq("meta_message_id", metaMessageId)
            .eq("tenant_id", tenantId);
          
          if (statusErr) {
            log.warn({ err: statusErr, metaMessageId }, "status_update_failed");
          } else {
            log.info({ tenantId, metaMessageId, status: normalizedStatus }, "message_status_updated");
          }
        } else if (existingMsg) {
          log.info({ tenantId, metaMessageId, status: normalizedStatus }, "message_status_unchanged");
        }
      }

      const messages: any[] = Array.isArray(value?.messages) ? value.messages : [];
      for (const m of messages) {
        const from = m?.from as string | undefined;
        const metaMessageId = m?.id as string | undefined;
        const tsSeconds = m?.timestamp ? Number(m.timestamp) : undefined;
        if (!from || !metaMessageId) continue;

        const phoneE164 = normalizeWaIdToE164(from);
        const displayName = nameByWaId.get(from);
        const profilePic = profilePicByWaId.get(from);

        // 1) Contact (upsert cuidadoso para não sobrepor dados existentes com null)
        const contactData: any = {
          tenant_id: tenantId,
          phone_e164: phoneE164,
          status: "lead",
          updated_at: new Date().toISOString()
        };

        if (displayName) contactData.display_name = displayName;
        if (profilePic) contactData.profile_picture_url = profilePic;

        const { data: contactRow, error: contactErr } = await supabase
          .from("contacts")
          .upsert(
            contactData,
            {
              onConflict: "tenant_id,phone_e164",
              // Se já existir, podemos querer apenas atualizar o que veio de novo
            }
          )
          .select("id,status,display_name,profile_picture_url")
          .single();
        if (contactErr) throw contactErr;

        const contactId = contactRow.id as string;
        const contactPhone = phoneE164; // Para uso posterior

        // 2) Conversation (find open or create)
        const { data: convExisting, error: convFindErr } = await supabase
          .from("conversations")
          .select("id,status_fila,assigned_user_id,current_stage_id")
          .eq("tenant_id", tenantId)
          .eq("contact_id", contactId)
          .neq("status_fila", "finalizado")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (convFindErr) throw convFindErr;

        let conversationId: string;
        let assignedUserId: string | null = null;
        let statusFila: string;

        if (convExisting?.id) {
          conversationId = convExisting.id as string;
          assignedUserId = (convExisting.assigned_user_id as string | null) ?? null;
          statusFila = assignedUserId ? "em_atendimento" : "aguardando_atendimento";
        } else {
          const { data: convNew, error: convCreateErr } = await supabase
            .from("conversations")
            .insert({
              tenant_id: tenantId,
              contact_id: contactId,
              status_fila: "aguardando_atendimento",
              priority: 100,
              current_stage_id: initialStageId
            })
            .select("id")
            .single();
          if (convCreateErr) throw convCreateErr;
          conversationId = convNew.id as string;
          statusFila = "aguardando_atendimento";
        }

        // 3) Message (idempotente por meta_message_id)
        const msgType = detectMessageType(m);
        // Incluir context (template/anúncio) se disponível
        // O context pode conter informações sobre o anúncio, incluindo a imagem
        const bodyJson = {
          meta: { phone_number_id: phoneNumberId },
          message: m,
          context: m?.context ? { ...m.context, referral: m?.referral || m?.context?.referral || null } : (m?.referral ? { referral: m.referral } : null)
        };

        // Log para debug: verificar se há context com imagem de anúncio
        if (m?.context && (m.context.referred_product || m.context.ad)) {
          log.info({
            context: m.context,
            hasImage: !!(m.context.referred_product?.image_url || m.context.referred_product?.image || m.context.ad?.image_url || m.context.ad?.image)
          }, "message_with_ad_context");
        }

        // Upsert e obter o ID da mensagem (mesmo se já existir)
        // Usar timestamp da Meta se disponível (sempre confiável), senão usar timestamp atual
        const metaTimestamp = tsSeconds ? tsSeconds * 1000 : null;
        const messageCreatedAt = metaTimestamp ? new Date(metaTimestamp).toISOString() : new Date().toISOString();
        
        const { data: msgData, error: msgErr } = await supabase
          .from("messages")
          .upsert(
            {
              tenant_id: tenantId,
              conversation_id: conversationId,
              direction: "in",
              type: msgType,
              body_json: bodyJson,
              meta_message_id: metaMessageId,
              status: "delivered",
              created_at: messageCreatedAt
            },
            { onConflict: "meta_message_id" }
          )
          .select("id")
          .single();
        if (msgErr) throw msgErr;

        const messageId = msgData?.id as string | undefined;

        // Se for mídia (image/audio/document), baixar e persistir no Storage
        if (meta && messageId && (m?.image || m?.audio || m?.document || m?.video || m?.sticker)) {
          const mediaMeta = m.image ?? m.audio ?? m.document ?? m.video ?? m.sticker;
          await ingestMediaFromInboundMessage({
            supabase,
            meta,
            tenantId,
            conversationId,
            messageId,
            media: mediaMeta,
            log
          });
        }

        // NOVO: Se tiver context com imagem de anúncio, baixar também
        if (meta && messageId && bodyJson.context) {
          const adStoragePath = await ingestAdImageFromContext({
            supabase,
            meta,
            tenantId,
            conversationId,
            messageId,
            context: bodyJson.context,
            log
          });

          if (adStoragePath) {
            // Atualizar body_json com o caminho local no nível raiz (não dentro de context)
            // Isso permite que o trigger immutable_messages aceite a atualização
            const updatedBodyJson = { ...bodyJson, _downloaded_ad_image: adStoragePath };
            // Update atomicamente (ou o mais próximo disso)
            await supabase
              .from("messages")
              .update({ body_json: updatedBodyJson })
              .eq("id", messageId);
          }
        }

        // 4) Update conversation timestamps/status
        const inboundAt = messageCreatedAt; // Usar o mesmo timestamp da mensagem
        const { error: convUpdErr } = await supabase
          .from("conversations")
          .update({
            status_fila: statusFila,
            last_inbound_at: inboundAt,
            last_patient_message_at: inboundAt,
            updated_at: new Date().toISOString()
          })
          .eq("id", conversationId);
        if (convUpdErr) throw convUpdErr;

        // 5) Processar avaliação se for mensagem de texto e parecer uma resposta de avaliação
        if (msgType === "text" && m?.text?.body) {
          const textBody = m.text.body;
          await processRatingResponse({
            supabase,
            conversationId,
            contactPhone: contactPhone,
            messageText: textBody,
            log
          });
        }

        log.info({ tenantId, conversationId, metaMessageId }, "inbound_message_processed");
      }
    }
  }
}

function detectMessageType(m: any): "text" | "image" | "audio" | "document" | "location" | "template" | "reaction" {
  if (m?.type === "reaction" || m?.reaction) return "reaction";
  if (m?.text?.body) return "text";
  if (m?.image) return "image";
  if (m?.audio) return "audio";
  if (m?.document) return "document";
  if (m?.location) return "location";
  // inbound template é raro; mas mantemos por consistência
  return "text";
}


