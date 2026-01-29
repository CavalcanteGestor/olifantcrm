import { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { env } from "../config/env.js";
import { getTenantIdForUser, requireAnyRole, requireAuth, requireTenantScopedConversation } from "../lib/auth.js";
import { createUserClient, supabase } from "../lib/supabase.js";
import {
  MessageReactSchema,
  MoveStageSchema,
  RateConversationSchema,
  ScheduleTextSchema,
  SendMediaSchema,
  SendTemplateSchema,
  SendTextSchema,
  TaskCreateSchema,
  TaskStatusSchema,
  TransferSchema
} from "../schemas/conversations.schemas.js";

export async function conversationsRoutes(app: FastifyInstance) {
  // ====== Busca de conversas
  app.get("/api/conversations/search", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    const q = req.query as any;
    const query = (q.q as string)?.trim();
    if (!query || query.length < 2) {
      reply.send({ items: [] });
      return;
    }

    const { data: contacts, error: contactsErr } = await supabase
      .from("contacts")
      .select("id")
      .eq("tenant_id", tenantId)
      .or(`display_name.ilike.%${query}%,phone_e164.ilike.%${query}%`)
      .limit(50);
    if (contactsErr) {
      reply.code(500).send({ error: "query_failed" });
      return;
    }

    if (!contacts || contacts.length === 0) {
      reply.send({ items: [] });
      return;
    }

    const contactIds = contacts.map((c) => c.id);

    const { data: conversations, error: convErr } = await supabase
      .from("conversations")
      .select("id, contact_id, contacts(display_name, phone_e164)")
      .eq("tenant_id", tenantId)
      .in("contact_id", contactIds)
      .limit(50);
    if (convErr) {
      reply.code(500).send({ error: "query_failed" });
      return;
    }

    reply.send({ items: conversations ?? [] });
  });

  // ====== Enviar mídia
  app.post("/api/messages/send-media", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    const parsed = SendMediaSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
      return;
    }

    let isAdmin = false;
    try {
      await requireAnyRole(userId, tenantId, ["admin", "coordenador"]);
      isAdmin = true;
    } catch {
      // Não é admin
    }

    if (!isAdmin) {
      const { data: activeShift, error: shiftErr } = await supabase
        .from("agent_shifts")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .is("ended_at", null)
        .maybeSingle();

      if (shiftErr) {
        reply.code(500).send({ error: "shift_check_failed" });
        return;
      }

      if (!activeShift) {
        reply.code(400).send({
          error: "no_active_shift",
          message: "Você precisa ter um turno ativo para enviar mensagens."
        });
        return;
      }
    }

    let conv: { id: string; tenant_id: string; contact_id: string; last_patient_message_at: string | null };
    try {
      conv = await requireTenantScopedConversation(tenantId, parsed.data.conversation_id);
    } catch {
      reply.code(404).send({ error: "conversation_not_found" });
      return;
    }

    const last = conv.last_patient_message_at ? new Date(conv.last_patient_message_at) : null;
    const within24h = last ? Date.now() - last.getTime() <= 24 * 60 * 60 * 1000 : false;
    if (!within24h) {
      reply.code(409).send({ error: "outside_24h_window", hint: "use_template" });
      return;
    }

    const { data: contact, error: contactErr } = await supabase
      .from("contacts")
      .select("phone_e164")
      .eq("id", conv.contact_id)
      .eq("tenant_id", tenantId)
      .single();
    if (contactErr) {
      reply.code(500).send({ error: "contact_lookup_failed" });
      return;
    }

    const { data: wa, error: waErr } = await supabase
      .from("whatsapp_accounts")
      .select("phone_number_id")
      .eq("tenant_id", tenantId)
      .limit(1)
      .maybeSingle();
    if (waErr || !wa?.phone_number_id) {
      reply.code(500).send({ error: "whatsapp_account_not_found" });
      return;
    }

    const buffer = Buffer.from(parsed.data.file_data, "base64");
    const mediaId = crypto.randomUUID();
    const storagePath = `${tenantId}/${parsed.data.conversation_id}/${mediaId}`;

    let contentType = "application/octet-stream";
    if (parsed.data.media_type === "image") contentType = "image/jpeg";
    else if (parsed.data.media_type === "audio") contentType = "audio/ogg";
    else if (parsed.data.media_type === "video") contentType = "video/mp4";
    else if (parsed.data.media_type === "document") contentType = "application/pdf";

    // Usar timestamp do cliente se fornecido (mais preciso), senão usar timestamp do servidor
    const messageTimestamp = parsed.data.client_timestamp || new Date().toISOString();

    // OTIMIZAÇÃO: Processar upload e criação de mensagem em paralelo
    const [uploadResult, msgResult] = await Promise.all([
      // Upload para Storage
      supabase.storage
        .from("whatsapp-media")
        .upload(storagePath, buffer, { contentType, upsert: false }),
      
      // Criar mensagem imediatamente (status: queued)
      supabase
        .from("messages")
        .insert({
          tenant_id: tenantId,
          conversation_id: parsed.data.conversation_id,
          direction: "out",
          type: parsed.data.media_type,
          body_json: {
            filename: parsed.data.file_name,
            caption: parsed.data.caption,
            // media_asset_id será adicionado depois
          },
          status: "queued",
          sent_by_user_id: userId,
          created_at: messageTimestamp
        })
        .select("id")
        .single()
    ]);

    if (uploadResult.error) {
      reply.code(500).send({ error: "upload_failed", details: uploadResult.error.message });
      return;
    }

    if (msgResult.error || !msgResult.data) {
      reply.code(500).send({ error: "message_creation_failed" });
      return;
    }

    const msg = msgResult.data;

    // Criar media_asset primeiro
    const mediaAssetResult = await supabase
      .from("media_assets")
      .insert({
        tenant_id: tenantId,
        conversation_id: parsed.data.conversation_id,
        message_id: msg.id,
        kind: parsed.data.media_type as any,
        storage_path: storagePath,
        content_type: contentType,
        size_bytes: buffer.length
      })
      .select("id")
      .single();

    if (mediaAssetResult.error || !mediaAssetResult.data) {
      reply.code(500).send({ error: "media_asset_creation_failed" });
      return;
    }

    // Criar job com media_asset_id
    const jobResult = await supabase.from("jobs").insert({
      tenant_id: tenantId,
      type: "wa_send_media",
      payload_json: {
        tenant_id: tenantId,
        conversation_id: parsed.data.conversation_id,
        contact_phone_e164: contact.phone_e164,
        media_type: parsed.data.media_type,
        media_asset_id: mediaAssetResult.data.id,  // Incluir media_asset_id
        storage_path: storagePath,
        caption: parsed.data.caption,
        message_id: msg.id
      }
    });

    if (jobResult.error) {
      reply.code(500).send({ error: "job_creation_failed" });
      return;
    }

    // Atualizar mensagem com media_asset_id e atribuir conversa ao usuário
    const nowIso = new Date().toISOString();
    await Promise.all([
      supabase
        .from("messages")
        .update({ 
          body_json: {
            filename: parsed.data.file_name,
            caption: parsed.data.caption,
            media_asset_id: mediaAssetResult.data.id
          }
        })
        .eq("id", msg.id),
      
      supabase
        .from("conversations")
        .update({ 
          last_outbound_at: nowIso,
          updated_at: nowIso,
          assigned_user_id: userId,  // Atribuir ao usuário que está respondendo
          status_fila: "em_atendimento"  // Mudar status para em atendimento
        })
        .eq("id", parsed.data.conversation_id)
    ]);

    reply.send({ ok: true, message_id: msg.id, media_asset_id: mediaAssetResult.data.id });
  });

  // ====== Enviar texto
  app.post("/api/messages/send-text", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }

    const parsed = SendTextSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
      return;
    }

    const tenantId = await getTenantIdForUser(userId);

    let isAdmin = false;
    try {
      await requireAnyRole(userId, tenantId, ["admin", "coordenador"]);
      isAdmin = true;
    } catch {
      // Não é admin
    }

    if (!isAdmin) {
      const { data: activeShift, error: shiftErr } = await supabase
        .from("agent_shifts")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .is("ended_at", null)
        .maybeSingle();

      if (shiftErr) {
        reply.code(500).send({ error: "shift_check_failed", details: shiftErr.message });
        return;
      }

      if (!activeShift) {
        reply.code(400).send({
          error: "no_active_shift",
          message: "Você precisa ter um turno ativo para enviar mensagens. Inicie seu turno primeiro."
        });
        return;
      }
    }

    let conv: { id: string; tenant_id: string; contact_id: string; last_patient_message_at: string | null };
    try {
      conv = await requireTenantScopedConversation(tenantId, parsed.data.conversation_id);
    } catch {
      reply.code(404).send({ error: "conversation_not_found" });
      return;
    }

    const last = conv.last_patient_message_at ? new Date(conv.last_patient_message_at as string) : null;
    const within24h = last ? Date.now() - last.getTime() <= 24 * 60 * 60 * 1000 : false;
    if (!within24h) {
      reply.code(409).send({ error: "outside_24h_window", hint: "use_template" });
      return;
    }

    const { data: contact, error: contactErr } = await supabase
      .from("contacts")
      .select("phone_e164")
      .eq("id", conv.contact_id)
      .eq("tenant_id", tenantId)
      .single();
    if (contactErr) {
      reply.code(500).send({ error: "contact_lookup_failed" });
      return;
    }

    const nowIso = new Date().toISOString();
    // Usar timestamp do cliente se fornecido (mais preciso), senão usar timestamp do servidor
    const messageTimestamp = parsed.data.client_timestamp || nowIso;
    
    const { data: msg, error: msgInsErr } = await supabase
      .from("messages")
      .insert({
        tenant_id: tenantId,
        conversation_id: conv.id,
        direction: "out",
        type: "text",
        body_json: { text: parsed.data.text },
        status: "queued",
        sent_by_user_id: userId,
        created_at: messageTimestamp
      })
      .select("id")
      .single();
    if (msgInsErr) {
      reply.code(500).send({ error: "message_insert_failed" });
      return;
    }

    const { error: jobErr } = await supabase.from("jobs").insert({
      tenant_id: tenantId,
      type: "wa_send_text",
      payload_json: {
        tenant_id: tenantId,
        conversation_id: conv.id,
        contact_phone_e164: contact.phone_e164,
        text: parsed.data.text,
        message_id: msg.id
      }
    });
    if (jobErr) {
      reply.code(500).send({ error: "job_enqueue_failed" });
      return;
    }

    await supabase
      .from("conversations")
      .update({ 
        last_outbound_at: nowIso, 
        updated_at: nowIso,
        assigned_user_id: userId,  // Atribuir ao usuário que está respondendo
        status_fila: "em_atendimento"  // Mudar status para em atendimento
      })
      .eq("id", conv.id);

    reply.code(202).send({ ok: true, message_id: msg.id });
  });

  // ====== Agendar texto
  app.post("/api/messages/schedule-text", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }

    const parsed = ScheduleTextSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
      return;
    }

    const tenantId = await getTenantIdForUser(userId);
    const runAt = new Date(parsed.data.run_at);
    if (Number.isNaN(runAt.getTime())) {
      reply.code(400).send({ error: "invalid_run_at" });
      return;
    }

    let isAdmin = false;
    try {
      await requireAnyRole(userId, tenantId, ["admin", "coordenador"]);
      isAdmin = true;
    } catch {
      // Não é admin
    }

    if (!isAdmin) {
      const { data: activeShift, error: shiftErr } = await supabase
        .from("agent_shifts")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .is("ended_at", null)
        .maybeSingle();

      if (shiftErr) {
        reply.code(500).send({ error: "shift_check_failed", details: shiftErr.message });
        return;
      }

      if (!activeShift) {
        reply.code(400).send({
          error: "no_active_shift",
          message: "Você precisa ter um turno ativo para agendar mensagens. Inicie seu turno primeiro."
        });
        return;
      }
    }

    let conv: { id: string; tenant_id: string; contact_id: string; last_patient_message_at: string | null };
    try {
      conv = await requireTenantScopedConversation(tenantId, parsed.data.conversation_id);
    } catch {
      reply.code(404).send({ error: "conversation_not_found" });
      return;
    }

    const last = conv.last_patient_message_at ? new Date(conv.last_patient_message_at as string) : null;
    const deadline = last ? new Date(last.getTime() + 24 * 60 * 60 * 1000) : null;
    if (!deadline || runAt.getTime() > deadline.getTime()) {
      reply.code(409).send({ error: "outside_24h_window", hint: "use_template" });
      return;
    }

    const { data: contact, error: contactErr } = await supabase
      .from("contacts")
      .select("phone_e164")
      .eq("id", conv.contact_id)
      .eq("tenant_id", tenantId)
      .single();
    if (contactErr) {
      reply.code(500).send({ error: "contact_lookup_failed" });
      return;
    }

    const runAtIso = runAt.toISOString();
    const { data: msg, error: msgInsErr } = await supabase
      .from("messages")
      .insert({
        tenant_id: tenantId,
        conversation_id: conv.id,
        direction: "out",
        type: "text",
        body_json: { text: parsed.data.text },
        status: "queued",
        sent_by_user_id: userId,
        created_at: runAtIso
      })
      .select("id")
      .single();
    if (msgInsErr) {
      reply.code(500).send({ error: "message_insert_failed" });
      return;
    }

    const { error: jobErr } = await supabase.from("jobs").insert({
      tenant_id: tenantId,
      type: "wa_send_text",
      run_at: runAtIso,
      payload_json: {
        tenant_id: tenantId,
        conversation_id: conv.id,
        contact_phone_e164: contact.phone_e164,
        text: parsed.data.text,
        message_id: msg.id
      }
    });
    if (jobErr) {
      reply.code(500).send({ error: "job_enqueue_failed" });
      return;
    }

    reply.code(202).send({ ok: true, message_id: msg.id, run_at: runAtIso });
  });

  // ====== Reagir
  app.post("/api/messages/:id/react", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }

    const tenantId = await getTenantIdForUser(userId);
    const messageId = (req.params as any).id as string;
    const parsed = MessageReactSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
      return;
    }

    const { data: msg, error: msgErr } = await supabase
      .from("messages")
      .select("id, conversation_id, meta_message_id, tenant_id")
      .eq("id", messageId)
      .eq("tenant_id", tenantId)
      .single();

    if (msgErr || !msg) {
      reply.code(404).send({ error: "message_not_found" });
      return;
    }

    if (!msg.meta_message_id) {
      reply.code(400).send({ error: "message_no_meta_id", message: "Não é possível reagir a uma mensagem sem ID da Meta." });
      return;
    }

    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .select("contact_id")
      .eq("id", msg.conversation_id)
      .single();

    if (convErr || !conv) {
      reply.code(404).send({ error: "conversation_not_found" });
      return;
    }

    const { data: contact, error: contactErr } = await supabase
      .from("contacts")
      .select("phone_e164")
      .eq("id", conv.contact_id)
      .single();

    if (contactErr || !contact) {
      reply.code(404).send({ error: "contact_not_found" });
      return;
    }

    const { error: jobErr } = await supabase.from("jobs").insert({
      tenant_id: tenantId,
      type: "wa_react",
      payload_json: {
        tenant_id: tenantId,
        conversation_id: msg.conversation_id,
        contact_phone_e164: contact.phone_e164,
        target_meta_message_id: msg.meta_message_id,
        emoji: parsed.data.emoji
      }
    });

    if (jobErr) {
      reply.code(500).send({ error: "job_enqueue_failed" });
      return;
    }

    reply.send({ ok: true });
  });

  // ====== Enviar Template
  app.post("/api/conversations/:id/messages/send-template", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    const { id: conversationId } = req.params as { id: string };
    const parsed = SendTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
      return;
    }

    let conv: { id: string; tenant_id: string; contact_id: string };
    try {
      conv = await requireTenantScopedConversation(tenantId, conversationId);
    } catch {
      reply.code(404).send({ error: "conversation_not_found" });
      return;
    }

    const { data: contact, error: contactErr } = await supabase
      .from("contacts")
      .select("phone_e164")
      .eq("id", conv.contact_id)
      .eq("tenant_id", tenantId)
      .single();
    if (contactErr) {
      reply.code(500).send({ error: "contact_lookup_failed" });
      return;
    }

    const nowIso = new Date().toISOString();
    const { data: msg, error: msgInsErr } = await supabase
      .from("messages")
      .insert({
        tenant_id: tenantId,
        conversation_id: conv.id,
        direction: "out",
        type: "template",
        body_json: {
          template_name: parsed.data.template_name,
          language: parsed.data.language,
          components: parsed.data.components || []
        },
        status: "queued",
        sent_by_user_id: userId,
        created_at: nowIso
      })
      .select("id")
      .single();
    if (msgInsErr) {
      reply.code(500).send({ error: "message_insert_failed" });
      return;
    }

    const { error: jobErr } = await supabase.from("jobs").insert({
      tenant_id: tenantId,
      type: "wa_send_template",
      payload_json: {
        tenant_id: tenantId,
        conversation_id: conv.id,
        contact_phone_e164: contact.phone_e164,
        template_name: parsed.data.template_name,
        language: parsed.data.language,
        components: parsed.data.components || [],
        message_id: msg.id
      }
    });
    if (jobErr) {
      reply.code(500).send({ error: "job_enqueue_failed" });
      return;
    }

    reply.code(202).send({ ok: true, message_id: msg.id });
  });

  // ====== Obter URL de mídia
  app.get("/api/media/:id/url", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    const { id: mediaId } = req.params as { id: string };

    console.log(`🔍 [API] Buscando mídia. ID Solicitado: ${mediaId}, Tenant: ${tenantId}`);

    // Tentar buscar por ID (UUID)
    let query = supabase
      .from("media_assets")
      .select("id, tenant_id, storage_path, meta_media_id")
      .eq("tenant_id", tenantId);

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mediaId);
    if (isUuid) {
      console.log(`🔍 [API] ID é UUID. Buscando pela coluna 'id'.`);
      query = query.eq("id", mediaId);
    } else {
      console.log(`🔍 [API] ID NÃO é UUID. Buscando pela coluna 'meta_media_id'.`);
      // Se não for UUID, tentar pelo meta_media_id (ID do Facebook)
      // Isso cobre casos legados onde o body_json salvou o ID da Meta
      query = query.eq("meta_media_id", mediaId);
    }

    const { data: media, error: mediaErr } = await query.maybeSingle(); // Usar maybeSingle para evitar erro se não achar

    if (mediaErr) {
        console.error("❌ [API] Erro no Supabase ao buscar mídia:", mediaErr);
        reply.code(500).send({ error: "db_error", details: mediaErr });
        return;
    }

    if (!media) {
      console.warn("⚠️ [API] Mídia não encontrada no banco.", { mediaId, isUuid, tenantId });
      // Fallback: Se não achou pelo tenantId do usuário, vamos tentar buscar SEM o tenantId para debug (apenas logar)
      const { data: mediaAny } = await supabase.from("media_assets").select("tenant_id").eq(isUuid ? "id" : "meta_media_id", mediaId).maybeSingle();
      if (mediaAny) {
          console.warn(`⚠️ [API] Mídia existe mas pertence a outro tenant! Tenant da mídia: ${mediaAny.tenant_id}, Tenant do usuário: ${tenantId}`);
      }
      // Retornar 200 com url null ao invés de 404 para evitar erros no console
      reply.code(200).send({ url: null });
      return;
    }

    console.log(`✅ [API] Mídia encontrada:`, media);

    const { data: urlData, error: urlErr } = await supabase.storage
      .from("whatsapp-media")
      .createSignedUrl(media.storage_path, 3600);
    
    if (urlErr || !urlData) {
      console.warn("⚠️ [API] Erro ao gerar URL assinada:", urlErr);
      // Retornar 200 com url null ao invés de 500 para evitar erros no console
      reply.code(200).send({ url: null });
      return;
    }

    console.log(`✅ [API] URL gerada com sucesso.`);
    reply.send({ url: urlData.signedUrl });
  });

  // ====== Finalizar conversa
  app.post("/api/conversations/:id/close", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    const { id: conversationId } = req.params as { id: string };

    try {
      await requireTenantScopedConversation(tenantId, conversationId);
    } catch {
      reply.code(404).send({ error: "conversation_not_found" });
      return;
    }

    const { data: currentConv } = await supabase
      .from("conversations")
      .select("status_fila")
      .eq("id", conversationId)
      .eq("tenant_id", tenantId)
      .single();

    if (currentConv?.status_fila === "finalizado") {
      reply.code(400).send({ error: "already_closed", message: "A conversa já está finalizada" });
      return;
    }

    const token = req.headers.authorization?.slice("Bearer ".length);
    if (!token) {
      reply.code(401).send({ error: "missing_auth" });
      return;
    }

    const userClient = createUserClient(token);

    const { data, error: rpcErr } = await userClient.rpc("close_conversation", {
      p_conversation_id: conversationId
    });
    if (rpcErr) {
      if (rpcErr.message?.includes("not_authenticated")) {
        reply.code(401).send({ error: "not_authenticated", details: "Token de autenticação inválido ou expirado" });
        return;
      }
      if (rpcErr.message?.includes("not_found") || rpcErr.code === "PGRST116") {
        reply.code(404).send({ error: "conversation_not_found", details: rpcErr.message });
        return;
      }
      if (rpcErr.message?.includes("forbidden") || rpcErr.message?.includes("permission")) {
        reply.code(403).send({ error: "forbidden", details: rpcErr.message });
        return;
      }
      reply.code(400).send({ error: "close_failed", details: rpcErr.message });
      return;
    }

    reply.send({ ok: true, conversation: data });
  });

  app.post("/api/conversations/:id/unclaim", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);
    const { id: conversationId } = req.params as { id: string };

    const { data: beforeConv, error: beforeErr } = await supabase
      .from("conversations")
      .select("id, tenant_id, status_fila, assigned_user_id")
      .eq("tenant_id", tenantId)
      .eq("id", conversationId)
      .maybeSingle();

    if (beforeErr || !beforeConv) {
      reply.code(404).send({ error: "conversation_not_found" });
      return;
    }

    if (beforeConv.status_fila === "finalizado") {
      reply.code(400).send({ error: "already_closed" });
      return;
    }

    if (beforeConv.assigned_user_id && beforeConv.assigned_user_id !== userId) {
      try {
        await requireAnyRole(userId, tenantId, ["coordenador", "admin"]);
      } catch {
        reply.code(403).send({ error: "forbidden" });
        return;
      }
    }

    const nowIso = new Date().toISOString();
    const { data: afterConv, error: updErr } = await supabase
      .from("conversations")
      .update({
        assigned_user_id: null,
        status_fila: "aguardando_atendimento",
        updated_at: nowIso
      })
      .eq("tenant_id", tenantId)
      .eq("id", conversationId)
      .select("id, status_fila, assigned_user_id, updated_at")
      .maybeSingle();

    if (updErr || !afterConv) {
      reply.code(500).send({ error: "update_failed", details: updErr?.message });
      return;
    }

    const reason = (req.body as any)?.reason ?? null;
    await supabase.from("audit_logs").insert({
      tenant_id: tenantId,
      actor_user_id: userId,
      action: "unclaim_conversation",
      entity_type: "conversations",
      entity_id: conversationId,
      ip: (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? null,
      user_agent: req.headers["user-agent"] ?? null,
      before_json: { status_fila: beforeConv.status_fila, assigned_user_id: beforeConv.assigned_user_id, reason },
      after_json: { status_fila: afterConv.status_fila, assigned_user_id: afterConv.assigned_user_id }
    });

    reply.send({ ok: true });
  });

  // ====== Transferir conversa
  app.post("/api/conversations/:id/transfer", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    try {
      await requireAnyRole(userId, tenantId, ["coordenador", "admin"]);
    } catch {
      reply.code(403).send({ error: "forbidden" });
      return;
    }

    const { id: conversationId } = req.params as { id: string };
    const parsed = TransferSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
      return;
    }

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .eq("user_id", parsed.data.user_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (profileErr) {
      reply.code(500).send({ error: "profile_check_failed", details: profileErr.message });
      return;
    }
    if (!profile) {
      reply.code(404).send({ error: "user_not_found", message: "O atendente selecionado não foi encontrado." });
      return;
    }

    try {
      await requireTenantScopedConversation(tenantId, conversationId);
    } catch {
      reply.code(404).send({ error: "conversation_not_found" });
      return;
    }

    const token = req.headers.authorization?.slice("Bearer ".length);
    if (!token) {
      reply.code(401).send({ error: "missing_auth" });
      return;
    }

    const userClient = createUserClient(token);

    const { data, error: rpcErr } = await userClient.rpc("transfer_conversation", {
      p_conversation_id: conversationId,
      p_to_user_id: parsed.data.user_id
    });
    if (rpcErr) {
      reply.code(400).send({ error: "transfer_failed", details: rpcErr.message });
      return;
    }

    reply.send({ ok: true });
  });

  // ====== Devolver conversa para fila
  app.post("/api/conversations/:id/return-to-queue", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    const { id: conversationId } = req.params as { id: string };

    try {
      await requireTenantScopedConversation(tenantId, conversationId);
    } catch {
      reply.code(404).send({ error: "conversation_not_found" });
      return;
    }

    // Buscar a conversa para verificar permissões
    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .select("assigned_user_id")
      .eq("id", conversationId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (convErr || !conv) {
      reply.code(404).send({ error: "conversation_not_found" });
      return;
    }

    // Verificar se o usuário pode devolver:
    // 1. Se for admin/coordenador, pode devolver qualquer conversa
    // 2. Se não for, só pode devolver a própria conversa
    const isAdmin = await requireAnyRole(userId, tenantId, ["coordenador", "admin"]).then(() => true).catch(() => false);
    
    if (!isAdmin && conv.assigned_user_id !== userId) {
      reply.code(403).send({ error: "forbidden", message: "Você só pode devolver suas próprias conversas." });
      return;
    }

    // Devolver para fila
    const { error: updateErr } = await supabase
      .from("conversations")
      .update({
        assigned_user_id: null,
        status_fila: "aguardando_atendimento",
        updated_at: new Date().toISOString()
      })
      .eq("id", conversationId)
      .eq("tenant_id", tenantId);

    if (updateErr) {
      reply.code(500).send({ error: "update_failed", details: updateErr.message });
      return;
    }

    reply.send({ ok: true });
  });

  // ====== Movimentação de etapa
  app.post("/api/conversations/:id/move-stage", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    const { id: conversationId } = req.params as { id: string };
    const parsed = MoveStageSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
      return;
    }

    try {
      await requireTenantScopedConversation(tenantId, conversationId);
    } catch {
      reply.code(404).send({ error: "conversation_not_found" });
      return;
    }

    const { data: stage, error: stageErr } = await supabase
      .from("funnel_stages")
      .select("id")
      .eq("id", parsed.data.stage_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (stageErr || !stage) {
      reply.code(404).send({ error: "stage_not_found" });
      return;
    }

    const { data: currentConv } = await supabase
      .from("conversations")
      .select("current_stage_id")
      .eq("id", conversationId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!currentConv) {
      reply.code(404).send({ error: "conversation_not_found" });
      return;
    }

    if (currentConv.current_stage_id === parsed.data.stage_id) {
      reply.code(400).send({ error: "already_at_stage" });
      return;
    }

    const now = new Date().toISOString();
    await supabase
      .from("conversations")
      .update({
        current_stage_id: parsed.data.stage_id,
        last_stage_moved_at: now,
        updated_at: now
      })
      .eq("id", conversationId)
      .eq("tenant_id", tenantId);

    await supabase.from("funnel_moves").insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      from_stage_id: currentConv.current_stage_id,
      to_stage_id: parsed.data.stage_id,
      moved_by_user_id: userId,
      moved_at: now
    });

    reply.send({ ok: true });
  });

  // ====== SLA
  app.post("/api/conversations/:id/pause-sla", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);
    const { id: conversationId } = req.params as { id: string };
    try {
      await requireTenantScopedConversation(tenantId, conversationId);
    } catch {
      reply.code(404).send({ error: "conversation_not_found" });
      return;
    }
    const { error: updateErr } = await supabase
      .from("sla_timers")
      .update({ paused_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .is("paused_at", null);
    if (updateErr) {
      reply.code(500).send({ error: "update_failed" });
      return;
    }
    reply.send({ ok: true });
  });

  app.post("/api/conversations/:id/resume-sla", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);
    const { id: conversationId } = req.params as { id: string };
    try {
      await requireTenantScopedConversation(tenantId, conversationId);
    } catch {
      reply.code(404).send({ error: "conversation_not_found" });
      return;
    }
    const { error: updateErr } = await supabase
      .from("sla_timers")
      .update({ paused_at: null })
      .eq("conversation_id", conversationId)
      .not("paused_at", "is", null);
    if (updateErr) {
      reply.code(500).send({ error: "update_failed" });
      return;
    }
    reply.send({ ok: true });
  });

  app.get("/api/conversations/:id/sla-timer", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);
    const { id: conversationId } = req.params as { id: string };
    try {
      await requireTenantScopedConversation(tenantId, conversationId);
    } catch {
      reply.code(404).send({ error: "conversation_not_found" });
      return;
    }

    const { data, error } = await supabase
      .from("sla_timers")
      .select("due_at, paused_at, started_at")
      .eq("tenant_id", tenantId)
      .eq("conversation_id", conversationId)
      .maybeSingle();

    if (error) {
      reply.code(500).send({ error: "db_error", details: error.message });
      return;
    }

    reply.send({ timer: data ?? null });
  });

  // ====== Tasks
  app.get("/api/conversations/:id/tasks", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);
    const convId = (req.params as any).id as string;
    try {
      await requireTenantScopedConversation(tenantId, convId);
    } catch {
      reply.code(404).send({ error: "conversation_not_found" });
      return;
    }
    const { data, error } = await supabase
      .from("conversation_tasks")
      .select("id,title,due_at,status,created_at,reminder_enabled")
      .eq("tenant_id", tenantId)
      .eq("conversation_id", convId)
      .order("created_at", { ascending: false });
    if (error) {
      const message = String((error as any)?.message ?? "");
      const code = String((error as any)?.code ?? "");
      const missing =
        code === "42P01" ||
        /conversation_tasks/i.test(message) && /does not exist|relation/i.test(message);
      if (missing) {
        reply.send({ items: [], not_configured: true });
        return;
      }
      reply.code(500).send({ error: "db_error", details: message });
      return;
    }
    reply.send({ items: data ?? [] });
  });

  app.post("/api/conversations/:id/tasks", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const parsed = TaskCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);
    const convId = (req.params as any).id as string;
    try {
      await requireTenantScopedConversation(tenantId, convId);
    } catch {
      reply.code(404).send({ error: "conversation_not_found" });
      return;
    }
    const { data, error } = await supabase
      .from("conversation_tasks")
      .insert({
        tenant_id: tenantId,
        conversation_id: convId,
        title: parsed.data.title,
        due_at: parsed.data.due_at ?? null,
        reminder_enabled: parsed.data.reminder_enabled ?? false,
        status: "open",
        created_by: userId,
        assigned_to: userId
      })
      .select("id")
      .single();
    if (error) {
      const message = String((error as any)?.message ?? "");
      const code = String((error as any)?.code ?? "");
      const missing =
        code === "42P01" ||
        /conversation_tasks/i.test(message) && /does not exist|relation/i.test(message);
      if (missing) {
        reply.code(501).send({
          error: "tasks_not_configured",
          message: "Tarefas não estão configuradas no banco (conversation_tasks)."
        });
        return;
      }
      reply.code(500).send({ error: "db_error", details: message });
      return;
    }
    reply.code(201).send({ ok: true, id: data.id });
  });

  app.post("/api/tasks/:id/status", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const parsed = TaskStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);
    const id = (req.params as any).id as string;
    const { error } = await supabase
      .from("conversation_tasks")
      .update({ status: parsed.data.status })
      .eq("tenant_id", tenantId)
      .eq("id", id);
    if (error) {
      const message = String((error as any)?.message ?? "");
      const code = String((error as any)?.code ?? "");
      const missing =
        code === "42P01" ||
        /conversation_tasks/i.test(message) && /does not exist|relation/i.test(message);
      if (missing) {
        reply.code(501).send({
          error: "tasks_not_configured",
          message: "Tarefas não estão configuradas no banco (conversation_tasks)."
        });
        return;
      }
      reply.code(500).send({ error: "db_error", details: message });
      return;
    }
    reply.send({ ok: true });
  });

  // ====== Rate Conversation
  app.post("/api/conversations/:id/rate", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    const { id: conversationId } = req.params as { id: string };
    const parsed = RateConversationSchema.safeParse(req.body);

    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
      return;
    }

    const { data: conversation, error: convErr } = await supabase
      .from("conversations")
      .select("id, tenant_id, contact_id")
      .eq("id", conversationId)
      .eq("tenant_id", tenantId)
      .single();

    if (convErr || !conversation) {
      reply.code(404).send({ error: "conversation_not_found" });
      return;
    }

    let contactPhone = parsed.data.contact_phone;
    if (!contactPhone) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("phone_e164")
        .eq("id", (conversation as any).contact_id)
        .single();
      contactPhone = (contact as any)?.phone_e164 || null;
    }

    const { data: rating, error: insertErr } = await supabase
      .from("conversation_ratings")
      .upsert(
        {
          tenant_id: tenantId,
          conversation_id: conversationId,
          rating: parsed.data.rating,
          comment: parsed.data.comment || null,
          contact_phone: contactPhone
        },
        { onConflict: "conversation_id", ignoreDuplicates: false }
      )
      .select("id")
      .single();

    if (insertErr) {
      reply.code(500).send({ error: "insert_failed", details: insertErr.message });
      return;
    }

    reply.send({ ok: true, rating_id: rating.id });
  });

  // ====== Editar mensagem (WhatsApp API - até 15 minutos)
  app.put("/api/messages/:messageId/edit", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    const { messageId } = req.params as { messageId: string };
    const { text } = req.body as { text: string };

    if (!text || text.trim().length === 0) {
      reply.code(400).send({ error: "text_required" });
      return;
    }

    // 1. Buscar a mensagem
    const { data: message, error: msgErr } = await supabase
      .from("messages")
      .select("id, conversation_id, direction, type, meta_message_id, created_at, body_json")
      .eq("id", messageId)
      .eq("tenant_id", tenantId)
      .single();

    if (msgErr || !message) {
      reply.code(404).send({ error: "message_not_found" });
      return;
    }

    // 2. Validações
    if (message.direction !== "out") {
      reply.code(400).send({ error: "can_only_edit_outbound_messages" });
      return;
    }

    if (message.type !== "text") {
      reply.code(400).send({ error: "can_only_edit_text_messages" });
      return;
    }

    if (!message.meta_message_id) {
      reply.code(400).send({ error: "message_not_sent_via_whatsapp" });
      return;
    }

    // 3. Verificar se está dentro do limite de 15 minutos
    const messageAge = Date.now() - new Date(message.created_at).getTime();
    const fifteenMinutes = 15 * 60 * 1000;
    
    if (messageAge > fifteenMinutes) {
      reply.code(400).send({ 
        error: "edit_window_expired", 
        message: "Mensagens só podem ser editadas até 15 minutos após o envio" 
      });
      return;
    }

    // 4. Verificar permissão na conversa
    try {
      await requireTenantScopedConversation(userId, tenantId, message.conversation_id);
    } catch {
      reply.code(403).send({ error: "forbidden" });
      return;
    }

    // 5. Buscar configuração do WhatsApp
    const { data: waAccount } = await supabase
      .from("whatsapp_accounts")
      .select("phone_number_id")
      .eq("tenant_id", tenantId)
      .single();

    if (!waAccount) {
      reply.code(500).send({ error: "whatsapp_not_configured" });
      return;
    }

    // 6. Chamar API do WhatsApp para editar
    try {
      const whatsappUrl = `https://graph.facebook.com/v21.0/${waAccount.phone_number_id}/messages`;
      const whatsappRes = await fetch(whatsappUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.META_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          message_id: message.meta_message_id,
          text: {
            body: text.trim()
          }
        })
      });

      if (!whatsappRes.ok) {
        const errorData = await whatsappRes.json().catch(() => ({}));
        req.log.error({ err: errorData }, "whatsapp_edit_failed");
        reply.code(500).send({ 
          error: "whatsapp_api_error", 
          details: errorData.error?.message || "Falha ao editar mensagem no WhatsApp" 
        });
        return;
      }

      // 7. Atualizar mensagem no banco
      const { error: updateErr } = await supabase
        .from("messages")
        .update({
          body_json: {
            ...message.body_json,
            text: text.trim(),
            edited: true,
            edited_at: new Date().toISOString()
          }
        })
        .eq("id", messageId);

      if (updateErr) {
        req.log.error({ err: updateErr }, "message_update_failed");
        // Não falhar aqui, pois a mensagem já foi editada no WhatsApp
      }

      reply.send({ ok: true, message: "Mensagem editada com sucesso" });
    } catch (err: any) {
      req.log.error({ err }, "edit_message_failed");
      reply.code(500).send({ error: "edit_failed", message: err.message });
    }
  });
}
