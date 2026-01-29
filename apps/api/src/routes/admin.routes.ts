import { FastifyInstance } from "fastify";
import { getTenantIdForUser, requireAnyRole, requireAuth } from "../lib/auth.js";
import { supabase } from "../lib/supabase.js";
import { GoalSchema, NoteSchema, PauseSchema } from "../schemas/admin.schemas.js";

export async function adminRoutes(app: FastifyInstance) {
  // ====== Admin - Gestão de Atendentes

  // Listar atendentes com métricas agregadas
  app.get("/api/admin/agents", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    // Verificar permissão (admin/coordenador)
    try {
      await requireAnyRole(userId, tenantId, ["admin", "coordenador"]);
    } catch {
      reply.code(403).send({ error: "forbidden" });
      return;
    }

    const q = req.query as any;
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 30 * 86400 * 1000);
    const to = q.to ? new Date(q.to) : new Date();

    // Buscar todos os perfis do tenant
    const { data: profiles, error: profilesErr } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .eq("tenant_id", tenantId);

    if (profilesErr) {
      reply.code(500).send({ error: "query_failed" });
      return;
    }

    const agents = await Promise.all(
      (profiles ?? []).map(async (profile) => {
        const agentUserId = profile.user_id as string;

        // Turnos no período
        const { data: shifts, error: shiftsErr } = await supabase
          .from("agent_shifts")
          .select("total_minutes_worked, total_minutes_paused")
          .eq("tenant_id", tenantId)
          .eq("user_id", agentUserId)
          .not("ended_at", "is", null)
          .gte("started_at", from.toISOString())
          .lte("started_at", to.toISOString());

        const totalMinutesWorked = (shifts ?? []).reduce((sum, s) => sum + (s.total_minutes_worked || 0), 0);
        const totalShifts = shifts?.length || 0;

        // Conversas em atendimento (não no período, mas atualmente em atendimento)
        const { count: conversationsCount, error: convErr } = await supabase
          .from("conversations")
          .select("id", { head: true, count: "exact" })
          .eq("tenant_id", tenantId)
          .eq("assigned_user_id", agentUserId)
          .eq("status_fila", "em_atendimento");

        // Tempo médio de resposta (simplificado - buscar mensagens in e próxima out)
        const { data: messages, error: msgErr } = await supabase
          .from("messages")
          .select("id, created_at, direction, conversation_id, sent_by_user_id")
          .eq("tenant_id", tenantId)
          .in("conversation_id", await supabase
            .from("conversations")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("assigned_user_id", agentUserId)
            .gte("created_at", from.toISOString())
            .lte("created_at", to.toISOString())
            .then((r) => (r.data ?? []).map((c: any) => c.id))
          )
          .gte("created_at", from.toISOString())
          .lte("created_at", to.toISOString())
          .order("created_at", { ascending: true });

        let avgResponseSeconds = 0;
        if (messages && messages.length > 0) {
          const responseTimes: number[] = [];
          for (let i = 0; i < messages.length - 1; i++) {
            const msg = messages[i];
            const nextMsg = messages[i + 1];
            if (!msg || !nextMsg) continue;
            if (msg.direction === "in" && nextMsg.direction === "out" && nextMsg.sent_by_user_id === agentUserId) {
              const diff = (new Date(nextMsg.created_at).getTime() - new Date(msg.created_at).getTime()) / 1000;
              if (diff > 0 && diff < 3600) {
                // Ignorar respostas muito rápidas ou muito lentas
                responseTimes.push(diff);
              }
            }
          }
          if (responseTimes.length > 0) {
            avgResponseSeconds = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
          }
        }

        // SLA breaches
        const { count: slaBreaches, error: slaErr } = await supabase
          .from("sla_events")
          .select("id", { head: true, count: "exact" })
          .eq("tenant_id", tenantId)
          .eq("assigned_user_id", agentUserId)
          .eq("type", "breach")
          .gte("occurred_at", from.toISOString())
          .lte("occurred_at", to.toISOString());

        // Avaliações
        const { data: ratings, error: ratingsErr } = await supabase
          .from("conversation_ratings")
          .select("rating")
          .eq("tenant_id", tenantId)
          .in(
            "conversation_id",
            await supabase
              .from("conversations")
              .select("id")
              .eq("tenant_id", tenantId)
              .eq("assigned_user_id", agentUserId)
              .then((r) => (r.data ?? []).map((c: any) => c.id))
          )
          .gte("created_at", from.toISOString())
          .lte("created_at", to.toISOString());

        const avgRating =
          ratings && ratings.length > 0
            ? ratings.reduce((sum, r) => sum + (r.rating as number), 0) / ratings.length
            : 0;

        // Status atual (tem turno ativo?)
        const { data: activeShift, error: activeErr } = await supabase
          .from("agent_shifts")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("user_id", agentUserId)
          .is("ended_at", null)
          .single();

        const { data: activePause, error: pauseErr } = activeShift
          ? await supabase
            .from("agent_pauses")
            .select("id")
            .eq("shift_id", activeShift.id)
            .is("ended_at", null)
            .single()
          : { data: null, error: { code: "PGRST116" } };

        let status = "offline";
        if (activeShift) {
          status = activePause ? "paused" : "online";
        }

        // Buscar email do usuário
        const { data: authUser, error: authErr } = await supabase.auth.admin.getUserById(agentUserId);
        const email = authUser?.user?.email || "";

        return {
          user_id: agentUserId,
          full_name: profile.full_name,
          email,
          status,
          total_shifts: totalShifts,
          total_minutes_worked: totalMinutesWorked,
          total_conversations: conversationsCount || 0,
          avg_response_time_seconds: Math.round(avgResponseSeconds),
          sla_breaches: slaBreaches || 0,
          avg_rating: Math.round(avgRating * 10) / 10,
          total_ratings: ratings?.length || 0
        };
      })
    );

    reply.send({ items: agents });
  });

  // Métricas detalhadas de um atendente
  app.get("/api/admin/agents/:userId/metrics", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    // Verificar permissão
    try {
      await requireAnyRole(userId, tenantId, ["admin", "coordenador"]);
    } catch {
      reply.code(403).send({ error: "forbidden" });
      return;
    }

    const { userId: targetUserId } = req.params as { userId: string };
    const q = req.query as any;
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 30 * 86400 * 1000);
    const to = q.to ? new Date(q.to) : new Date();

    // Verificar que o usuário pertence ao tenant
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .eq("user_id", targetUserId)
      .eq("tenant_id", tenantId)
      .single();

    if (profileErr || !profile) {
      reply.code(404).send({ error: "user_not_found" });
      return;
    }

    // Buscar turnos no período
    const { data: shifts, error: shiftsErr } = await supabase
      .from("agent_shifts")
      .select("id, started_at, ended_at, total_minutes_worked, total_minutes_paused")
      .eq("tenant_id", tenantId)
      .eq("user_id", targetUserId)
      .not("ended_at", "is", null)
      .gte("started_at", from.toISOString())
      .lte("started_at", to.toISOString())
      .order("started_at", { ascending: false });

    // Buscar pausas de cada turno
    const shiftsWithPauses = await Promise.all(
      (shifts ?? []).map(async (shift) => {
        const { data: pauses, error: pausesErr } = await supabase
          .from("agent_pauses")
          .select("id, reason, reason_detail, started_at, ended_at, minutes_duration")
          .eq("shift_id", shift.id)
          .order("started_at", { ascending: true });

        return {
          date: shift.started_at.split("T")[0],
          started_at: shift.started_at,
          ended_at: shift.ended_at,
          minutes_worked: shift.total_minutes_worked || 0,
          minutes_paused: shift.total_minutes_paused || 0,
          pauses: (pauses ?? []).map((p) => ({
            reason: p.reason,
            reason_detail: p.reason_detail,
            minutes: p.minutes_duration || 0
          }))
        };
      })
    );

    // Conversas atendidas
    const { data: conversations, error: convErr } = await supabase
      .from("conversations")
      .select("id, created_at, status_fila, last_patient_message_at")
      .eq("tenant_id", tenantId)
      .eq("assigned_user_id", targetUserId)
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString());

    // Calcular tempo médio de resposta (simplificado)
    const conversationIds = (conversations ?? []).map((c: any) => c.id);
    let avgResponseTime = 0;
    if (conversationIds.length > 0) {
      const { data: messages, error: msgErr } = await supabase
        .from("messages")
        .select("id, created_at, direction, sent_by_user_id")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: true });

      if (messages && messages.length > 0) {
        const responseTimes: number[] = [];
        for (let i = 0; i < messages.length - 1; i++) {
          const msg = messages[i];
          const nextMsg = messages[i + 1];
          if (!msg || !nextMsg) continue;
          if (msg.direction === "in" && nextMsg.direction === "out" && nextMsg.sent_by_user_id === targetUserId) {
            const diff = (new Date(nextMsg.created_at).getTime() - new Date(msg.created_at).getTime()) / 1000;
            if (diff > 0 && diff < 3600) {
              responseTimes.push(diff);
            }
          }
        }
        if (responseTimes.length > 0) {
          avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        }
      }
    }

    // SLA breaches
    const { count: slaBreaches, error: slaErr } = await supabase
      .from("sla_events")
      .select("id", { head: true, count: "exact" })
      .eq("tenant_id", tenantId)
      .eq("assigned_user_id", targetUserId)
      .eq("type", "breach")
      .gte("occurred_at", from.toISOString())
      .lte("occurred_at", to.toISOString());

    // Avaliações
    const { data: ratings, error: ratingsErr } = await supabase
      .from("conversation_ratings")
      .select("rating, comment, created_at")
      .eq("tenant_id", tenantId)
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false });

    const avgRating =
      ratings && ratings.length > 0
        ? ratings.reduce((sum, r) => sum + (r.rating as number), 0) / ratings.length
        : 0;

    const ratingDistribution = {
      1: ratings?.filter((r) => r.rating === 1).length || 0,
      2: ratings?.filter((r) => r.rating === 2).length || 0,
      3: ratings?.filter((r) => r.rating === 3).length || 0,
      4: ratings?.filter((r) => r.rating === 4).length || 0,
      5: ratings?.filter((r) => r.rating === 5).length || 0
    };

    reply.send({
      user_id: targetUserId,
      full_name: profile.full_name,
      shifts: shiftsWithPauses,
      conversations: {
        total: conversations?.length || 0,
        avg_response_time_seconds: Math.round(avgResponseTime),
        sla_breaches: slaBreaches || 0
      },
      ratings: {
        avg: Math.round(avgRating * 10) / 10,
        count: ratings?.length || 0,
        distribution: ratingDistribution,
        items: (ratings ?? []).map((r) => ({
          rating: r.rating,
          comment: r.comment,
          created_at: r.created_at
        }))
      }
    });
  });

  // Conversas de um atendente (paginação)
  app.get("/api/admin/agents/:userId/conversations", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    // Verificar permissão
    try {
      await requireAnyRole(userId, tenantId, ["admin", "coordenador"]);
    } catch {
      reply.code(403).send({ error: "forbidden" });
      return;
    }

    const { userId: targetUserId } = req.params as { userId: string };
    const q = req.query as any;
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 30 * 86400 * 1000);
    const to = q.to ? new Date(q.to) : new Date();
    const page = parseInt(q.page || "1");
    const limit = Math.min(parseInt(q.limit || "50"), 100);
    const offset = (page - 1) * limit;

    // Verificar que o usuário pertence ao tenant
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

    // Buscar conversas
    let query = supabase
      .from("conversations")
      .select(
        "id, created_at, updated_at, status_fila, contacts(display_name, phone_e164), funnel_stages(name)",
        { count: "exact" }
      )
      .eq("tenant_id", tenantId)
      .eq("assigned_user_id", targetUserId)
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: conversations, error: convErr, count } = await query;

    if (convErr) {
      reply.code(500).send({ error: "query_failed" });
      return;
    }

    // Buscar avaliações e contagem de mensagens para cada conversa
    const conversationsWithDetails = await Promise.all(
      (conversations ?? []).map(async (conv: any) => {
        // Buscar avaliação
        const { data: rating, error: ratingErr } = await supabase
          .from("conversation_ratings")
          .select("rating, comment")
          .eq("conversation_id", conv.id)
          .single();

        // Contar mensagens
        const { count: msgCount, error: msgErr } = await supabase
          .from("messages")
          .select("id", { head: true, count: "exact" })
          .eq("conversation_id", conv.id);

        // Calcular duração (se finalizada)
        let durationMinutes = 0;
        if (conv.status_fila === "finalizado" && conv.created_at && conv.updated_at) {
          durationMinutes = Math.floor(
            (new Date(conv.updated_at).getTime() - new Date(conv.created_at).getTime()) / 60000
          );
        }

        return {
          id: conv.id,
          contact_name: (conv.contacts as any)?.display_name || null,
          contact_phone: (conv.contacts as any)?.phone_e164 || null,
          started_at: conv.created_at,
          ended_at: conv.status_fila === "finalizado" ? conv.updated_at : null,
          duration_minutes: durationMinutes,
          messages_count: msgCount || 0,
          rating: rating?.rating || null,
          stage_name: (conv.funnel_stages as any)?.name || null,
          status_fila: conv.status_fila
        };
      })
    );

    reply.send({
      items: conversationsWithDetails,
      total: count || 0,
      page,
      limit
    });
  });

  // Remover atendente
  app.delete("/api/admin/agents/:userId", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    // Verificar permissão (apenas admin)
    try {
      await requireAnyRole(userId, tenantId, ["admin"]);
    } catch {
      reply.code(403).send({ error: "forbidden" });
      return;
    }

    const { userId: targetUserId } = req.params as { userId: string };

    // Verificar que o usuário pertence ao tenant
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

    // Verificar conversas em andamento
    const { data: activeConversations, error: convErr } = await supabase
      .from("conversations")
      .select("id, status_fila")
      .eq("tenant_id", tenantId)
      .eq("assigned_user_id", targetUserId)
      .in("status_fila", ["aguardando_atendimento", "em_atendimento"]);

    if (activeConversations && activeConversations.length > 0) {
      reply.code(409).send({
        error: "has_active_conversations",
        count: activeConversations.length,
        conversation_ids: activeConversations.map((c: any) => c.id)
      });
      return;
    }

    // Remover roles (não deletar usuário, apenas remover acesso)
    const { error: rolesErr } = await supabase.from("user_roles").delete().eq("tenant_id", tenantId).eq("user_id", targetUserId);

    if (rolesErr) {
      reply.code(500).send({ error: "removal_failed", details: rolesErr.message });
      return;
    }

    reply.send({ ok: true });
  });

  // ====== Metas e Objetivos

  app.get("/api/admin/agents/:userId/goals", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    try {
      await requireAnyRole(userId, tenantId, ["admin", "coordenador"]);
    } catch {
      reply.code(403).send({ error: "forbidden" });
      return;
    }

    const { userId: targetUserId } = req.params as { userId: string };
    const q = req.query as any;
    const monthYear = q.month_year || new Date().toISOString().slice(0, 7); // formato "2025-01"

    const { data, error } = await supabase
      .from("agent_goals")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("user_id", targetUserId)
      .eq("month_year", monthYear)
      .single();

    if (error && error.code !== "PGRST116") {
      reply.code(500).send({ error: "query_failed" });
      return;
    }

    reply.send({ goal: data || null });
  });

  app.post("/api/admin/agents/:userId/goals", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    try {
      await requireAnyRole(userId, tenantId, ["admin", "coordenador"]);
    } catch {
      reply.code(403).send({ error: "forbidden" });
      return;
    }

    const { userId: targetUserId } = req.params as { userId: string };
    const parsed = GoalSchema.safeParse(req.body);

    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
      return;
    }

    const { data, error } = await supabase
      .from("agent_goals")
      .upsert(
        {
          tenant_id: tenantId,
          user_id: targetUserId,
          month_year: parsed.data.month_year,
          goal_conversations: parsed.data.goal_conversations || null,
          goal_avg_rating: parsed.data.goal_avg_rating || null,
          goal_avg_response_seconds: parsed.data.goal_avg_response_seconds || null,
          goal_sla_compliance_percent: parsed.data.goal_sla_compliance_percent || null,
          updated_at: new Date().toISOString()
        },
        { onConflict: "tenant_id,user_id,month_year" }
      )
      .select()
      .single();

    if (error) {
      reply.code(500).send({ error: "upsert_failed", details: error.message });
      return;
    }

    reply.send({ goal: data });
  });

  // ====== Badges

  app.get("/api/admin/agents/:userId/badges", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    const { userId: targetUserId } = req.params as { userId: string };

    // Usuário pode ver seus próprios badges ou admin/coordenador pode ver todos
    if (targetUserId !== userId) {
      try {
        await requireAnyRole(userId, tenantId, ["admin", "coordenador"]);
      } catch {
        reply.code(403).send({ error: "forbidden" });
        return;
      }
    }

    const { data, error } = await supabase
      .from("agent_badges")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("user_id", targetUserId)
      .order("earned_at", { ascending: false });

    if (error) {
      reply.code(500).send({ error: "query_failed" });
      return;
    }

    reply.send({ badges: data || [] });
  });

  // ====== Notas Internas

  app.get("/api/admin/agents/:userId/notes", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    try {
      await requireAnyRole(userId, tenantId, ["admin", "coordenador"]);
    } catch {
      reply.code(403).send({ error: "forbidden" });
      return;
    }

    const { userId: targetUserId } = req.params as { userId: string };

    try {
      const { data: notes, error: notesError } = await supabase
        .from("agent_notes")
        .select("id, note_text, created_at, updated_at, created_by_user_id, user_id")
        .eq("tenant_id", tenantId)
        .eq("user_id", targetUserId)
        .order("created_at", { ascending: false });

      if (notesError) {
        console.error("Erro ao buscar notas:", notesError);
        reply.code(500).send({ error: "query_failed", details: notesError.message });
        return;
      }

      // Buscar profiles separadamente
      const createdByUserIds = [...new Set((notes || []).map((n: any) => n.created_by_user_id).filter(Boolean))];
      let profilesMap = new Map();
      if (createdByUserIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", createdByUserIds);

        if (profilesError) {
          console.error("Erro ao buscar profiles:", profilesError);
          // Continuar mesmo com erro nos profiles
        } else if (profiles) {
          profilesMap = new Map(profiles.map((p: any) => [p.user_id, p]));
        }
      }

      const data = (notes || []).map((note: any) => ({
        ...note,
        profiles: note.created_by_user_id ? profilesMap.get(note.created_by_user_id) || null : null
      }));

      reply.send({ notes: data || [] });
    } catch (err: any) {
      console.error("Erro inesperado ao buscar notas:", err);
      reply.code(500).send({ error: "internal_error", details: err?.message || "Erro desconhecido" });
    }
  });

  app.post("/api/admin/agents/:userId/notes", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    try {
      await requireAnyRole(userId, tenantId, ["admin", "coordenador"]);
    } catch {
      reply.code(403).send({ error: "forbidden" });
      return;
    }

    const { userId: targetUserId } = req.params as { userId: string };
    const parsed = NoteSchema.safeParse(req.body);

    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
      return;
    }

    const { data, error } = await supabase
      .from("agent_notes")
      .insert({
        tenant_id: tenantId,
        user_id: targetUserId,
        note_text: parsed.data.note_text,
        created_by_user_id: userId
      })
      .select()
      .single();

    if (error) {
      reply.code(500).send({ error: "insert_failed", details: error.message });
      return;
    }

    reply.send({ note: data });
  });

  // ====== Disponibilidade da Secretária (Turnos e Pausas)

  // Iniciar turno/dia
  app.post("/api/agent/start-shift", async (req, reply) => {
    try {
      let userId: string;
      try {
        userId = await requireAuth(req);
      } catch (err: any) {
        reply.code(401).send({ error: "unauthorized", details: err.message });
        return;
      }

      let tenantId: string;
      try {
        tenantId = await getTenantIdForUser(userId);
      } catch (err: any) {
        reply.code(500).send({ error: "tenant_lookup_failed", details: err.message, userId });
        return;
      }

      // Verificar se já existe turno ativo não finalizado
      const { data: activeShift, error: checkErr } = await supabase
        .from("agent_shifts")
        .select("id, started_at")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .is("ended_at", null)
        .maybeSingle();

      if (checkErr) {
        reply.code(500).send({ error: "check_failed", details: checkErr.message, code: checkErr.code });
        return;
      }

      if (activeShift) {
        reply.code(409).send({ error: "shift_already_active", shift_id: activeShift.id });
        return;
      }

      // Criar novo turno
      const { data: shift, error: insertErr } = await supabase
        .from("agent_shifts")
        .insert({
          tenant_id: tenantId,
          user_id: userId,
          started_at: new Date().toISOString()
        })
        .select("id, started_at")
        .single();

      if (insertErr || !shift) {
        reply.code(500).send({
          error: "creation_failed",
          details: insertErr?.message || insertErr?.hint || "No shift returned",
          code: insertErr?.code
        });
        return;
      }

      reply.send({ ok: true, shift_id: shift.id, started_at: shift.started_at });
    } catch (err: any) {
      console.error("Erro inesperado no start-shift:", err);
      reply.code(500).send({
        error: "unexpected_error",
        details: err.message || "Erro desconhecido",
        type: err.constructor?.name
      });
    }
  });

  // Status atual do turno
  app.get("/api/agent/status", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    // Buscar turno ativo
    const { data: shift, error: shiftErr } = await supabase
      .from("agent_shifts")
      .select("id, started_at, total_minutes_worked, total_minutes_paused")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .is("ended_at", null)
      .single();

    if (shiftErr && shiftErr.code !== "PGRST116") {
      reply.code(500).send({ error: "query_failed" });
      return;
    }

    if (!shift) {
      reply.send({
        has_active_shift: false,
        is_paused: false
      });
      return;
    }

    // Buscar pausa ativa
    const { data: pause, error: pauseErr } = await supabase
      .from("agent_pauses")
      .select("id, started_at, reason")
      .eq("shift_id", shift.id)
      .is("ended_at", null)
      .single();

    const isPaused = !pauseErr && !!pause;

    // Calcular tempo trabalhado até agora
    const now = Date.now();
    const startedAt = new Date(shift.started_at).getTime();
    const elapsedMinutes = Math.floor((now - startedAt) / 60000);
    const pausedMinutes = shift.total_minutes_paused || 0;
    const workedMinutes = Math.max(0, elapsedMinutes - pausedMinutes);

    reply.send({
      has_active_shift: true,
      shift_id: shift.id,
      is_paused: isPaused,
      pause_id: pause?.id,
      started_at: shift.started_at,
      total_minutes_worked: workedMinutes,
      total_minutes_paused: pausedMinutes,
      current_pause_reason: pause?.reason
    });
  });

  // Pausar (com justificativa obrigatória)
  app.post("/api/agent/pause", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    const parsed = PauseSchema.safeParse(req.body);

    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
      return;
    }

    // Buscar turno ativo
    const { data: shift, error: shiftErr } = await supabase
      .from("agent_shifts")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .is("ended_at", null)
      .single();

    if (shiftErr || !shift) {
      reply.code(404).send({ error: "no_active_shift" });
      return;
    }

    // Verificar se já está pausado
    const { data: activePause, error: pauseCheckErr } = await supabase
      .from("agent_pauses")
      .select("id")
      .eq("shift_id", shift.id)
      .is("ended_at", null)
      .single();

    if (!pauseCheckErr && activePause) {
      reply.code(409).send({ error: "already_paused", pause_id: activePause.id });
      return;
    }

    // Criar pausa
    const { data: pause, error: insertErr } = await supabase
      .from("agent_pauses")
      .insert({
        shift_id: shift.id,
        reason: parsed.data.reason,
        reason_detail: parsed.data.reason_detail || null,
        started_at: new Date().toISOString()
      })
      .select("id, started_at, reason")
      .single();

    if (insertErr || !pause) {
      reply.code(500).send({ error: "creation_failed", details: insertErr?.message });
      return;
    }

    // Desatribuir conversas ativas deste atendente ao pausar
    await supabase
      .from("conversations")
      .update({
        assigned_user_id: null,
        status_fila: "aguardando_atendimento",
        updated_at: new Date().toISOString()
      })
      .eq("tenant_id", tenantId)
      .eq("assigned_user_id", userId)
      .eq("status_fila", "em_atendimento");

    reply.send({ ok: true, pause_id: pause.id, started_at: pause.started_at });
  });

  // Retomar após pausa
  app.post("/api/agent/resume", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
    const tenantId = await getTenantIdForUser(userId);

    // Buscar turno ativo
    const { data: shift, error: shiftErr } = await supabase
      .from("agent_shifts")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .is("ended_at", null)
      .single();

    if (shiftErr || !shift) {
      reply.code(404).send({ error: "no_active_shift" });
      return;
    }

    // Buscar pausa ativa
    const { data: pause, error: pauseErr } = await supabase
      .from("agent_pauses")
      .select("id, started_at")
      .eq("shift_id", shift.id)
      .is("ended_at", null)
      .single();

    if (pauseErr || !pause) {
      reply.code(404).send({ error: "no_active_pause" });
      return;
    }

    // Finalizar pausa
    const now = new Date().toISOString();
    const startedAt = new Date(pause.started_at).getTime();
    const minutesDuration = Math.floor((Date.now() - startedAt) / 60000);

    const { error: updateErr } = await supabase
      .from("agent_pauses")
      .update({
        ended_at: now,
        minutes_duration: minutesDuration
      })
      .eq("id", pause.id);

    if (updateErr) {
      reply.code(500).send({ error: "update_failed", details: updateErr.message });
      return;
    }

    reply.send({ ok: true, pause_id: pause.id, minutes: minutesDuration });
  });

  // Encerrar turno/dia
  app.post("/api/agent/end-shift", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }

    // Buscar turno ativo
    const { data: shift, error: shiftErr } = await supabase
      .from("agent_shifts")
      .select("id, tenant_id, started_at")
      .eq("user_id", userId)
      .is("ended_at", null)
      .single();

    if (shiftErr || !shift) {
      reply.code(404).send({ error: "no_active_shift" });
      return;
    }

    // Chamar RPC para finalizar turno (calcula tudo automaticamente)
    const { data: endedShift, error: rpcErr } = await supabase.rpc("end_agent_shift", {
      p_shift_id: shift.id
    });

    if (rpcErr) {
      reply.code(400).send({ error: "end_failed", details: rpcErr.message });
      return;
    }

    // Desatribuir conversas ativas deste atendente ao encerrar turno
    await supabase
      .from("conversations")
      .update({
        assigned_user_id: null,
        status_fila: "aguardando_atendimento",
        updated_at: new Date().toISOString()
      })
      .eq("tenant_id", shift.tenant_id)
      .eq("assigned_user_id", userId)
      .eq("status_fila", "em_atendimento");

    reply.send({
      ok: true,
      shift_id: endedShift.id,
      total_minutes_worked: endedShift.total_minutes_worked,
      total_minutes_paused: endedShift.total_minutes_paused,
      ended_at: endedShift.ended_at
    });
  });
}
