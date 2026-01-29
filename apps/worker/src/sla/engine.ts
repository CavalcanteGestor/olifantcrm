import type { SupabaseClient } from "@supabase/supabase-js";

type Logger = { info: (o: any, m?: string) => void; warn: (o: any, m?: string) => void; error: (o: any, m?: string) => void };

type Policy = {
  id: string;
  tenant_id: string;
  stage_id: string | null;
  contact_status: string | null;
  response_seconds: number;
  warning_threshold_percent: number;
};

export async function updateSlaTimers(opts: { supabase: SupabaseClient; log: Logger }) {
  const { supabase, log } = opts;

  // Busca conversas que exigem SLA (paciente falou por último e ainda não teve resposta depois disso)
  const { data: convs, error } = await supabase
    .from("conversations")
    .select(
      "id,tenant_id,contact_id,assigned_user_id,current_stage_id,last_patient_message_at,last_outbound_at,last_stage_moved_at,contacts(status)"
    )
    .neq("status_fila", "finalizado")
    .not("last_patient_message_at", "is", null)
    .limit(500);
  if (error) throw error;

  const convIds = (convs ?? []).map((c: any) => c.id as string);
  const existingTimers = new Map<string, any>();
  if (convIds.length > 0) {
    const { data: timers, error: tErr } = await supabase
      .from("sla_timers")
      .select("conversation_id,started_at,due_at,breached_at,current_policy_id")
      .in("conversation_id", convIds);
    if (tErr) throw tErr;
    for (const t of timers ?? []) existingTimers.set((t as any).conversation_id, t);
  }

  const policiesByTenant = new Map<string, Policy[]>();

  let upserts = 0;
  let deletes = 0;

  for (const c of convs ?? []) {
    const tenantId = c.tenant_id as string;
    const conversationId = c.id as string;
    const contactStatus = (c as any).contacts?.status as string | undefined;
    const stageId = c.current_stage_id as string | null;

    const lastPatient = c.last_patient_message_at ? new Date(c.last_patient_message_at as string) : null;
    const lastOutbound = c.last_outbound_at ? new Date(c.last_outbound_at as string) : null;
    const lastStageMove = c.last_stage_moved_at ? new Date(c.last_stage_moved_at as string) : null;

    if (!lastPatient) continue;

    // Sem SLA se já houve resposta após a última mensagem do paciente.
    if (lastOutbound && lastOutbound.getTime() >= lastPatient.getTime()) {
      const existing = existingTimers.get(conversationId);
      if (existing) {
        const startedAt = new Date(existing.started_at as string);
        const responseSeconds = Math.max(0, Math.floor((lastOutbound.getTime() - startedAt.getTime()) / 1000));
        await supabase.from("sla_events").insert({
          tenant_id: tenantId,
          conversation_id: conversationId,
          assigned_user_id: (c as any).assigned_user_id ?? null,
          type: "response",
          started_at: existing.started_at,
          due_at: existing.due_at,
          occurred_at: new Date().toISOString(),
          response_seconds: responseSeconds,
          policy_id: existing.current_policy_id ?? null
        });
      }
      const { error: delErr } = await supabase.from("sla_timers").delete().eq("conversation_id", conversationId);
      if (!delErr) deletes += 1;
      continue;
    }

    const startAt = new Date(Math.max(lastPatient.getTime(), lastStageMove?.getTime() ?? 0));

    let policies = policiesByTenant.get(tenantId);
    if (!policies) {
      const { data: pData, error: pErr } = await supabase
        .from("sla_policies")
        .select("id,tenant_id,stage_id,contact_status,response_seconds,warning_threshold_percent")
        .eq("tenant_id", tenantId);
      if (pErr) throw pErr;
      policies = (pData ?? []) as any;
      policiesByTenant.set(tenantId, policies);
    }

    const seconds = pickPolicySeconds(policies, { stageId, contactStatus }) ?? 300;
    const dueAt = new Date(startAt.getTime() + seconds * 1000);
    const breachedAt = Date.now() > dueAt.getTime() ? new Date() : null;

    const existing = existingTimers.get(conversationId);
    const wasBreached = !!existing?.breached_at;
    const nowBreached = !!breachedAt;

    const { error: upErr } = await supabase.from("sla_timers").upsert(
      {
        conversation_id: conversationId,
        tenant_id: tenantId,
        current_policy_id: pickPolicyId(policies, { stageId, contactStatus }),
        started_at: startAt.toISOString(),
        due_at: dueAt.toISOString(),
        breached_at: breachedAt ? breachedAt.toISOString() : null,
        paused_at: null
      },
      { onConflict: "conversation_id" }
    );
    if (upErr) throw upErr;
    upserts += 1;

    if (!wasBreached && nowBreached) {
      await supabase.from("sla_events").insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        assigned_user_id: c.assigned_user_id ?? null,
        type: "breach",
        started_at: startAt.toISOString(),
        due_at: dueAt.toISOString(),
        occurred_at: breachedAt!.toISOString(),
        policy_id: pickPolicyId(policies, { stageId, contactStatus })
      });
    }
  }

  if (upserts || deletes) log.info({ upserts, deletes }, "sla_timers_updated");
}

function pickPolicy(policies: Policy[], ctx: { stageId: string | null; contactStatus?: string }) {
  const { stageId, contactStatus } = ctx;

  // Mais específico: stage + contact_status
  if (stageId && contactStatus) {
    const p = policies.find((x) => x.stage_id === stageId && x.contact_status === contactStatus);
    if (p) return p;
  }
  // stage
  if (stageId) {
    const p = policies.find((x) => x.stage_id === stageId && x.contact_status == null);
    if (p) return p;
  }
  // contact_status
  if (contactStatus) {
    const p = policies.find((x) => x.stage_id == null && x.contact_status === contactStatus);
    if (p) return p;
  }
  // default do tenant (sem stage/sem status)
  return policies.find((x) => x.stage_id == null && x.contact_status == null) ?? null;
}

function pickPolicySeconds(policies: Policy[], ctx: { stageId: string | null; contactStatus?: string }) {
  return pickPolicy(policies, ctx)?.response_seconds ?? null;
}

function pickPolicyId(policies: Policy[], ctx: { stageId: string | null; contactStatus?: string }) {
  return pickPolicy(policies, ctx)?.id ?? null;
}


