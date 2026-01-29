import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Detecta conversas recém-finalizadas e envia mensagem de avaliação
 */
export async function sendRatingRequests(opts: {
  supabase: SupabaseClient;
  meta?: { graphVersion: string; accessToken: string };
  log: { info: (o: any, m?: string) => void; warn: (o: any, m?: string) => void; error: (o: any, m?: string) => void };
}) {
  const { supabase, meta, log } = opts;

  if (!meta) {
    // Sem token do WhatsApp, não pode enviar
    return 0;
  }

  // Buscar conversas que foram finalizadas recentemente (últimos 5 minutos)
  // e ainda não têm avaliação solicitada
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data: conversations, error: convErr } = await supabase
    .from("conversations")
    .select("id, tenant_id, contact_id, contacts(phone_e164), tenants(rating_message_template, rating_message_enabled)")
    .eq("status_fila", "finalizado")
    .gte("updated_at", fiveMinutesAgo)
    .not("contact_id", "is", null);

  if (convErr) {
    log.error({ error: convErr }, "failed_to_fetch_finalized_conversations");
    return 0;
  }

  if (!conversations || conversations.length === 0) {
    return 0;
  }

  // Verificar quais já têm avaliação ou já foi solicitada
  const conversationIds = conversations.map((c: any) => c.id);
  const { data: existingRatings, error: ratingsErr } = await supabase
    .from("conversation_ratings")
    .select("conversation_id")
    .in("conversation_id", conversationIds);

  if (ratingsErr) {
    log.error({ error: ratingsErr }, "failed_to_check_existing_ratings");
    return 0;
  }

  const ratedIds = new Set((existingRatings ?? []).map((r: any) => r.conversation_id));

  // Verificar quais já têm mensagem de avaliação enviada (buscar última mensagem outbound)
  const { data: recentMessages, error: msgErr } = await supabase
    .from("messages")
    .select("conversation_id, body_json, type")
    .in("conversation_id", conversationIds)
    .eq("direction", "out")
    .order("created_at", { ascending: false });

  if (msgErr) {
    log.error({ error: msgErr }, "failed_to_check_recent_messages");
    return 0;
  }

  const lastMessagesByConv = new Map<string, string>();
  for (const msg of recentMessages ?? []) {
    if (!lastMessagesByConv.has((msg as any).conversation_id)) {
      const body = (msg as any).body_json;
      let textContent = "";
      if ((msg as any).type === "text") {
        textContent = body?.text || "";
      } else if ((msg as any).type === "template") {
        textContent = body?.template?.name || "";
      }
      lastMessagesByConv.set((msg as any).conversation_id, textContent);
    }
  }

  let sent = 0;

  for (const conv of conversations) {
    const convId = (conv as any).id;
    const tenantId = (conv as any).tenant_id;
    const contact = (conv as any).contacts;
    const tenant = (conv as any).tenants;

    // Pular se mensagem de avaliação está desabilitada
    if (tenant?.rating_message_enabled === false) {
      continue;
    }

    // Pular se já tem avaliação
    if (ratedIds.has(convId)) {
      continue;
    }

    // Pular se a última mensagem parece ser de avaliação (contém palavras-chave)
    const lastMsg = lastMessagesByConv.get(convId) || "";
    if (
      lastMsg.toLowerCase().includes("avali") ||
      lastMsg.toLowerCase().includes("estrela") ||
      lastMsg.toLowerCase().includes("nota")
    ) {
      continue;
    }

    if (!contact?.phone_e164) {
      log.warn({ conversationId: convId }, "missing_contact_phone");
      continue;
    }

    // Buscar phone_number_id do tenant (via whatsapp_accounts)
    const { data: waAccount, error: waErr } = await supabase
      .from("whatsapp_accounts")
      .select("phone_number_id")
      .eq("tenant_id", tenantId)
      .limit(1)
      .maybeSingle();

    if (waErr || !waAccount?.phone_number_id) {
      log.warn({ conversationId: convId, tenantId }, "missing_whatsapp_account");
      continue;
    }

    // Buscar template de mensagem do tenant
    const ratingMessage =
      tenant.rating_message_template ||
      "Olá! Como foi seu atendimento? De 1 a 5 estrelas, como você avalia?";

    // Criar job para enviar mensagem de avaliação
    const { data: messageData, error: msgCreateErr } = await supabase
      .from("messages")
      .insert({
        tenant_id: tenantId,
        conversation_id: convId,
        direction: "out",
        type: "text",
        body_json: { text: ratingMessage },
        status: "pending"
      })
      .select("id")
      .single();

    if (msgCreateErr || !messageData) {
      log.error({ error: msgCreateErr, conversationId: convId }, "failed_to_create_rating_message");
      continue;
    }

    // Criar job para enviar via WhatsApp
    const { error: jobErr } = await supabase.from("jobs").insert({
      tenant_id: tenantId,
      type: "wa_send_text",
      payload_json: {
        tenant_id: tenantId,
        conversation_id: convId,
        contact_phone_e164: contact.phone_e164,
        text: ratingMessage,
        message_id: messageData.id
      },
      max_attempts: 3
    });

    if (jobErr) {
      log.error({ error: jobErr, conversationId: convId }, "failed_to_create_rating_job");
      // Reverter criação da mensagem?
      continue;
    }

    sent++;
    log.info({ conversationId: convId, contactPhone: contact.phone_e164 }, "rating_request_sent");
  }

  return sent;
}

