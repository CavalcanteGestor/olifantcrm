import { FastifyInstance } from "fastify";
import { getTenantIdForUser, requireAnyRole, requireAuth } from "../lib/auth.js";
import { supabase } from "../lib/supabase.js";
import { RangeSchema } from "../schemas/reports.schemas.js";

export async function reportsRoutes(app: FastifyInstance) {
  app.get("/api/reports/agents", async (req, reply) => {
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

    const q = req.query as any;
    const parsed = RangeSchema.safeParse({ from: q.from, to: q.to });
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_range" });
      return;
    }

    const { data, error } = await supabase.rpc("report_agents", {
      p_tenant_id: tenantId,
      p_from: parsed.data.from,
      p_to: parsed.data.to
    });
    if (error) {
      reply.code(500).send({ error: "report_failed" });
      return;
    }
    reply.send({ items: data ?? [] });
  });

  app.get("/api/reports/funnel", async (req, reply) => {
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

    const q = req.query as any;
    const parsed = RangeSchema.safeParse({ from: q.from, to: q.to });
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_range" });
      return;
    }

    const { data, error } = await supabase.rpc("report_funnel_moves", {
      p_tenant_id: tenantId,
      p_from: parsed.data.from,
      p_to: parsed.data.to
    });
    
    // Se a função ainda não está disponível (cache do PostgREST), retorna array vazio
    if (error) {
      console.warn("report_funnel_moves error (may be PostgREST cache):", error.message);
      reply.send({ items: [] });
      return;
    }
    reply.send({ items: data ?? [] });
  });

  app.get("/api/reports/messages-daily", async (req, reply) => {
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

    const q = req.query as any;
    const parsed = RangeSchema.safeParse({ from: q.from, to: q.to });
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_range" });
      return;
    }

    const { data, error } = await supabase.rpc("report_message_volume_daily", {
      p_tenant_id: tenantId,
      p_from: parsed.data.from,
      p_to: parsed.data.to
    });
    if (error) {
      reply.code(500).send({ error: "report_failed" });
      return;
    }
    reply.send({ items: data ?? [] });
  });

  app.get("/api/reports/whatsapp-costs", async (req, reply) => {
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

    const q = req.query as any;
    const parsed = RangeSchema.safeParse({ from: q.from, to: q.to });
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_range" });
      return;
    }

    const { data, error } = await supabase.rpc("get_whatsapp_costs", {
      p_start_date: parsed.data.from,
      p_end_date: parsed.data.to
    });
    
    // Se não houver dados ou erro, retorna array vazio (não crítico)
    if (error || !data) {
      console.warn("get_whatsapp_costs error:", error?.message);
      reply.send({ items: [] });
      return;
    }
    reply.send({ items: data });
  });
}
