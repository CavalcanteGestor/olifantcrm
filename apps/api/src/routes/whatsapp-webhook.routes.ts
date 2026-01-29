import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import crypto from "node:crypto";
import { env } from "../config/env.js";
import { verifyMetaSignatureOrThrow } from "../lib/meta.js";
import { supabase } from "../lib/supabase.js";

async function insertWebhookEvent(payload: unknown, eventHash: string) {
  const { error } = await supabase.from("whatsapp_webhook_events").insert({
    event_hash: eventHash,
    raw_json: payload
  });
  if (error) throw error;
}

export async function whatsappWebhookRoutes(app: FastifyInstance) {
  // Webhook verification (Meta)
  app.get("/api/webhooks/whatsapp", async (req, reply) => {
    if (!env.WHATSAPP_VERIFY_TOKEN) {
      reply.code(503).send("WhatsApp webhook não configurado");
      return;
    }
    const q = req.query as Record<string, string | undefined>;
    const mode = q["hub.mode"];
    const token = q["hub.verify_token"];
    const challenge = q["hub.challenge"];

    if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN && challenge) {
      reply.code(200).send(challenge);
      return;
    }
    reply.code(403).send("Forbidden");
  });

  // Webhook inbound (Meta)
  app.post(
    "/api/webhooks/whatsapp",
    {
      config: {
        rateLimit: {
          max: 300,
          timeWindow: "1 minute"
        }
      }
    },
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!env.META_APP_SECRET) {
        reply.code(503).send({ error: "whatsapp_not_configured" });
        return;
      }
      const signature = req.headers["x-hub-signature-256"] as string | undefined;
      const rawBody = req.rawBody;
      if (!rawBody) {
        reply.code(400).send({ error: "missing_raw_body" });
        return;
      }

      try {
        verifyMetaSignatureOrThrow(rawBody, signature);
      } catch (e) {
        req.log.warn({ err: e }, "meta_signature_invalid");
        reply.code(401).send({ error: "invalid_signature" });
        return;
      }

      try {
        const eventHash = crypto.createHash("sha256").update(rawBody).digest("hex");
        await insertWebhookEvent(req.body, eventHash);
      } catch (e) {
        req.log.error({ err: e }, "webhook_event_insert_failed");
        reply.code(500).send({ error: "persist_failed" });
        return;
      }

      reply.code(200).send({ ok: true });
    }
  );
}
