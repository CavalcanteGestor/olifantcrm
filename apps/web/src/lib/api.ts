import { supabaseBrowser } from "./supabaseBrowser";

export function apiBaseUrl() {
  const url = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
  if (!url) {
    console.warn("⚠️ NEXT_PUBLIC_API_BASE_URL não configurada, usando http://localhost:3001");
    return "http://localhost:3001";
  }
  return url;
}

export async function apiGetConfigStatus(opts: { accessToken: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/config-status`, {
    headers: { Authorization: `Bearer ${opts.accessToken}` }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json as {
    ok: boolean;
    tenant_id: string;
    env: { cwd: string; dotenv_config_path_env: string | null; loaded_env_path: string | null; loaded_env_paths?: string[] };
    api: { webhook_configured: boolean; whatsapp_access_token_present: boolean; missing_env?: string[] };
    tenant: {
      whatsapp_account_configured: boolean;
      whatsapp_phone_number_id_present: boolean;
      whatsapp_waba_id_present: boolean;
    };
    whatsapp: { templates_total: number; templates_approved: number };
    queues: { queued_jobs_overdue: number; webhook_events_overdue_global: number };
  };
}

export async function apiSendText(opts: { accessToken: string; conversationId: string; text: string }) {
  const clientTimestamp = new Date().toISOString(); // Capturar timestamp no momento do clique
  
  const res = await fetch(`${apiBaseUrl()}/api/messages/send-text`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ 
      conversation_id: opts.conversationId, 
      text: opts.text,
      client_timestamp: clientTimestamp // Enviar timestamp do cliente
    })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(json?.error || json?.hint || `http_${res.status}`) as any;
    error.hint = json?.hint;
    error.details = json?.details;
    error.userMessage = json?.message;
    throw error;
  }
  return json as { ok: boolean; message_id: string };
}

export async function apiScheduleText(opts: {
  accessToken: string;
  conversationId: string;
  text: string;
  runAt: string;
}) {
  const res = await fetch(`${apiBaseUrl()}/api/messages/schedule-text`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ conversation_id: opts.conversationId, text: opts.text, run_at: opts.runAt })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(json?.error || json?.hint || `http_${res.status}`) as any;
    error.hint = json?.hint;
    error.details = json?.details;
    error.userMessage = json?.message;
    throw error;
  }
  return json as { ok: boolean; message_id: string; run_at: string };
}

export async function apiSendMedia(opts: {
  accessToken: string;
  conversationId: string;
  mediaType: "image" | "audio" | "video" | "document";
  mimeType?: string;
  fileData: string; // base64
  fileName?: string;
  caption?: string;
}) {
  const clientTimestamp = new Date().toISOString(); // Capturar timestamp no momento do clique
  
  const res = await fetch(`${apiBaseUrl()}/api/messages/send-media`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      conversation_id: opts.conversationId,
      media_type: opts.mediaType,
      mime_type: opts.mimeType,
      file_data: opts.fileData,
      file_name: opts.fileName,
      caption: opts.caption,
      client_timestamp: clientTimestamp // Enviar timestamp do cliente
    })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(json?.error || json?.hint || `http_${res.status}`) as any;
    error.hint = json?.hint;
    error.details = json?.details;
    error.userMessage = json?.message;
    throw error;
  }
  return json as { ok: boolean; message_id: string; media_asset_id: string };
}

export async function apiGetCannedResponses(opts: { accessToken: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/canned-responses`, {
    headers: { Authorization: `Bearer ${opts.accessToken}` }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json as { items: { id: string; title: string; shortcut: string; body_template: string }[] };
}

export async function apiCreateCannedResponse(opts: {
  accessToken: string;
  title: string;
  shortcut: string;
  body_template: string;
}) {
  const res = await fetch(`${apiBaseUrl()}/api/canned-responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: opts.title,
      shortcut: opts.shortcut,
      body_template: opts.body_template
    })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json as { ok: boolean; id: string };
}

export async function apiDeleteCannedResponse(opts: { accessToken: string; id: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/canned-responses/${opts.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${opts.accessToken}` }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json as { ok: boolean };
}

export async function apiCreateTask(opts: {
  accessToken: string;
  conversationId: string;
  title: string;
  due_at?: string;
  reminder_enabled?: boolean;
}) {
  const res = await fetch(`${apiBaseUrl()}/api/conversations/${opts.conversationId}/tasks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: opts.title,
      due_at: opts.due_at ?? undefined,
      reminder_enabled: opts.reminder_enabled ?? false
    })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json as { ok: boolean; id: string };
}

export async function apiGetTasks(opts: { accessToken: string; conversationId: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/conversations/${opts.conversationId}/tasks`, {
    headers: { Authorization: `Bearer ${opts.accessToken}` }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json as { items: { id: string; title: string; due_at: string | null; status: string; created_at: string }[] };
}

export async function apiSetTaskStatus(opts: { accessToken: string; taskId: string; status: "open" | "done" | "cancelled" }) {
  const res = await fetch(`${apiBaseUrl()}/api/tasks/${opts.taskId}/status`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ status: opts.status })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json as { ok: boolean };
}

export async function apiAccessLog(opts: {
  accessToken: string;
  resourceType: "conversation" | "contact";
  resourceId: string;
}) {
  await fetch(`${apiBaseUrl()}/api/access-log`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ resource_type: opts.resourceType, resource_id: opts.resourceId })
  }).catch(() => { });
}

