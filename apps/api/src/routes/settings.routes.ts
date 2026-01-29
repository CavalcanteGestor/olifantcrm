import { FastifyInstance } from "fastify";
import { z } from "zod";
import { supabase } from "../lib/supabase.js";
import { requireAuth } from "../lib/auth.js";

export async function settingsRoutes(app: FastifyInstance) {
  // --- Automation Settings ---
  // Fixes missing endpoints for AutomationSettingsPage
  app.get("/api/admin/automation-settings", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("user_id", userId).single();
    if (!profile?.tenant_id) return reply.code(404).send({ error: "Tenant not found" });

    const { data, error } = await supabase
      .from("tenants")
      .select("*")
      .eq("id", profile.tenant_id)
      .single();

    if (error) return reply.code(500).send({ error: error.message });

    reply.send({
      rating_message_enabled: data.rating_message_enabled,
      close_message_enabled: data.close_message_enabled,
      close_message_template: data.close_message_template,
      business_hours_enabled: data.business_hours_enabled,
      business_hours: data.business_hours,
      outside_hours_message: data.outside_hours_message
    });
  });

  app.put("/api/admin/automation-settings", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("user_id", userId).single();
    if (!profile?.tenant_id) return reply.code(404).send({ error: "Tenant not found" });

    const schema = z.object({
      rating_message_enabled: z.boolean().optional(),
      close_message_enabled: z.boolean().optional(),
      close_message_template: z.string().optional(),
      business_hours_enabled: z.boolean().optional(),
      business_hours: z.any().optional(),
      outside_hours_message: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error });

    const { error } = await supabase
      .from("tenants")
      .update(parsed.data)
      .eq("id", profile.tenant_id);

    if (error) return reply.code(500).send({ error: error.message });
    reply.send({ ok: true });
  });

  // --- Queue Settings (NEW) ---
  app.get("/api/admin/queue-settings", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("user_id", userId).single();
    if (!profile?.tenant_id) return reply.code(404).send({ error: "Tenant not found" });

    const { data, error } = await supabase
      .from("tenants")
      .select("*") // Use * to avoid error if column is missing
      .eq("id", profile.tenant_id)
      .single();

    if (error) return reply.code(500).send({ error: error.message });

    reply.send({
      no_response_alert_minutes: data.no_response_alert_minutes ?? 5,
      // @ts-ignore
      follow_up_alert_minutes: data.follow_up_alert_minutes ?? 120
    });
  });

  app.put("/api/admin/queue-settings", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("user_id", userId).single();
    if (!profile?.tenant_id) return reply.code(404).send({ error: "Tenant not found" });

    const schema = z.object({
      no_response_alert_minutes: z.number().min(1).max(1440),
      follow_up_alert_minutes: z.number().min(1).max(10080),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error });

    // Try to update both. If it fails (column missing), try updating only supported columns.
    const { error } = await supabase
      .from("tenants")
      .update(parsed.data)
      .eq("id", profile.tenant_id);

    if (error) {
      // If error is about missing column, try updating only no_response_alert_minutes
      if (error.message.includes("column") && error.message.includes("does not exist")) {
         const { error: retryError } = await supabase
            .from("tenants")
            .update({ no_response_alert_minutes: parsed.data.no_response_alert_minutes })
            .eq("id", profile.tenant_id);
         
         if (retryError) return reply.code(500).send({ error: retryError.message });
         return reply.send({ ok: true, warning: "follow_up_alert_minutes_not_saved_schema_mismatch" });
      }
      return reply.code(500).send({ error: error.message });
    }
    reply.send({ ok: true });
  });
}
