import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Verifica e atribui badges automaticamente aos atendentes
 */
export async function checkAndAwardBadges(opts: {
  supabase: SupabaseClient;
  log: { info: (o: any, m?: string) => void; warn: (o: any, m?: string) => void; error: (o: any, m?: string) => void };
}) {
  const { supabase, log } = opts;

  // Buscar todos os atendentes ativos
  const { data: profiles, error: profilesErr } = await supabase
    .from("profiles")
    .select("user_id, tenant_id")
    .limit(100);

  if (profilesErr || !profiles) {
    log.error({ error: profilesErr }, "failed_to_fetch_profiles");
    return 0;
  }

  let awarded = 0;

  for (const profile of profiles) {
    const userId = profile.user_id as string;
    const tenantId = profile.tenant_id as string;

    // Verificar badges já conquistados hoje
    const today = new Date().toISOString().split("T")[0];
    const { data: todayBadges, error: badgesErr } = await supabase
      .from("agent_badges")
      .select("badge_key")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .gte("earned_at", `${today}T00:00:00Z`);

    const todayBadgeKeys = new Set((todayBadges || []).map((b: any) => b.badge_key));

    // 1. Super Atendente: 50+ conversas em um dia
    if (!todayBadgeKeys.has("super_atendente")) {
      const { count, error: convErr } = await supabase
        .from("conversations")
        .select("id", { head: true, count: "exact" })
        .eq("tenant_id", tenantId)
        .eq("assigned_user_id", userId)
        .gte("created_at", `${today}T00:00:00Z`)
        .lte("created_at", `${today}T23:59:59Z`);

      if (!convErr && count && count >= 50) {
        const { error: insertErr } = await supabase.from("agent_badges").insert({
          tenant_id: tenantId,
          user_id: userId,
          badge_key: "super_atendente",
          badge_name: "Super Atendente",
          metadata: { conversations: count }
        });
        if (!insertErr) {
          awarded++;
          log.info({ userId, tenantId, badge: "super_atendente" }, "badge_awarded");
        }
      }
    }

    // 2. Rápido: tempo médio de resposta < 30s (últimas 24h)
    if (!todayBadgeKeys.has("rapido")) {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: messages, error: msgErr } = await supabase
        .from("messages")
        .select("id, created_at, direction, sent_by_user_id, conversation_id")
        .eq("tenant_id", tenantId)
        .in(
          "conversation_id",
          await supabase
            .from("conversations")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("assigned_user_id", userId)
            .then((r) => (r.data ?? []).map((c: any) => c.id))
        )
        .gte("created_at", yesterday)
        .order("created_at", { ascending: true });

      if (!msgErr && messages && messages.length > 0) {
        const responseTimes: number[] = [];
        for (let i = 0; i < messages.length - 1; i++) {
          const msg = messages[i];
          const nextMsg = messages[i + 1];
          if (msg.direction === "in" && nextMsg.direction === "out" && nextMsg.sent_by_user_id === userId) {
            const diff = (new Date(nextMsg.created_at).getTime() - new Date(msg.created_at).getTime()) / 1000;
            if (diff > 0 && diff < 3600) {
              responseTimes.push(diff);
            }
          }
        }
        if (responseTimes.length > 0) {
          const avgResponse = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
          if (avgResponse < 30) {
            const { error: insertErr } = await supabase.from("agent_badges").insert({
              tenant_id: tenantId,
              user_id: userId,
              badge_key: "rapido",
              badge_name: "Rápido",
              metadata: { avg_response_seconds: Math.round(avgResponse) }
            });
            if (!insertErr) {
              awarded++;
              log.info({ userId, tenantId, badge: "rapido" }, "badge_awarded");
            }
          }
        }
      }
    }

    // 3. Favorito: nota média > 4.5 (últimas 30 avaliações)
    if (!todayBadgeKeys.has("favorito")) {
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
            .eq("assigned_user_id", userId)
            .then((r) => (r.data ?? []).map((c: any) => c.id))
        )
        .order("created_at", { ascending: false })
        .limit(30);

      if (!ratingsErr && ratings && ratings.length >= 10) {
        const avgRating = ratings.reduce((sum, r) => sum + (r.rating as number), 0) / ratings.length;
        if (avgRating > 4.5) {
          const { error: insertErr } = await supabase.from("agent_badges").insert({
            tenant_id: tenantId,
            user_id: userId,
            badge_key: "favorito",
            badge_name: "Favorito",
            metadata: { avg_rating: avgRating, total_ratings: ratings.length }
          });
          if (!insertErr) {
            awarded++;
            log.info({ userId, tenantId, badge: "favorito" }, "badge_awarded");
          }
        }
      }
    }

    // 4. Consistente: 30 dias consecutivos trabalhados
    if (!todayBadgeKeys.has("consistente")) {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: shifts, error: shiftsErr } = await supabase
        .from("agent_shifts")
        .select("started_at")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .gte("started_at", thirtyDaysAgo)
        .not("ended_at", "is", null);

      if (!shiftsErr && shifts) {
        const dateStrings = shifts.map((s: any) => {
          const dateStr = s.started_at as string;
          return dateStr.split("T")[0];
        });
        const dates = new Set(dateStrings);
        if (dates.size >= 30) {
          // Verificar se já tem badge de consistente nos últimos 30 dias
          const { data: existingBadge, error: badgeCheckErr } = await supabase
            .from("agent_badges")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("user_id", userId)
            .eq("badge_key", "consistente")
            .gte("earned_at", thirtyDaysAgo)
            .single();

          if (!badgeCheckErr && !existingBadge) {
            const { error: insertErr } = await supabase.from("agent_badges").insert({
              tenant_id: tenantId,
              user_id: userId,
              badge_key: "consistente",
              badge_name: "Consistente",
              metadata: { days_worked: dates.size }
            });
            if (!insertErr) {
              awarded++;
              log.info({ userId, tenantId, badge: "consistente" }, "badge_awarded");
            }
          }
        }
      }
    }
  }

  return awarded;
}