export async function apiListStages(opts: { accessToken: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/funnel-stages`, {
    headers: { Authorization: `Bearer ${opts.accessToken}` }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json as { items: { id: string; name: string; sort_order: number }[] };
}

export async function apiUpsertStage(opts: {
  accessToken: string;
  id?: string;
  name: string;
  sort_order: number;
}) {
  const res = await fetch(`${apiBaseUrl()}/api/funnel-stages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id: opts.id, name: opts.name, sort_order: opts.sort_order })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json as { ok: boolean; id: string };
}

export async function apiDeleteStage(opts: { accessToken: string; id: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/funnel-stages/${opts.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${opts.accessToken}` }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json as { ok: boolean };
}

export async function apiListSlaPolicies(opts: { accessToken: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/sla-policies`, {
    headers: { Authorization: `Bearer ${opts.accessToken}` }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json as {
    items: Array<{
      id: string;
      stage_id: string | null;
      contact_status: "lead" | "paciente" | "paciente_recorrente" | null;
      response_seconds: number;
      warning_threshold_percent: number;
      created_at: string;
    }>;
  };
}

export async function apiUpsertSlaPolicy(opts: {
  accessToken: string;
  id?: string;
  stage_id?: string | null;
  contact_status?: "lead" | "paciente" | "paciente_recorrente" | null;
  response_seconds: number;
  warning_threshold_percent?: number;
}) {
  const res = await fetch(`${apiBaseUrl()}/api/sla-policies`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      id: opts.id,
      stage_id: opts.stage_id ?? null,
      contact_status: opts.contact_status ?? null,
      response_seconds: opts.response_seconds,
      warning_threshold_percent: opts.warning_threshold_percent ?? 80
    })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json as { ok: boolean; id: string };
}

export async function apiDeleteSlaPolicy(opts: { accessToken: string; id: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/sla-policies/${opts.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${opts.accessToken}` }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json as { ok: boolean };
}

export async function apiMoveStage(opts: { accessToken: string; conversationId: string; stageId: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/conversations/${opts.conversationId}/move-stage`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ stage_id: opts.stageId })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(json?.error || json?.details || `http_${res.status}`) as any;
    error.details = json?.details;
    error.status = res.status;
    throw error;
  }
  return json as { ok: boolean };
}

export async function apiListUsers(opts: { accessToken: string }) {
  console.log("🔍 apiListUsers: Iniciando chamada para", `${apiBaseUrl()}/api/users`);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
  
  try {
    const res = await fetch(`${apiBaseUrl()}/api/users`, {
      headers: { Authorization: `Bearer ${opts.accessToken}` },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    console.log("📡 apiListUsers: Resposta recebida", res.status, res.statusText);
    
    const json = await res.json().catch(() => ({}));
    
    if (!res.ok) {
      console.error("❌ apiListUsers: Erro", json);
      throw new Error(json?.error ?? `http_${res.status}`);
    }
    
    console.log("✅ apiListUsers: Sucesso", json);
    return json as { items: { user_id: string; full_name: string; role: string }[] };
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.error("⏱️ apiListUsers: Timeout após 10s");
      throw new Error('Timeout: A API não respondeu em 10 segundos');
    }
    console.error("❌ apiListUsers: Erro na chamada", error);
    throw error;
  }
}

export async function apiInviteUser(opts: {
  accessToken: string;
  email: string;
  full_name: string;
  password?: string;
  role?: "admin" | "secretaria";
  send_invite?: boolean;
}) {
  const res = await fetch(`${apiBaseUrl()}/api/users/invite`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: opts.email,
      full_name: opts.full_name,
      password: opts.password,
      role: opts.role ?? "secretaria",
      send_invite: opts.send_invite ?? true
    })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? json?.message ?? `http_${res.status}`);
  return json as { ok: boolean; user_id: string; email: string; full_name: string };
}

