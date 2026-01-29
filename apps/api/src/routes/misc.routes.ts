import { FastifyInstance } from "fastify";
import { getTenantIdForUser, requireAnyRole, requireAuth } from "../lib/auth.js";
import { supabase } from "../lib/supabase.js";
import { CannedUpsertSchema, FunnelStageUpsertSchema, SlaPolicyUpsertSchema } from "../schemas/misc.schemas.js";
import { syncTemplatesForTenant } from "../whatsapp/templates.js";

export async function miscRoutes(app: FastifyInstance) {
  // ====== Canned responses (atalhos)

  app.get("/api/canned-responses", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);
    const { data, error } = await supabase
      .from("canned_responses")
      .select("id,title,shortcut,body_template,created_at")
      .eq("tenant_id", tenantId)
      .order("shortcut", { ascending: true });
    if (error) {
      reply.code(500).send({ error: "db_error" });
      return;
    }
    reply.send({ items: data ?? [] });
  });

  app.post("/api/canned-responses", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const parsed = CannedUpsertSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);
    const { data, error } = await supabase
      .from("canned_responses")
      .insert({
        tenant_id: tenantId,
        title: parsed.data.title,
        shortcut: parsed.data.shortcut,
        body_template: parsed.data.body_template,
        created_by: userId
      })
      .select("id")
      .single();
    if (error) {
      reply.code(500).send({ error: "db_error" });
      return;
    }
    reply.code(201).send({ ok: true, id: data.id });
  });

  app.delete("/api/canned-responses/:id", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);
    const id = (req.params as any).id as string;
    const { error } = await supabase.from("canned_responses").delete().eq("tenant_id", tenantId).eq("id", id);
    if (error) {
      reply.code(500).send({ error: "db_error" });
      return;
    }
    reply.send({ ok: true });
  });

  // ====== Listar etapas do funil
  app.get("/api/funnel-stages", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    const { data, error } = await supabase
      .from("funnel_stages")
      .select("id, name, sort_order")
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true });
    if (error) {
      reply.code(500).send({ error: "query_failed" });
      return;
    }

    reply.send({ items: data ?? [] });
  });

  app.post("/api/funnel-stages", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }

    const parsed = FunnelStageUpsertSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
      return;
    }

    const tenantId = await getTenantIdForUser(userId);
    try {
      await requireAnyRole(userId, tenantId, ["admin", "coordenador"]);
    } catch {
      reply.code(403).send({ error: "forbidden" });
      return;
    }

    if (parsed.data.id) {
      const { error } = await supabase
        .from("funnel_stages")
        .update({ name: parsed.data.name, sort_order: parsed.data.sort_order })
        .eq("tenant_id", tenantId)
        .eq("id", parsed.data.id);
      if (error) {
        reply.code(500).send({ error: "db_error" });
        return;
      }
      reply.send({ ok: true, id: parsed.data.id });
      return;
    }

    const { data, error } = await supabase
      .from("funnel_stages")
      .insert({ tenant_id: tenantId, name: parsed.data.name, sort_order: parsed.data.sort_order })
      .select("id")
      .single();
    if (error) {
      reply.code(500).send({ error: "db_error" });
      return;
    }
    reply.code(201).send({ ok: true, id: data.id });
  });

  app.delete("/api/funnel-stages/:id", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }

    const tenantId = await getTenantIdForUser(userId);
    try {
      await requireAnyRole(userId, tenantId, ["admin", "coordenador"]);
    } catch {
      reply.code(403).send({ error: "forbidden" });
      return;
    }

    const id = (req.params as any).id as string;
    const { error } = await supabase.from("funnel_stages").delete().eq("tenant_id", tenantId).eq("id", id);
    if (error) {
      reply.code(500).send({ error: "db_error" });
      return;
    }
    reply.send({ ok: true });
  });

  // ====== SLA policies
  app.get("/api/sla-policies", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);
    try {
      await requireAnyRole(userId, tenantId, ["admin", "coordenador"]);
    } catch {
      reply.code(403).send({ error: "forbidden" });
      return;
    }

    const { data, error } = await supabase
      .from("sla_policies")
      .select("id, stage_id, contact_status, response_seconds, warning_threshold_percent, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (error) {
      reply.code(500).send({ error: "query_failed" });
      return;
    }
    reply.send({ items: data ?? [] });
  });

  app.post("/api/sla-policies", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }

    const parsed = SlaPolicyUpsertSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
      return;
    }

    const tenantId = await getTenantIdForUser(userId);
    try {
      await requireAnyRole(userId, tenantId, ["admin", "coordenador"]);
    } catch {
      reply.code(403).send({ error: "forbidden" });
      return;
    }

    if (parsed.data.id) {
      const { error } = await supabase
        .from("sla_policies")
        .update({
          stage_id: parsed.data.stage_id ?? null,
          contact_status: parsed.data.contact_status ?? null,
          response_seconds: parsed.data.response_seconds,
          warning_threshold_percent: parsed.data.warning_threshold_percent
        })
        .eq("tenant_id", tenantId)
        .eq("id", parsed.data.id);
      if (error) {
        reply.code(500).send({ error: "db_error" });
        return;
      }
      reply.send({ ok: true, id: parsed.data.id });
      return;
    }

    const { data, error } = await supabase
      .from("sla_policies")
      .insert({
        tenant_id: tenantId,
        stage_id: parsed.data.stage_id ?? null,
        contact_status: parsed.data.contact_status ?? null,
        response_seconds: parsed.data.response_seconds,
        warning_threshold_percent: parsed.data.warning_threshold_percent
      })
      .select("id")
      .single();
    if (error) {
      reply.code(500).send({ error: "db_error" });
      return;
    }
    reply.code(201).send({ ok: true, id: data.id });
  });

  app.delete("/api/sla-policies/:id", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }

    const tenantId = await getTenantIdForUser(userId);
    try {
      await requireAnyRole(userId, tenantId, ["admin", "coordenador"]);
    } catch {
      reply.code(403).send({ error: "forbidden" });
      return;
    }

    const id = (req.params as any).id as string;
    const { error } = await supabase.from("sla_policies").delete().eq("tenant_id", tenantId).eq("id", id);
    if (error) {
      reply.code(500).send({ error: "db_error" });
      return;
    }
    reply.send({ ok: true });
  });

  // ====== Templates Meta WhatsApp
  app.get("/api/whatsapp/templates", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    const { data, error } = await supabase
      .from("whatsapp_templates")
      .select("id, name, language, category, approved_status, components_json, last_synced_at")
      .eq("tenant_id", tenantId)
      .order("name", { ascending: true });
    if (error) {
      reply.code(500).send({ error: "query_failed" });
      return;
    }

    reply.send({ items: data ?? [] });
  });

  app.post("/api/whatsapp/templates/sync", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    // Verificar permissão (admin/coordenador)
    try {
      await requireAnyRole(userId, tenantId, ["admin", "coordenador"]);
    } catch {
      reply.code(403).send({ error: "forbidden" });
      return;
    }

    // Buscar whatsapp_account do tenant
    const { data: wa, error: waErr } = await supabase
      .from("whatsapp_accounts")
      .select("phone_number_id")
      .eq("tenant_id", tenantId)
      .single();
    if (waErr || !wa?.phone_number_id) {
      reply.code(404).send({ error: "whatsapp_account_not_configured" });
      return;
    }

    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!accessToken) {
      reply.code(503).send({ error: "whatsapp_not_configured" });
      return;
    }

    try {
      const result = await syncTemplatesForTenant({
        supabase,
        tenantId,
        phoneNumberId: wa.phone_number_id as string,
        accessToken,
        graphVersion: process.env.META_GRAPH_VERSION || "v21.0"
      });
      reply.send({ ok: true, synced: result.synced, total: result.total });
    } catch (err: any) {
      reply.code(500).send({ error: "sync_failed", details: err.message });
    }
  });
}
