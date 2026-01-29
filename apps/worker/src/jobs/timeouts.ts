import type { SupabaseClient } from "@supabase/supabase-js";
import type pino from "pino";

type ConversationRow = {
  id: string;
  tenant_id: string;
  assigned_user_id: string | null;
  status_fila: string | null;
  last_patient_message_at: string | null;
  last_outbound_at: string | null;
};

type TenantRow = { id: string; no_response_alert_minutes: number | null; follow_up_alert_minutes: number | null };

export async function checkTimeouts(opts: { supabase: SupabaseClient; log: pino.Logger }) {
  const nowMs = Date.now();

  const { data: conversations, error: convErr } = await opts.supabase
    .from("conversations")
    .select("id, tenant_id, assigned_user_id, status_fila, last_patient_message_at, last_outbound_at")
    .eq("status_fila", "em_atendimento")
    .not("assigned_user_id", "is", null)
    .limit(500);

  if (convErr) {
    opts.log.warn({ err: convErr }, "timeouts_conversations_query_failed");
    return;
  }

  const rows = (conversations ?? []) as unknown as ConversationRow[];
  if (!rows.length) return;

  const tenantIds = Array.from(new Set(rows.map((r) => r.tenant_id)));
  const { data: tenants, error: tenantsErr } = await opts.supabase
    .from("tenants")
    .select("id, no_response_alert_minutes, follow_up_alert_minutes")
    .in("id", tenantIds);

  if (tenantsErr) {
    opts.log.warn({ err: tenantsErr }, "timeouts_tenants_query_failed");
    return;
  }

  const tenantMap = new Map<string, TenantRow>();
  for (const t of (tenants ?? []) as unknown as TenantRow[]) {
    tenantMap.set(t.id, t);
  }

  let alertsSent = 0;
  let conversationsReturned = 0;

  for (const c of rows) {
    const assignedUserId = c.assigned_user_id;
    if (!assignedUserId) continue;

    const tenantCfg = tenantMap.get(c.tenant_id);
    const noResponseMinutes = Math.max(1, Math.min(60, tenantCfg?.no_response_alert_minutes ?? 5));
    const followUpMinutes = Math.max(1, tenantCfg?.follow_up_alert_minutes ?? 120);

    const lastPatientMs = c.last_patient_message_at ? new Date(c.last_patient_message_at).getTime() : null;
    const lastOutboundMs = c.last_outbound_at ? new Date(c.last_outbound_at).getTime() : null;

    const needsAgentReply =
      lastPatientMs !== null && (lastOutboundMs === null || (Number.isFinite(lastOutboundMs) && lastOutboundMs < lastPatientMs));

    const needsClientReply =
      lastOutboundMs !== null && (lastPatientMs === null || (Number.isFinite(lastPatientMs) && lastPatientMs < lastOutboundMs));

    let message: string | null = null;

    if (needsAgentReply && Number.isFinite(lastPatientMs)) {
      const minutes = Math.floor((nowMs - (lastPatientMs as number)) / 60000);
      
      // AUTO-DEVOLUÇÃO: Se passou 5 minutos sem resposta, devolver para fila
      if (minutes >= 5) {
        const { error: returnErr } = await opts.supabase
          .from("conversations")
          .update({
            assigned_user_id: null,
            status_fila: "aguardando_atendimento",
            updated_at: new Date().toISOString()
          })
          .eq("id", c.id);

        if (returnErr) {
          opts.log.warn({ err: returnErr, conversation_id: c.id }, "auto_return_failed");
        } else {
          conversationsReturned += 1;
          opts.log.info({ conversation_id: c.id, minutes }, "conversation_auto_returned_to_queue");
          
          // Enviar mensagem interna informando a devolução
          await opts.supabase.from("internal_messages").insert({
            tenant_id: c.tenant_id,
            from_user_id: assignedUserId,
            to_user_id: assignedUserId,
            conversation_id: c.id,
            message: `🔄 Conversa devolvida automaticamente para a fila após ${minutes} min sem resposta.`
          });
        }
        continue; // Não enviar alerta se já devolveu
      }
      
      if (minutes >= noResponseMinutes) {
        message = `⚠️ Conversa sem resposta há ${minutes} min.`;
      }
    } else if (needsClientReply && Number.isFinite(lastOutboundMs)) {
      const minutes = Math.floor((nowMs - (lastOutboundMs as number)) / 60000);
      if (minutes >= followUpMinutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        message = `⚠️ Cliente sem resposta há ${hours > 0 ? `${hours}h` : ""}${mins}min.`;
      }
    }

    if (!message) continue;

    const { data: lastAlert } = await opts.supabase
      .from("internal_messages")
      .select("id, created_at")
      .eq("tenant_id", c.tenant_id)
      .eq("to_user_id", assignedUserId)
      .eq("conversation_id", c.id)
      .ilike("message", "⚠️%")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastAlert?.created_at) {
      const lastAlertMs = new Date(lastAlert.created_at).getTime();
      if (Number.isFinite(lastAlertMs) && nowMs - lastAlertMs < 15 * 60 * 1000) {
        continue;
      }
    }

    const { error: insertErr } = await opts.supabase.from("internal_messages").insert({
      tenant_id: c.tenant_id,
      from_user_id: assignedUserId,
      to_user_id: assignedUserId,
      conversation_id: c.id,
      message
    });

    if (insertErr) {
      opts.log.warn({ err: insertErr, conversation_id: c.id }, "timeouts_internal_message_insert_failed");
      continue;
    }

    alertsSent += 1;
  }

  if (alertsSent > 0) {
    opts.log.info({ alertsSent }, "timeouts_alerts_sent");
  }
  
  if (conversationsReturned > 0) {
    opts.log.info({ conversationsReturned }, "conversations_auto_returned");
  }
}