export async function apiUpdateUserRole(opts: { accessToken: string; userId: string; role: "admin" | "secretaria" }) {
  const res = await fetch(`${apiBaseUrl()}/api/users/${opts.userId}/role`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ role: opts.role })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? json?.message ?? `http_${res.status}`);
  return json as { ok: boolean };
}

export async function apiUpdateUserPassword(opts: { accessToken: string; userId: string; password: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/users/${opts.userId}/password`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ password: opts.password })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? json?.message ?? `http_${res.status}`);
  return json as { ok: boolean; message?: string };
}

export async function apiUpdateUserName(opts: { accessToken: string; userId: string; full_name: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/users/${opts.userId}/name`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ full_name: opts.full_name })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? json?.message ?? `http_${res.status}`);
  return json as { ok: boolean; message?: string };
}

export async function apiEditMessage(opts: { accessToken: string; messageId: string; text: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/messages/${opts.messageId}/edit`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text: opts.text })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? json?.message ?? `http_${res.status}`);
  return json as { ok: boolean; message?: string };
}

export async function apiGetAutomationSettings(opts: { accessToken: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/admin/automation-settings`, {
    headers: { Authorization: `Bearer ${opts.accessToken}` }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json;
}

export async function apiUpdateAutomationSettings(opts: { accessToken: string; data: any }) {
  const res = await fetch(`${apiBaseUrl()}/api/admin/automation-settings`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(opts.data)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? json?.message ?? `http_${res.status}`);
  return json as { ok: boolean };
}

export async function apiGetQueueSettings(opts: { accessToken: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/admin/queue-settings`, {
    headers: { Authorization: `Bearer ${opts.accessToken}` }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json as { no_response_alert_minutes: number; follow_up_alert_minutes: number };
}

export async function apiUpdateQueueSettings(opts: { accessToken: string; data: any }) {
  const res = await fetch(`${apiBaseUrl()}/api/admin/queue-settings`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(opts.data)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? json?.message ?? `http_${res.status}`);
  return json as { ok: boolean };
}

export async function apiDeleteUser(opts: { accessToken: string; userId: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/users/${opts.userId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${opts.accessToken}` }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? json?.message ?? `http_${res.status}`);
  return json as { ok: boolean };
}

export async function apiTransferConversation(opts: {
  accessToken: string;
  conversationId: string;
  userId: string;
  reason?: string;
}) {
  const res = await fetch(`${apiBaseUrl()}/api/conversations/${opts.conversationId}/transfer`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: opts.userId,
      reason: opts.reason || undefined
    })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(json?.error || json?.message || `http_${res.status}`) as any;
    error.details = json?.details || json?.message;
    error.error = json?.error;
    error.status = res.status;
    throw error;
  }
  return json as { ok: boolean };
}

export async function apiReturnToQueue(opts: {
  accessToken: string;
  conversationId: string;
}) {
  const res = await fetch(`${apiBaseUrl()}/api/conversations/${opts.conversationId}/return-to-queue`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}` }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(json?.error || json?.message || `http_${res.status}`) as any;
    error.details = json?.details || json?.message;
    error.error = json?.error;
    error.status = res.status;
    throw error;
  }
  return json as { ok: boolean };
}

export async function apiPauseSla(opts: { accessToken: string; conversationId: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/conversations/${opts.conversationId}/pause-sla`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}` }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json as { ok: boolean };
}

export async function apiResumeSla(opts: { accessToken: string; conversationId: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/conversations/${opts.conversationId}/resume-sla`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}` }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json as { ok: boolean };
}

export async function apiGetSlaTimer(opts: { accessToken: string; conversationId: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/conversations/${opts.conversationId}/sla-timer`, {
    headers: { Authorization: `Bearer ${opts.accessToken}` }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json as { timer: { due_at: string; paused_at: string | null; started_at: string } | null };
}

