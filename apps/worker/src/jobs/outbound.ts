import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import crypto from "node:crypto";
import { z } from "zod";
import ffmpegPath from "ffmpeg-static";

const execFileAsync = promisify(execFile);

import type { SupabaseClient } from "@supabase/supabase-js";
// import FormData from "form-data"; // Removed to use native FormData

const JobSchema = z.object({
  id: z.number(),
  tenant_id: z.string().uuid().nullable().optional(),
  type: z.string(),
  payload_json: z.any(),
  attempts: z.number(),
  max_attempts: z.number()
});

const SendTextPayload = z.object({
  tenant_id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  contact_phone_e164: z.string().min(8),
  text: z.string().min(1),
  message_id: z.string().uuid()
});

const SendTemplatePayload = z.object({
  tenant_id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  contact_phone_e164: z.string().min(8),
  template_name: z.string().min(1),
  language: z.string().min(1),
  components: z.array(z.any()).optional(),
  message_id: z.string().uuid()
});

const SendMediaPayload = z.object({
  tenant_id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  contact_phone_e164: z.string().min(8),
  media_type: z.enum(["image", "audio", "video", "document"]),
  media_asset_id: z.string().uuid(),
  storage_path: z.string(),
  caption: z.string().optional(),
  message_id: z.string().uuid()
});

const SendReactionPayload = z.object({
  tenant_id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  contact_phone_e164: z.string().min(8),
  target_meta_message_id: z.string().min(1),
  emoji: z.string().min(1)
});

type WaSendResponse = {
  messages?: Array<{ id?: string }>;
  error?: { message?: string };
};

type CircuitState = {
  openUntil: number; // epoch ms
  failures: number;
};

export async function processOutboundJobs(opts: {
  supabase: SupabaseClient;
  meta: {
    graphVersion: string;
    accessToken: string;
  };
  limit: number;
  log: { info: (o: any, m?: string) => void; warn: (o: any, m?: string) => void; error: (o: any, m?: string) => void };
  circuit: CircuitState;
}) {
  const { supabase, meta, limit, log, circuit } = opts;

  // Circuit breaker: se aberto, não tenta enviar agora.
  if (Date.now() < circuit.openUntil) return 0;

  const workerId = `${os.hostname()}:${process.pid}`;
  const { data, error } = await supabase.rpc("dequeue_jobs", { p_limit: limit, p_worker_id: workerId });
  if (error) throw error;

  const jobs = (data ?? []).map((j: any) => JobSchema.parse(j));
  for (const job of jobs) {
    try {
      if (job.type === "wa_send_text") {
        const payload = SendTextPayload.parse(job.payload_json);
        await sendText({ supabase, meta, payload });
        await markJobDone({ supabase, jobId: job.id });
      } else if (job.type === "wa_send_template") {
        const payload = SendTemplatePayload.parse(job.payload_json);
        await sendTemplate({ supabase, meta, payload });
        await markJobDone({ supabase, jobId: job.id });
      } else if (job.type === "wa_send_media") {
        const payload = SendMediaPayload.parse(job.payload_json);
        await sendMedia({ supabase, meta, payload });
        await markJobDone({ supabase, jobId: job.id });
      } else if (job.type === "wa_react") {
        const payload = SendReactionPayload.parse(job.payload_json);
        await sendReaction({ supabase, meta, payload });
        await markJobDone({ supabase, jobId: job.id });
      } else {
        await markJobFailedPermanent({ supabase, jobId: job.id, reason: "unknown_job_type" });
      }

      // Fechando circuito ao ter sucesso
      circuit.failures = 0;
      circuit.openUntil = 0;
    } catch (e) {
      log.warn({ err: e, jobId: job.id, type: job.type }, "outbound_job_failed");
      const retry = shouldRetry(e);

      if (retry && job.attempts < job.max_attempts) {
        const delayMs = computeBackoffMs(job.attempts);
        await rescheduleJob({ supabase, jobId: job.id, error: String(e), delayMs });
      } else {
        await markJobFailedPermanent({ supabase, jobId: job.id, reason: String(e) });
      }

      // Abrir circuito quando falhar repetidamente por erro de provider
      if (isProviderTransientError(e)) {
        circuit.failures += 1;
        if (circuit.failures >= 5) {
          circuit.openUntil = Date.now() + 30_000; // 30s
          log.warn({ openUntil: circuit.openUntil }, "circuit_opened");
        }
      }
    }
  }

  return jobs.length;
}

