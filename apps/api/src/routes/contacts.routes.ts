import { FastifyInstance } from "fastify";
import { getTenantIdForUser, requireAuth } from "../lib/auth.js";
import { createUserClient, supabase } from "../lib/supabase.js";
import { ContactUpdateSchema, MergeSchema } from "../schemas/contacts.schemas.js";
import { env } from "../config/env.js";
import { createClient } from "@supabase/supabase-js";

export async function contactsRoutes(app: FastifyInstance) {
  // Atualizar contato
  app.put("/api/contacts/:id", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    const { id: contactId } = req.params as { id: string };
    const parsed = ContactUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
      return;
    }

    const { data: contact, error: contactErr } = await supabase
      .from("contacts")
      .select("id, tenant_id")
      .eq("id", contactId)
      .eq("tenant_id", tenantId)
      .single();
    if (contactErr || !contact) {
      reply.code(404).send({ error: "contact_not_found" });
      return;
    }

    const updateData: any = { updated_at: new Date().toISOString() };
    if (parsed.data.display_name !== undefined) updateData.display_name = parsed.data.display_name;
    if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
    if (parsed.data.tags !== undefined) updateData.tags = parsed.data.tags;
    if (parsed.data.internal_notes !== undefined) updateData.internal_notes = parsed.data.internal_notes;

    const { error: updateErr } = await supabase.from("contacts").update(updateData).eq("id", contactId).eq("tenant_id", tenantId);
    if (updateErr) {
      reply.code(500).send({ error: "update_failed" });
      return;
    }

    reply.send({ ok: true });
  });

  // Histórico do contato
  app.get("/api/contacts/:id/history", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    const { id: contactId } = req.params as { id: string };

    const { data: contact, error: contactErr } = await supabase
      .from("contacts")
      .select("id, tenant_id")
      .eq("id", contactId)
      .eq("tenant_id", tenantId)
      .single();
    if (contactErr || !contact) {
      reply.code(404).send({ error: "contact_not_found" });
      return;
    }

    const { data: conversations, error: convErr } = await supabase
      .from("conversations")
      .select("id")
      .eq("contact_id", contactId)
      .eq("tenant_id", tenantId);
    if (convErr) {
      reply.code(500).send({ error: "query_failed" });
      return;
    }
    const convIds = (conversations ?? []).map((c) => c.id);

    const [messages, moves, tasks] = await Promise.all([
      convIds.length > 0
        ? supabase
          .from("messages")
          .select("id, direction, type, body_json, created_at, conversation_id, sent_by_user_id, profiles(full_name)")
          .in("conversation_id", convIds)
          .order("created_at", { ascending: false })
          .limit(100)
        : Promise.resolve({ data: [], error: null }),
      convIds.length > 0
        ? supabase
          .from("funnel_moves")
          .select("id, from_stage_id, to_stage_id, moved_at, moved_by_user_id, conversation_id, funnel_stages!funnel_moves_to_stage_id(name)")
          .in("conversation_id", convIds)
          .order("moved_at", { ascending: false })
          .limit(50)
        : Promise.resolve({ data: [], error: null }),
      convIds.length > 0
        ? supabase
          .from("conversation_tasks")
          .select("id, title, status, created_at, conversation_id")
          .in("conversation_id", convIds)
          .order("created_at", { ascending: false })
          .limit(50)
        : Promise.resolve({ data: [], error: null })
    ]);

    const items: any[] = [];
    (messages.data ?? []).forEach((m) => {
      items.push({
        type: "message",
        id: m.id,
        created_at: m.created_at,
        data: {
          direction: m.direction,
          type: m.type,
          body_json: m.body_json,
          conversation_id: m.conversation_id,
          sent_by_user_id: (m as any).sent_by_user_id,
          profiles: (m as any).profiles
        }
      });
    });
    (moves.data ?? []).forEach((m) => {
      items.push({
        type: "move",
        id: m.id,
        created_at: m.moved_at,
        data: {
          from_stage: (m as any).funnel_stages?.name ?? null,
          to_stage: (m as any).funnel_stages?.name ?? null,
          conversation_id: m.conversation_id
        }
      });
    });
    (tasks.data ?? []).forEach((t) => {
      items.push({
        type: "task",
        id: t.id,
        created_at: t.created_at,
        data: { title: t.title, status: t.status, conversation_id: t.conversation_id }
      });
    });

    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    reply.send({ items: items.slice(0, 100) });
  });

  // Merge contatos
  app.post("/api/contacts/merge", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const parsed = MergeSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
      return;
    }
    const authHeader = req.headers.authorization as string;
    const token = authHeader.slice("Bearer ".length);

    // RPC usa auth.uid() e current_tenant_id(): precisamos executar com JWT do usuário.
    // Usando createClient diretamente pois o helper está em ../lib/supabase.js
    const userClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const { error } = await (userClient as any).rpc("merge_contacts", {
      p_keep_contact_id: parsed.data.keep_contact_id,
      p_merge_contact_id: parsed.data.merge_contact_id
    });
    if (error) {
      reply.code(409).send({ error: "merge_failed" });
      return;
    }
    reply.send({ ok: true });
  });
}