export async function apiUpdateContact(opts: {
  accessToken: string;
  contactId: string;
  display_name?: string;
  status?: "lead" | "paciente" | "paciente_recorrente";
  tags?: string[];
  internal_notes?: string;
}) {
  const res = await fetch(`${apiBaseUrl()}/api/contacts/${opts.contactId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(opts.display_name !== undefined && { display_name: opts.display_name }),
      ...(opts.status !== undefined && { status: opts.status }),
      ...(opts.tags !== undefined && { tags: opts.tags }),
      ...(opts.internal_notes !== undefined && { internal_notes: opts.internal_notes })
    })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json as { ok: boolean };
}

export async function apiGetContactHistory(opts: { accessToken: string; contactId: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/contacts/${opts.contactId}/history`, {
    headers: { Authorization: `Bearer ${opts.accessToken}` }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json as {
    items: Array<{
      type: "message" | "move" | "task";
      id: string;
      created_at: string;
      data: any;
    }>;
  };
}

export async function apiGetMediaUrl(opts: { accessToken: string; mediaId: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/media/${opts.mediaId}/url`, {
    headers: { Authorization: `Bearer ${opts.accessToken}` }
  });
  const json = await res.json().catch(() => ({}));
  
  // Se o arquivo não existir (404), retornar null ao invés de erro
  if (res.status === 404) {
    return null;
  }
  
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json as { url: string };
}

export async function apiListTemplates(opts: { accessToken: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/whatsapp/templates`, {
    headers: { Authorization: `Bearer ${opts.accessToken}` }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json as {
    items: Array<{
      id: string;
      name: string;
      language: string;
      category: string | null;
      approved_status: string | null;
      components_json: any[];
      last_synced_at: string | null;
    }>;
  };
}

export async function apiSyncTemplates(opts: { accessToken: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/whatsapp/templates/sync`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}` }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json as { ok: boolean; synced: number; total: number };
}

export async function apiSendTemplate(opts: {
  accessToken: string;
  conversationId: string;
  templateName: string;
  language: string;
  components?: any[];
}) {
  const res = await fetch(`${apiBaseUrl()}/api/conversations/${opts.conversationId}/messages/send-template`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      template_name: opts.templateName,
      language: opts.language,
      components: opts.components || []
    })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json as { ok: boolean; message_id: string };
}

export async function apiSearchConversations(opts: { accessToken: string; query: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/conversations/search?q=${encodeURIComponent(opts.query)}`, {
    headers: { Authorization: `Bearer ${opts.accessToken}` }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json as { items: Array<{ id: string; contact_id: string; contacts: { display_name: string | null; phone_e164: string } | null }> };
}

export async function apiCloseConversation(opts: { accessToken: string; conversationId: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/conversations/${opts.conversationId}/close`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(json?.error || json?.details || `http_${res.status}`) as any;
    error.details = json?.details;
    error.status = res.status;
    throw error;
  }
  return json as { ok: boolean; conversation: any };
}

export async function apiUnclaimConversation(opts: { accessToken: string; conversationId: string; reason?: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/conversations/${opts.conversationId}/unclaim`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ reason: opts.reason })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(json?.error || json?.details || json?.message || `http_${res.status}`) as any;
    error.details = json?.details;
    error.status = res.status;
    throw error;
  }
  return json as { ok: boolean };
}

// ====== Disponibilidade da Secretária

export async function apiStartShift(opts: { accessToken: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/agent/start-shift`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" }
  });

  // Tentar ler como texto primeiro para debug
  const textResponse = await res.text().catch(() => "");
  let json: any = {};

  try {
    json = JSON.parse(textResponse);
  } catch (e) {
    // Se não conseguir parsear JSON, usar texto da resposta
    console.error("Erro ao parsear resposta JSON:", textResponse);
    throw new Error(`Erro ${res.status}: ${textResponse || res.statusText || "Erro desconhecido"}`);
  }

  if (!res.ok) {
    const errorMsg = json?.details || json?.error || json?.message || `Erro ${res.status}: ${res.statusText}`;
    const error = new Error(errorMsg) as any;
    error.details = json?.details;
    error.error = json?.error;
    error.code = json?.code;
    error.hint = json?.hint;
    error.status = res.status;
    error.fullResponse = json;
    error.rawResponse = textResponse;
    console.error("Erro detalhado do start-shift:", {
      status: res.status,
      statusText: res.statusText,
      jsonResponse: json,
      rawResponse: textResponse
    });
    throw error;
  }
  return json as { ok: boolean; shift_id: string; started_at: string };
}

export async function apiAgentStatus(opts: { accessToken: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/agent/status`, {
    headers: { Authorization: `Bearer ${opts.accessToken}` }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json as {
    has_active_shift: boolean;
    shift_id?: string;
    is_paused: boolean;
    pause_id?: string;
    started_at?: string;
    total_minutes_worked?: number;
    total_minutes_paused?: number;
    current_pause_reason?: string;
  };
}

export async function apiPause(opts: { accessToken: string; reason: "horario_almoco" | "pausa_cafe" | "banheiro" | "outro"; reason_detail?: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/agent/pause`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ reason: opts.reason, reason_detail: opts.reason_detail })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? json?.details ?? `http_${res.status}`);
  return json as { ok: boolean; pause_id: string; started_at: string };
}