function computeBackoffMs(attempt: number) {
  const base = Math.min(60_000, 500 * Math.pow(2, Math.max(0, attempt - 1)));
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

function isProviderTransientError(e: unknown) {
  const msg = String(e);
  return msg.includes("wa_provider_") || msg.includes("429") || msg.includes("5");
}

function shouldRetry(e: unknown) {
  const msg = String(e);
  return isProviderTransientError(e) || msg.includes("fetch failed");
}

async function markJobDone(opts: { supabase: SupabaseClient; jobId: number }) {
  const { error } = await opts.supabase
    .from("jobs")
    .update({ status: "done", locked_at: null, locked_by: null, last_error: null })
    .eq("id", opts.jobId);
  if (error) throw error;
}

async function rescheduleJob(opts: { supabase: SupabaseClient; jobId: number; error: string; delayMs: number }) {
  const runAt = new Date(Date.now() + opts.delayMs).toISOString();
  const { error } = await opts.supabase
    .from("jobs")
    .update({ status: "queued", run_at: runAt, locked_at: null, locked_by: null, last_error: opts.error })
    .eq("id", opts.jobId);
  if (error) throw error;
}

async function markJobFailedPermanent(opts: { supabase: SupabaseClient; jobId: number; reason: string }) {
  const { error } = await opts.supabase
    .from("jobs")
    .update({ status: "failed", locked_at: null, locked_by: null, last_error: opts.reason })
    .eq("id", opts.jobId);
  if (error) throw error;
}

function normalizeToWaRecipient(phoneE164: string) {
  return phoneE164.startsWith("+") ? phoneE164.slice(1) : phoneE164;
}

async function sendText(opts: {
  supabase: SupabaseClient;
  meta: { graphVersion: string; accessToken: string };
  payload: z.infer<typeof SendTextPayload>;
}) {
  const { supabase, meta, payload } = opts;

  // Buscar nome do usuário que enviou a mensagem
  const { data: message, error: msgErr } = await supabase
    .from("messages")
    .select("sent_by_user_id")
    .eq("id", payload.message_id)
    .maybeSingle();
  if (msgErr) throw msgErr;

  let finalText = payload.text;
  if (message?.sent_by_user_id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", message.sent_by_user_id)
      .maybeSingle();

    if (profile?.full_name) {
      if (!payload.text.startsWith(`${profile.full_name}:`)) {
        finalText = `${profile.full_name}:\n\n${payload.text}`;
      }
    }
  }

  const { data: wa, error: waErr } = await supabase
    .from("whatsapp_accounts")
    .select("phone_number_id")
    .eq("tenant_id", payload.tenant_id)
    .limit(1)
    .maybeSingle();
  if (waErr) throw waErr;
  if (!wa?.phone_number_id) throw new Error("wa_provider_missing_account");

  const phoneNumberId = wa.phone_number_id as string;
  const url = `https://graph.facebook.com/${meta.graphVersion}/${phoneNumberId}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${meta.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizeToWaRecipient(payload.contact_phone_e164),
      type: "text",
      text: { body: finalText }
    })
  });

  const json = (await res.json().catch(() => null)) as WaSendResponse | null;

  if (!res.ok) {
    const code = res.status;
    throw new Error(`wa_provider_http_${code}:${JSON.stringify(json)}`);
  }

  const metaMessageId = json?.messages?.[0]?.id as string | undefined;

  const { error: msgUpdErr } = await supabase
    .from("messages")
    .update({ status: "sent", meta_message_id: metaMessageId ?? null })
    .eq("id", payload.message_id);
  if (msgUpdErr) throw msgUpdErr;

  const nowIso = new Date().toISOString();
  await supabase
    .from("conversations")
    .update({ last_outbound_at: nowIso, updated_at: nowIso })
    .eq("id", payload.conversation_id);
}

async function sendMedia(opts: {
  supabase: SupabaseClient;
  meta: { graphVersion: string; accessToken: string };
  payload: z.infer<typeof SendMediaPayload>;
}) {
  const { supabase, meta, payload } = opts;

  const { data: wa, error: waErr } = await supabase
    .from("whatsapp_accounts")
    .select("phone_number_id")
    .eq("tenant_id", payload.tenant_id)
    .limit(1)
    .maybeSingle();
  if (waErr) throw waErr;
  if (!wa?.phone_number_id) throw new Error("wa_provider_missing_account");

  const { data: fileData, error: fileErr } = await supabase.storage
    .from("whatsapp-media")
    .download(payload.storage_path);

  if (fileErr || !fileData) {
    throw new Error(`media_download_failed:${fileErr?.message}`);
  }

  const arrayBuffer = await fileData.arrayBuffer();
  let buffer = Buffer.from(arrayBuffer);

  let mimeType = payload.mime_type || "application/octet-stream";
  let extension = "bin";

  if (payload.mime_type) {
    const ext = payload.mime_type.split("/")[1];
    if (ext) extension = ext;
  } else {
    // Fallback legacy behavior
    if (payload.media_type === "image") {
      mimeType = "image/jpeg";
      extension = "jpg";
    } else if (payload.media_type === "audio") {
      mimeType = "audio/ogg"; 
      extension = "ogg";
    } else if (payload.media_type === "video") {
      mimeType = "video/mp4";
      extension = "mp4";
    } else if (payload.media_type === "document") {
      mimeType = "application/pdf";
      extension = "pdf";
    }
  }

  // Audio conversion check (still important for WhatsApp compatibility)
  if (payload.media_type === "audio" && mimeType !== "audio/ogg") {
    // ... logic for conversion ...
    // Note: If we received audio/mpeg, we might still want to convert to ogg/opus for better WA support
    // For now, let's trust the provided mimeType unless it is clearly incompatible
  }

  if (payload.media_type === "audio") {
    // Force OGG/Opus conversion if we can, because WhatsApp is picky about audio
    const tempDir = os.tmpdir();
    const randomId = crypto.randomBytes(8).toString("hex");
    const inputPath = path.join(tempDir, `in_${payload.message_id}_${randomId}`);
    const outputPath = path.join(tempDir, `out_${payload.message_id}_${randomId}.ogg`);

    try {
      await fs.writeFile(inputPath, buffer);

      if (ffmpegPath) {
        await execFileAsync(ffmpegPath, [
          "-i", inputPath,
          "-c:a", "libopus",
          "-b:a", "32k", 
          "-ac", "1",    
          "-vn",         
          "-f", "ogg",
          "-y",
          outputPath
        ]);

        buffer = await fs.readFile(outputPath);
        mimeType = "audio/ogg";
        extension = "ogg";
      }
    } catch (e) {
      console.warn("Audio conversion failed or skipped, sending original.", e);
    } finally {
      await fs.unlink(inputPath).catch(() => {});
      await fs.unlink(outputPath).catch(() => {});
    }
  }

  const phoneNumberId = wa.phone_number_id as string;

  // STEP 1: Upload Media to WhatsApp Cloud API
  const uploadUrl = `https://graph.facebook.com/${meta.graphVersion}/${phoneNumberId}/media`;
  
  const uploadForm = new FormData();
  uploadForm.append("messaging_product", "whatsapp");
  
  const blob = new Blob([buffer], { type: mimeType });
  uploadForm.append("file", blob, `media.${extension}`);

  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${meta.accessToken}`,
    },
    body: uploadForm
  });

  const uploadJson = await uploadRes.json().catch(() => null);

  if (!uploadRes.ok) {
    const code = uploadRes.status;
    const errorMsg = (uploadJson as any)?.error?.message ?? JSON.stringify(uploadJson);
    throw new Error(`wa_media_upload_failed_${code}:${errorMsg}`);
  }

  const mediaId = (uploadJson as any)?.id;
  if (!mediaId) {
    throw new Error(`wa_media_upload_no_id:${JSON.stringify(uploadJson)}`);
  }

  // STEP 2: Send Message referencing the Media ID
  const messageUrl = `https://graph.facebook.com/${meta.graphVersion}/${phoneNumberId}/messages`;
  
  const messageBody: any = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizeToWaRecipient(payload.contact_phone_e164),
    type: payload.media_type,
    [payload.media_type]: {
      id: mediaId
    }
  };

  if (payload.caption) {
    messageBody[payload.media_type].caption = payload.caption;
  }

  const res = await fetch(messageUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${meta.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(messageBody)
  });

  const json = (await res.json().catch(() => null)) as any;

  if (!res.ok) {
    const code = res.status;
    throw new Error(`wa_provider_http_${code}:${JSON.stringify(json)}`);
  }

  const metaMessageId = json?.messages?.[0]?.id as string | undefined;

  const { error: msgUpdErr } = await supabase
    .from("messages")
    .update({ status: "sent", meta_message_id: metaMessageId ?? null })
    .eq("id", payload.message_id);
  if (msgUpdErr) throw msgUpdErr;

  const nowIso = new Date().toISOString();
  await supabase
    .from("conversations")
    .update({ last_outbound_at: nowIso, updated_at: nowIso })
    .eq("id", payload.conversation_id);
}

