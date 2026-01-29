import { FastifyRequest } from "fastify";
import { supabase } from "./supabase.js";

export async function requireAuth(req: FastifyRequest) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) throw new Error("missing_auth");
  const token = authHeader.slice("Bearer ".length);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error("invalid_auth");
  return data.user.id;
}

export async function getTenantIdForUser(userId: string) {
  const { data, error } = await supabase.from("profiles").select("tenant_id").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("profile_not_found");
  return data.tenant_id as string;
}

export async function requireAnyRole(userId: string, tenantId: string, roles: string[]) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role_id, roles!inner(key)")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId);
  if (error) throw error;
  const keys = new Set((data ?? []).map((r: any) => r.roles?.key).filter(Boolean));
  if (!roles.some((k) => keys.has(k))) throw new Error("forbidden");
}

export async function requireTenantScopedConversation(tenantId: string, conversationId: string) {
  const { data, error } = await supabase
    .from("conversations")
    .select("id, tenant_id, contact_id, last_patient_message_at")
    .eq("id", conversationId)
    .eq("tenant_id", tenantId)
    .single();
  if (error) throw error;
  return data as { id: string; tenant_id: string; contact_id: string; last_patient_message_at: string | null };
}