export async function apiResume(opts: { accessToken: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/agent/resume`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? json?.details ?? `http_${res.status}`);
  return json as { ok: boolean; pause_id: string; minutes: number };
}

export async function apiEndShift(opts: { accessToken: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/agent/end-shift`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? json?.details ?? `http_${res.status}`);
  return json as { ok: boolean; shift_id: string; total_minutes_worked: number; total_minutes_paused: number; ended_at: string };
}

export async function apiGetWhatsAppCosts(opts: { accessToken: string; from: string; to: string }) {
  const params = new URLSearchParams();
  params.set("from", opts.from);
  params.set("to", opts.to);

  const res = await fetch(`${apiBaseUrl()}/api/reports/whatsapp-costs?${params}`, {
    headers: { Authorization: `Bearer ${opts.accessToken}` }
  });

  if (!res.ok) {
    console.warn("apiGetWhatsAppCosts error:", res.status);
    return [];
  }

  const json = await res.json().catch(() => ({ items: [] }));
  return (json.items ?? []) as { category: string; quantity: number }[];
}

export async function apiReportFunnel(opts: { accessToken: string; from: string; to: string }) {
  const params = new URLSearchParams();
  params.set("from", opts.from);
  params.set("to", opts.to);

  const res = await fetch(`${apiBaseUrl()}/api/reports/funnel?${params}`, {
    headers: { Authorization: `Bearer ${opts.accessToken}` }
  });

  if (!res.ok) {
    console.warn("apiReportFunnel error:", res.status);
    return [];
  }

  const json = await res.json().catch(() => ({ items: [] }));
  return (json.items ?? []) as Array<{ stage_id: string; stage_name: string; moved_in: number }>;
}

export async function apiReportAgents(opts: { accessToken: string; from: string; to: string }) {
  const params = new URLSearchParams();
  params.set("from", opts.from);
  params.set("to", opts.to);

  const res = await fetch(`${apiBaseUrl()}/api/reports/agents?${params}`, {
    headers: { Authorization: `Bearer ${opts.accessToken}` }
  });

  if (!res.ok) {
    console.warn("apiReportAgents error:", res.status);
    return [];
  }

  const json = await res.json().catch(() => ({ items: [] }));
  return (json.items ?? []) as Array<{
    user_id: string;
    out_messages: number;
    in_messages: number;
    sla_breaches: number;
    avg_response_seconds: number | null;
  }>;
}



// ====== Admin - Gestão de Atendentes