async function sendTemplate(opts: {
  supabase: SupabaseClient;
  meta: { graphVersion: string; accessToken: string };
  payload: z.infer<typeof SendTemplatePayload>;
}) {
  const { supabase, meta, payload } = opts;

  const { data: wa, error: waErr } = await supabase
    .from("whatsapp_accounts")
    .select("phone_number_id")
    .eq("tenant_id", payload.tenant_id)
    .limit(1)
    .maybeSingle();
  if (waErr) throw waErr;
  if (!wa?.phone_number_id) throw new Error("wa_provider_missing_account");

  const phoneNumberId = wa.phone_number_id as string;
  const url = `https://graph.facebook.com/${meta.graphVersion}/${phoneNumberId}/messages`;

  const templateMessage: any = {
    messaging_product: "whatsapp",
    to: normalizeToWaRecipient(payload.contact_phone_e164),
    type: "template",
    template: {
      name: payload.template_name,
      language: { code: payload.language }
    }
  };

  if (payload.components && payload.components.length > 0) {
    templateMessage.template.components = payload.components;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${meta.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(templateMessage)
  });

  const json = (await res.json().catch(() => null)) as WaSendResponse | null;

  if (!res.ok) {
    const code = res.status;
    const errorMsg = json?.error?.message ?? JSON.stringify(json);
    throw new Error(`wa_provider_http_${code}:${errorMsg}`);
  }

  const metaMessageId = json?.messages?.[0]?.id as string | undefined;

  const { error: msgUpdErr } = await supabase
    .from("messages")
    .update({ status: "sent", meta_message_id: metaMessageId ?? null })
    .eq("id", payload.message_id);
  if (msgUpdErr) throw msgUpdErr;

  const nowIso = new Date().toISOString();
  await supabase
    .from("conversations")
    .update({ last_outbound_at: nowIso, updated_at: nowIso })
    .eq("id", payload.conversation_id);
}

async function sendReaction(opts: {
  supabase: SupabaseClient;
  meta: { graphVersion: string; accessToken: string };
  payload: z.infer<typeof SendReactionPayload>;
}) {
  const { supabase, meta, payload } = opts;

  const { data: wa, error: waErr } = await supabase
    .from("whatsapp_accounts")
    .select("phone_number_id")
    .eq("tenant_id", payload.tenant_id)
    .limit(1)
    .maybeSingle();
  if (waErr) throw waErr;
  if (!wa?.phone_number_id) throw new Error("wa_provider_missing_account");

  const phoneNumberId = wa.phone_number_id as string;
  const url = `https://graph.facebook.com/${meta.graphVersion}/${phoneNumberId}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${meta.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizeToWaRecipient(payload.contact_phone_e164),
      type: "reaction",
      reaction: {
        message_id: payload.target_meta_message_id,
        emoji: payload.emoji
      }
    })
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const code = res.status;
    const errorMsg = (json as any)?.error?.message ?? JSON.stringify(json);
    throw new Error(`wa_provider_http_${code}:${errorMsg}`);
  }
}
