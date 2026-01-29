import { FastifyInstance } from "fastify";
import { AccessLogSchema } from "../schemas/ops.schemas.js";
import { getTenantIdForUser, requireAnyRole, requireAuth } from "../lib/auth.js";
import { env, envLoadInfo } from "../config/env.js";
import { supabase } from "../lib/supabase.js";

export async function opsRoutes(app: FastifyInstance) {
  // Health Check Global
  app.get("/health", async () => ({ ok: true }));
  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/config-status", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }

    const tenantId = await getTenantIdForUser(userId);

    const now = new Date();
    const overdueIso = new Date(now.getTime() - 2 * 60 * 1000).toISOString();

    const [{ data: waAccount }, { count: templatesTotal }, { count: templatesApproved }, { count: queuedOverdue }, { count: webhookOverdueGlobal }] =
      await Promise.all([
        supabase
          .from("whatsapp_accounts")
          .select("phone_number_id,waba_id")
          .eq("tenant_id", tenantId)
          .maybeSingle(),
        supabase.from("whatsapp_templates").select("id", { head: true, count: "exact" }).eq("tenant_id", tenantId),
        supabase
          .from("whatsapp_templates")
          .select("id", { head: true, count: "exact" })
          .eq("tenant_id", tenantId)
          .eq("approved_status", "APPROVED"),
        supabase
          .from("jobs")
          .select("id", { head: true, count: "exact" })
          .eq("tenant_id", tenantId)
          .eq("status", "queued")
          .lt("run_at", overdueIso),
        supabase
          .from("whatsapp_webhook_events")
          .select("id", { head: true, count: "exact" })
          .is("processed_at", null)
          .lt("received_at", overdueIso)
      ]);

    const tenantWhatsAppAccountConfigured = !!waAccount?.phone_number_id && !!waAccount?.waba_id;
    const missingEnv: string[] = [];
    if (!env.META_APP_SECRET) missingEnv.push("META_APP_SECRET");
    if (!env.WHATSAPP_VERIFY_TOKEN) missingEnv.push("WHATSAPP_VERIFY_TOKEN (ou WEBHOOK_VERIFY_TOKEN)");
    if (!env.WHATSAPP_ACCESS_TOKEN) missingEnv.push("WHATSAPP_ACCESS_TOKEN");

    reply.send({
      ok: true,
      tenant_id: tenantId,
      env: {
        cwd: envLoadInfo.cwd,
        dotenv_config_path_env: envLoadInfo.dotenv_config_path_env,
        loaded_env_path: envLoadInfo.loaded_env_path,
        loaded_env_paths: (envLoadInfo as any).loaded_env_paths ?? undefined
      },
      api: {
        webhook_configured: !!env.META_APP_SECRET && !!env.WHATSAPP_VERIFY_TOKEN,
        whatsapp_access_token_present: !!env.WHATSAPP_ACCESS_TOKEN,
        missing_env: missingEnv
      },
      tenant: {
        whatsapp_account_configured: tenantWhatsAppAccountConfigured,
        whatsapp_phone_number_id_present: !!waAccount?.phone_number_id,
        whatsapp_waba_id_present: !!waAccount?.waba_id
      },
      whatsapp: {
        templates_total: templatesTotal ?? 0,
        templates_approved: templatesApproved ?? 0
      },
      queues: {
        queued_jobs_overdue: queuedOverdue ?? 0,
        webhook_events_overdue_global: webhookOverdueGlobal ?? 0
      }
    });
  });

  // Access Log (LGPD)
  app.post("/api/access-log", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const parsed = AccessLogSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_body" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);
    await supabase.from("access_logs").insert({
      tenant_id: tenantId,
      actor_user_id: userId,
      resource_type: parsed.data.resource_type,
      resource_id: parsed.data.resource_id,
      ip: (req.ip as any) ?? null,
      user_agent: (req.headers["user-agent"] as string | undefined) ?? null
    });
    reply.send({ ok: true });
  });

  // Ops Dashboard Health
  app.get("/api/ops/health", async (req, reply) => {
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

    const [{ count: queuedJobs }, { count: pendingWebhook }, { count: breached }] = await Promise.all([
      supabase.from("jobs").select("id", { head: true, count: "exact" }).eq("status", "queued"),
      supabase.from("whatsapp_webhook_events").select("id", { head: true, count: "exact" }).is("processed_at", null),
      supabase.from("sla_timers").select("conversation_id", { head: true, count: "exact" }).not("breached_at", "is", null)
    ]);

    reply.send({
      ok: true,
      tenant_id: tenantId,
      queued_jobs: queuedJobs ?? 0,
      pending_webhook_events: pendingWebhook ?? 0,
      sla_breached: breached ?? 0
    });
  });
}