export async function apiAdminAgents(opts: { accessToken: string; from?: string; to?: string }) {
  const params = new URLSearchParams();
  if (opts.from) params.set("from", opts.from);
  if (opts.to) params.set("to", opts.to);
  const res = await fetch(`${apiBaseUrl()}/api/admin/agents?${params.toString()}`, {
    headers: { Authorization: `Bearer ${opts.accessToken}` }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json as {
    items: Array<{
      user_id: string;
      full_name: string;
      email: string;
      status: "online" | "offline" | "paused";
      total_shifts: number;
      total_minutes_worked: number;
      total_conversations: number;
      avg_response_time_seconds: number;
      sla_breaches: number;
      avg_rating: number;
      total_ratings: number;
    }>;
  };
}

export async function apiAdminAgentMetrics(opts: { accessToken: string; userId: string; from?: string; to?: string }) {
  const params = new URLSearchParams();
  if (opts.from) params.set("from", opts.from);
  if (opts.to) params.set("to", opts.to);
  const res = await fetch(`${apiBaseUrl()}/api/admin/agents/${opts.userId}/metrics?${params.toString()}`, {
    headers: { Authorization: `Bearer ${opts.accessToken}` }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json as {
    user_id: string;
    full_name: string;
    shifts: Array<{
      date: string;
      started_at: string;
      ended_at: string;
      minutes_worked: number;
      minutes_paused: number;
      pauses: Array<{ reason: string; reason_detail: string | null; minutes: number }>;
    }>;
    conversations: {
      total: number;
      avg_response_time_seconds: number;
      sla_breaches: number;
    };
    ratings: {
      avg: number;
      count: number;
      distribution: { 1: number; 2: number; 3: number; 4: number; 5: number };
      items: Array<{ rating: number; comment: string | null; created_at: string }>;
    };
  };
}

export async function apiAdminAgentConversations(opts: {
  accessToken: string;
  userId: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (opts.from) params.set("from", opts.from);
  if (opts.to) params.set("to", opts.to);
  if (opts.page) params.set("page", opts.page.toString());
  if (opts.limit) params.set("limit", opts.limit.toString());
  const res = await fetch(`${apiBaseUrl()}/api/admin/agents/${opts.userId}/conversations?${params.toString()}`, {
    headers: { Authorization: `Bearer ${opts.accessToken}` }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json as {
    items: Array<{
      id: string;
      contact_name: string | null;
      contact_phone: string | null;
      started_at: string;
      ended_at: string | null;
      duration_minutes: number;
      messages_count: number;
      rating: number | null;
      stage_name: string | null;
      status_fila: string;
    }>;
    total: number;
    page: number;
    limit: number;
  };
}

export async function apiRateConversation(opts: { accessToken: string; conversationId: string; rating: number; comment?: string; contact_phone?: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/conversations/${opts.conversationId}/rate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      rating: opts.rating,
      comment: opts.comment,
      contact_phone: opts.contact_phone
    })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? json?.details ?? `http_${res.status}`);
  return json as { ok: boolean; rating_id: string };
}

export async function apiDeleteAgent(opts: { accessToken: string; userId: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/admin/agents/${opts.userId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${opts.accessToken}` }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? json?.details ?? `http_${res.status}`);
  return json as { ok: boolean };
}

// ====== Metas e Objetivos

export async function apiGetAgentGoals(opts: { accessToken: string; userId: string; monthYear?: string }) {
  const params = new URLSearchParams();
  if (opts.monthYear) params.set("month_year", opts.monthYear);
  const res = await fetch(`${apiBaseUrl()}/api/admin/agents/${opts.userId}/goals?${params.toString()}`, {
    headers: { Authorization: `Bearer ${opts.accessToken}` }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json as { goal: any | null };
}

export async function apiSetAgentGoal(opts: {
  accessToken: string;
  userId: string;
  monthYear: string;
  goal_conversations?: number;
  goal_avg_rating?: number;
  goal_avg_response_seconds?: number;
  goal_sla_compliance_percent?: number;
}) {
  const res = await fetch(`${apiBaseUrl()}/api/admin/agents/${opts.userId}/goals`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      month_year: opts.monthYear,
      goal_conversations: opts.goal_conversations,
      goal_avg_rating: opts.goal_avg_rating,
      goal_avg_response_seconds: opts.goal_avg_response_seconds,
      goal_sla_compliance_percent: opts.goal_sla_compliance_percent
    })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? json?.details ?? `http_${res.status}`);
  return json as { goal: any };
}

// ====== Badges

export async function apiGetAgentBadges(opts: { accessToken: string; userId: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/admin/agents/${opts.userId}/badges`, {
    headers: { Authorization: `Bearer ${opts.accessToken}` }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json as { badges: Array<{ id: string; badge_key: string; badge_name: string; earned_at: string; metadata: any }> };
}

// ====== Notas Internas

export async function apiGetAgentNotes(opts: { accessToken: string; userId: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/admin/agents/${opts.userId}/notes`, {
    headers: { Authorization: `Bearer ${opts.accessToken}` }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json as {
    notes: Array<{
      id: string;
      note_text: string;
      created_at: string;
      updated_at: string;
      created_by_user_id: string;
      profiles: { full_name: string } | null;
    }>;
  };
}

export async function apiCreateAgentNote(opts: { accessToken: string; userId: string; note_text: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/admin/agents/${opts.userId}/notes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ note_text: opts.note_text })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? json?.details ?? `http_${res.status}`);
  return json as { note: any };
}



export async function apiReactMessage(opts: { accessToken: string; messageId: string; emoji: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/messages/${opts.messageId}/reactions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ emoji: opts.emoji })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(json?.error || json?.message || `http_${res.status}`) as any;
    throw error;
  }
  return json as { action: "added" | "removed" };
}
