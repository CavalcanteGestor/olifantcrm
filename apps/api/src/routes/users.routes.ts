import { FastifyInstance } from "fastify";
import { getTenantIdForUser, requireAnyRole, requireAuth } from "../lib/auth.js";
import { supabase } from "../lib/supabase.js";
import { InviteUserSchema } from "../schemas/users.schemas.js";

export async function usersRoutes(app: FastifyInstance) {
  // Listar usuários
  app.get("/api/users", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    try {
      // Buscar profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .eq("tenant_id", tenantId)
        .order("full_name", { ascending: true });

      if (profilesError) {
        req.log.error({ err: profilesError }, "profiles_query_failed");
        reply.code(500).send({ error: "query_failed", details: profilesError.message });
        return;
      }

      if (!profiles || profiles.length === 0) {
        reply.send({ items: [] });
        return;
      }

      const userIds = profiles.map((p: any) => p.user_id);

      // Buscar roles separadamente
      const { data: userRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role_id, roles(key)")
        .eq("tenant_id", tenantId)
        .in("user_id", userIds);

      if (rolesError) {
        req.log.error({ err: rolesError }, "roles_query_failed");
        // Continuar sem roles ao invés de falhar
      }

      // Mapear roles por user_id
      const rolesMap = new Map<string, string>();
      if (userRoles) {
        for (const ur of userRoles as any[]) {
          const roleKey = ur.roles?.key || "secretaria";
          rolesMap.set(ur.user_id, roleKey);
        }
      }

      const items = profiles.map((p: any) => {
        const roleKey = rolesMap.get(p.user_id) || "secretaria";
        return {
          user_id: p.user_id,
          full_name: p.full_name,
          role: roleKey === "coordenador" ? "admin" : roleKey
        };
      });

      reply.send({ items });
    } catch (e: any) {
      req.log.error({ err: e }, "users_list_failed");
      reply.code(500).send({ error: "internal_error", details: e.message });
    }
  });

  // Criar/Convidar usuário
  app.post("/api/users/invite", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    try {
      await requireAnyRole(userId, tenantId, ["admin"]);
    } catch {
      reply.code(403).send({ error: "forbidden" });
      return;
    }

    const parsed = InviteUserSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
      return;
    }

    try {
      const userAttrs: any = {
        email: parsed.data.email,
        email_confirm: !parsed.data.send_invite,
        user_metadata: {
          full_name: parsed.data.full_name
        }
      };
      if (parsed.data.password) {
        userAttrs.password = parsed.data.password;
      }

      const { data: authUser, error: authError } = await supabase.auth.admin.createUser(userAttrs);

      if (authError) {
        if (authError.message.includes("already")) {
          reply.code(409).send({ error: "user_already_exists" });
          return;
        }
        throw authError;
      }

      if (!authUser.user) {
        reply.code(500).send({ error: "user_creation_failed" });
        return;
      }

      const { error: profileError } = await supabase.from("profiles").insert({
        user_id: authUser.user.id,
        tenant_id: tenantId,
        full_name: parsed.data.full_name
      });

      if (profileError) {
        await supabase.auth.admin.deleteUser(authUser.user.id);
        throw profileError;
      }

      // Assign Role
      const roleKey = parsed.data.role === "admin" ? "coordenador" : "secretaria";
      const { data: roleData } = await supabase.from("roles").select("id").eq("key", roleKey).single();
      
      if (roleData) {
        await supabase.from("user_roles").insert({
          tenant_id: tenantId,
          user_id: authUser.user.id,
          role_id: roleData.id
        });
      }

      if (parsed.data.send_invite) {
        await supabase.auth.admin.generateLink({
          type: "magiclink",
          email: parsed.data.email
        });
        if (!parsed.data.password) {
          await supabase.auth.admin.generateLink({
            type: "recovery",
            email: parsed.data.email
          });
        }
      }

      reply.send({
        ok: true,
        user_id: authUser.user.id,
        email: authUser.user.email,
        full_name: parsed.data.full_name
      });
    } catch (err: any) {
      reply.code(500).send({ error: "creation_failed", message: err.message });
    }
  });

  // Remover usuário
  app.delete("/api/users/:userId", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    try {
      await requireAnyRole(userId, tenantId, ["admin"]);
    } catch {
      reply.code(403).send({ error: "forbidden" });
      return;
    }

    const { userId: targetUserId } = req.params as { userId: string };

    if (targetUserId === userId) {
      reply.code(400).send({ error: "cannot_delete_self" });
      return;
    }

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("user_id", targetUserId)
      .eq("tenant_id", tenantId)
      .single();

    if (profileErr || !profile) {
      reply.code(404).send({ error: "user_not_found" });
      return;
    }

    const { data: activeConversations, error: convErr } = await supabase
      .from("conversations")
      .select("id, status_fila")
      .eq("tenant_id", tenantId)
      .eq("assigned_user_id", targetUserId)
      .in("status_fila", ["aguardando_atendimento", "em_atendimento"]);

    if (convErr) {
      reply.code(500).send({ error: "query_failed", details: convErr.message });
      return;
    }

    if (activeConversations && activeConversations.length > 0) {
      reply.code(409).send({
        error: "user_has_active_conversations",
        count: activeConversations.length
      });
      return;
    }

    const { error: deleteErr } = await supabase.auth.admin.deleteUser(targetUserId);
    if (deleteErr) {
      reply.code(500).send({ error: "deletion_failed", message: deleteErr.message });
      return;
    }

    reply.send({ ok: true });
  });

  // Atualizar papel do usuário
  app.put("/api/users/:userId/role", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    try {
      await requireAnyRole(userId, tenantId, ["admin"]);
    } catch {
      reply.code(403).send({ error: "forbidden" });
      return;
    }

    const { userId: targetUserId } = req.params as { userId: string };
    const { role } = req.body as { role: "admin" | "secretaria" };

    if (!["admin", "secretaria"].includes(role)) {
      reply.code(400).send({ error: "invalid_role" });
      return;
    }

    if (targetUserId === userId) {
      reply.code(400).send({ error: "cannot_change_own_role" });
      return;
    }

    // 1. Get role_id for the target role
    const { data: roleData, error: roleError } = await supabase
      .from("roles")
      .select("id")
      .eq("key", role === "admin" ? "coordenador" : "secretaria") // Map admin -> coordenador (internal key)
      .single();

    if (roleError || !roleData) {
      reply.code(500).send({ error: "role_lookup_failed" });
      return;
    }

    // 2. Delete existing roles for this user in this tenant
    const { error: deleteError } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", targetUserId)
      .eq("tenant_id", tenantId);

    if (deleteError) {
      reply.code(500).send({ error: "delete_old_roles_failed", message: deleteError.message });
      return;
    }

    // 3. Insert new role
    const { error: insertError } = await supabase
      .from("user_roles")
      .insert({
        tenant_id: tenantId,
        user_id: targetUserId,
        role_id: roleData.id
      });

    if (insertError) {
      reply.code(500).send({ error: "insert_new_role_failed", message: insertError.message });
      return;
    }

    reply.send({ ok: true });
  });

  // Atualizar nome do usuário
  app.put("/api/users/:userId/name", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    try {
      await requireAnyRole(userId, tenantId, ["admin"]);
    } catch {
      reply.code(403).send({ error: "forbidden" });
      return;
    }

    const { userId: targetUserId } = req.params as { userId: string };
    const { full_name } = req.body as { full_name: string };

    if (!full_name || full_name.trim().length < 2) {
      reply.code(400).send({ error: "name_too_short", message: "Nome deve ter no mínimo 2 caracteres" });
      return;
    }

    // Verificar se o usuário alvo pertence ao mesmo tenant
    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", targetUserId)
      .single();

    if (!targetProfile || (targetProfile as any).tenant_id !== tenantId) {
      reply.code(404).send({ error: "user_not_found" });
      return;
    }

    try {
      // Atualizar nome no profiles
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ full_name: full_name.trim() })
        .eq("user_id", targetUserId)
        .eq("tenant_id", tenantId);

      if (updateError) {
        throw updateError;
      }

      // Atualizar também no auth.users metadata
      await supabase.auth.admin.updateUserById(targetUserId, {
        user_metadata: { full_name: full_name.trim() }
      });

      reply.send({ ok: true, message: "Nome atualizado com sucesso" });
    } catch (err: any) {
      req.log.error({ err }, "name_update_failed");
      reply.code(500).send({ error: "name_update_failed", message: err.message });
    }
  });

  // Atualizar senha do usuário
  app.put("/api/users/:userId/password", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    try {
      await requireAnyRole(userId, tenantId, ["admin"]);
    } catch {
      reply.code(403).send({ error: "forbidden" });
      return;
    }

    const { userId: targetUserId } = req.params as { userId: string };
    const { password } = req.body as { password: string };

    if (!password || password.length < 8) {
      reply.code(400).send({ error: "password_too_short", message: "Senha deve ter no mínimo 8 caracteres" });
      return;
    }

    // Verificar se o usuário alvo pertence ao mesmo tenant
    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", targetUserId)
      .single();

    if (!targetProfile || (targetProfile as any).tenant_id !== tenantId) {
      reply.code(404).send({ error: "user_not_found" });
      return;
    }

    try {
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        targetUserId,
        { password }
      );

      if (updateError) {
        throw updateError;
      }

      reply.send({ ok: true, message: "Senha atualizada com sucesso" });
    } catch (err: any) {
      req.log.error({ err }, "password_update_failed");
      reply.code(500).send({ error: "password_update_failed", message: err.message });
    }
  });
}
