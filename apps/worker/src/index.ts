import { createClient } from "@supabase/supabase-js";
import pino from "pino";
import { z } from "zod";
import { processPendingWhatsAppWebhookEvents } from "./whatsapp/inbound.js";
import { processOutboundJobs } from "./jobs/outbound.js";
import { updateSlaTimers } from "./sla/engine.js";
import { captureException, initObservability } from "./observability.js";
import { runRetention } from "./lgpd/retention.js";
import { syncAllTemplates } from "./whatsapp/templates.js";
import { sendRatingRequests } from "./ratings/send.js";
import { checkAndAwardBadges } from "./badges/check.js";
import { checkTimeouts } from "./jobs/timeouts.js";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

function findEnvFile() {
  const cwd = process.cwd();
  const parents = [cwd, path.resolve(cwd, "..")];
  const baseCandidates = [".env", ".env.development", ".env.production"];
  const localCandidates = [".env.local", "env.local"];

  const loaded: string[] = [];
  for (const base of parents) {
    for (const c of baseCandidates) {
      const full = path.join(base, c);
      if (fs.existsSync(full)) loaded.push(full);
    }
    for (const c of localCandidates) {
      const full = path.join(base, c);
      if (fs.existsSync(full)) loaded.push(full);
    }
  }
  const unique = [...new Set(loaded)];
  return { cwd, paths: unique };
}

const envFile = process.env.DOTENV_CONFIG_PATH
  ? { cwd: process.cwd(), paths: [path.resolve(process.cwd(), process.env.DOTENV_CONFIG_PATH)] }
  : findEnvFile();

if (envFile.paths.length > 0) {
  for (const p of envFile.paths) {
    const isLocal = p.endsWith(".env.local") || p.endsWith(`${path.sep}env.local`);
    dotenv.config({ path: p, override: isLocal });
  }
}

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  WORKER_POLL_MS: z.coerce.number().int().positive().default(250),
  META_GRAPH_VERSION: z.string().default("v21.0"),
  WHATSAPP_ACCESS_TOKEN: z.string().optional()
});

const env = EnvSchema.parse(process.env);
const log = pino({ level: env.NODE_ENV === "production" ? "info" : "debug" });

initObservability({
  NODE_ENV: env.NODE_ENV,
  SERVICE_NAME: "crmolifant-worker",
  ...(process.env.OTEL_ENABLED ? { OTEL_ENABLED: process.env.OTEL_ENABLED } : {}),
  ...(process.env.OTEL_EXPORTER_OTLP_ENDPOINT ? { OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT } : {}),
  ...(process.env.SENTRY_DSN ? { SENTRY_DSN: process.env.SENTRY_DSN } : {})
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const tenantCache = new Map<string, string>();
const stageCache = new Map<string, string | null>();
const tickCircuit = { openUntil: 0, failures: 0 };
const workerCircuit = { openUntil: 0, failures: 0, lastLoggedAt: 0 };

let shouldStop = false;
let lastRetentionDay = "";
let lastTemplateSyncDay = "";
let lastBadgeCheckDay = "";

process.on("SIGINT", () => {
  log.info("SIGINT received, stopping worker...");
  shouldStop = true;
});
process.on("SIGTERM", () => {
  log.info("SIGTERM received, stopping worker...");
  shouldStop = true;
});

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function tick() {
  // Inbound: processar eventos brutos do webhook e materializar em contacts/conversations/messages.
  // Observação: idempotência garantida por:
  // - whatsapp_webhook_events.event_hash (upsert no webhook)
  // - messages.meta_message_id (upsert no worker)
  const processed = await processPendingWhatsAppWebhookEvents({
    supabase,
    limit: 25,
    tenantCache,
    stageCache,
    ...(env.WHATSAPP_ACCESS_TOKEN
      ? { meta: { graphVersion: env.META_GRAPH_VERSION, accessToken: env.WHATSAPP_ACCESS_TOKEN } }
      : {}),
    log
  });
  if (processed > 0) {
    log.info({ processed }, "whatsapp_inbound_batch_done");
  }

  // Outbound: enviar jobs enfileirados para a Meta com retry/backoff + circuit breaker.
  if (env.WHATSAPP_ACCESS_TOKEN) {
    const outboundProcessed = await processOutboundJobs({
      supabase,
      meta: { graphVersion: env.META_GRAPH_VERSION, accessToken: env.WHATSAPP_ACCESS_TOKEN },
      limit: 25,
      log,
      circuit: tickCircuit
    });
    if (outboundProcessed > 0) {
      log.info({ outboundProcessed }, "whatsapp_outbound_batch_done");
    }
  }

  // Ratings: enviar mensagens de avaliação para conversas recém-finalizadas
  if (env.WHATSAPP_ACCESS_TOKEN) {
    const ratingSent = await sendRatingRequests({
      supabase,
      meta: { graphVersion: env.META_GRAPH_VERSION, accessToken: env.WHATSAPP_ACCESS_TOKEN },
      log
    });
    if (ratingSent > 0) {
      log.info({ ratingSent }, "rating_requests_sent");
    }
  }

  // SLA: recalcular timers (leve, baseado em timestamps e políticas)
  await updateSlaTimers({ supabase, log });

  // Timeouts: verificar regras de negócio (5min sem resposta do atendente, 2h sem resposta do cliente)
  await checkTimeouts({ supabase, log });

  // LGPD: aplicar retenção 1x por dia (UTC)
  const day = new Date().toISOString().slice(0, 10);
  if (day !== lastRetentionDay) {
    await runRetention({ supabase, log, bucket: "whatsapp-media" });
    lastRetentionDay = day;
  }

  // Templates: sincronizar 1x por dia (UTC) se tiver access token
  if (env.WHATSAPP_ACCESS_TOKEN && day !== lastTemplateSyncDay) {
    await syncAllTemplates({
      supabase,
      accessToken: env.WHATSAPP_ACCESS_TOKEN,
      graphVersion: env.META_GRAPH_VERSION,
      log
    });
    lastTemplateSyncDay = day;
  }

  // Badges: verificar e atribuir badges 1x por dia (UTC)
  if (day !== lastBadgeCheckDay) {
    const awarded = await checkAndAwardBadges({ supabase, log });
    if (awarded > 0) {
      log.info({ awarded }, "badges_awarded");
    }
    lastBadgeCheckDay = day;
  }
}

log.info("worker_started");
while (!shouldStop) {
  const now = Date.now();
  if (workerCircuit.openUntil > now) {
    await sleep(Math.min(workerCircuit.openUntil - now, 5000));
    continue;
  }
  try {
    await tick();
    workerCircuit.failures = 0;
    workerCircuit.openUntil = 0;
  } catch (e) {
    captureException(e);
    workerCircuit.failures = Math.min(workerCircuit.failures + 1, 10);
    const backoffMs = Math.min(30000, 1000 * 2 ** (workerCircuit.failures - 1));
    workerCircuit.openUntil = Date.now() + backoffMs;
    const shouldLog = Date.now() - workerCircuit.lastLoggedAt > 5000;
    if (shouldLog) {
      workerCircuit.lastLoggedAt = Date.now();
      log.error({ err: e, failures: workerCircuit.failures, backoff_ms: backoffMs }, "worker_tick_failed");
    }
  }
  await sleep(env.WORKER_POLL_MS);
}
log.info("worker_stopped");


