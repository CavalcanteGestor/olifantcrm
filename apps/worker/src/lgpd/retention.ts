import type { SupabaseClient } from "@supabase/supabase-js";

type Logger = { info: (o: any, m?: string) => void; warn: (o: any, m?: string) => void; error: (o: any, m?: string) => void };

export async function runRetention(opts: {
  supabase: SupabaseClient;
  log: Logger;
  bucket: string;
}) {
  const { supabase, log, bucket } = opts;

  // Carrega políticas (ou usa defaults)
  const { data: policies, error: polErr } = await supabase
    .from("retention_policies")
    .select("tenant_id,access_log_days,media_days,webhook_event_days,job_days");
  if (polErr && polErr.code !== "42P01") throw polErr; // tabela pode não existir antes da migration

  const items = (policies ?? []) as any[];
  let mediaRedacted = 0;
  let accessDeleted = 0;
  let webhookDeleted = 0;
  let jobsDeleted = 0;

  for (const p of items) {
    const tenantId = p.tenant_id as string;
    const accessCutoff = new Date(Date.now() - Number(p.access_log_days ?? 365) * 86400 * 1000).toISOString();
    const mediaCutoff = new Date(Date.now() - Number(p.media_days ?? 365) * 86400 * 1000).toISOString();
    const webhookCutoff = new Date(Date.now() - Number(p.webhook_event_days ?? 30) * 86400 * 1000).toISOString();
    const jobsCutoff = new Date(Date.now() - Number(p.job_days ?? 30) * 86400 * 1000).toISOString();

    // access_logs: expurgo
    const { error: aErr } = await supabase
      .from("access_logs")
      .delete()
      .eq("tenant_id", tenantId)
      .lt("created_at", accessCutoff);
    if (!aErr) accessDeleted += 1;

    // whatsapp_webhook_events: expurgo (somente processados)
    const { error: wErr } = await supabase
      .from("whatsapp_webhook_events")
      .delete()
      .not("processed_at", "is", null)
      .lt("received_at", webhookCutoff);
    if (!wErr) webhookDeleted += 1;

    // jobs: expurgo de done/failed antigos
    const { error: jErr } = await supabase
      .from("jobs")
      .delete()
      .in("status", ["done", "failed"])
      .lt("created_at", jobsCutoff);
    if (!jErr) jobsDeleted += 1;

    // media_assets: remover do storage e marcar deleted_at (mantém histórico do evento, sem o binário)
    const { data: medias, error: mErr } = await supabase
      .from("media_assets")
      .select("id,storage_path")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .lt("created_at", mediaCutoff)
      .limit(100);
    if (mErr) continue;

    for (const m of medias ?? []) {
      const path = (m as any).storage_path as string;
      if (!path) continue;
      // remove do bucket (se não existir, ignore)
      await supabase.storage.from(bucket).remove([path]).catch(() => null);
      await supabase.from("media_assets").update({ deleted_at: new Date().toISOString() }).eq("id", (m as any).id);
      mediaRedacted += 1;
    }
  }

  if (items.length > 0) {
    log.info({ tenants: items.length, mediaRedacted, accessDeleted, webhookDeleted, jobsDeleted }, "retention_applied");
  }
}


