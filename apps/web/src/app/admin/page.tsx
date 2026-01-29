"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiBaseUrl, apiReportFunnel, apiReportAgents } from "@/lib/api";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { apiAdminAgents } from "@/lib/api";
import { BarChart, Bar, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import Link from "next/link";
import { Home, TrendingUp, Users, MessageSquare, Clock, AlertTriangle, ArrowUpRight, Activity, Calendar } from "lucide-react";

function iso(d: Date) {
  return d.toISOString();
}

function formatDateYYYYMMDDInTimeZone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );
  return (asUTC - date.getTime()) / 60000;
}

function zonedStartOfDayToUtc(dateYYYYMMDD: string, timeZone: string) {
  const [y, m, d] = dateYYYYMMDD.split("-").map((x) => Number(x));
  const utcGuess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const offsetMinutes = getTimeZoneOffsetMinutes(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offsetMinutes * 60_000);
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);
  const [selectedDate, setSelectedDate] = useState(() => formatDateYYYYMMDDInTimeZone(new Date(), timeZone));
  const [dateMode, setDateMode] = useState<"today" | "date">("today");

  const dayRange = useMemo(() => {
    const day = dateMode === "today" ? formatDateYYYYMMDDInTimeZone(new Date(), timeZone) : selectedDate;
    const from = zonedStartOfDayToUtc(day, timeZone);
    const toExclusive = new Date(zonedStartOfDayToUtc(day, timeZone).getTime() + 24 * 60 * 60 * 1000);
    return { day, from, toExclusive };
  }, [selectedDate, dateMode, timeZone]);

  useEffect(() => {
    (async () => {
      const { data } = await supabaseBrowser().auth.getSession();
      if (!data.session) {
        const currentPath = window.location.pathname;
        router.replace(`/login?redirect=${encodeURIComponent(currentPath)}`);
      }
      else setAccessToken(data.session.access_token);
    })();
  }, [router]);

  const agentsQ = useQuery({
    queryKey: ["admin-agents", dayRange.day, iso(dayRange.from), iso(dayRange.toExclusive)],
    queryFn: () => apiAdminAgents({ accessToken: accessToken!, from: iso(dayRange.from), to: iso(dayRange.toExclusive) }),
    enabled: !!accessToken,
    refetchInterval: 20000 // Otimizado: 20s (reduz 50% de requisições)
  });

  const dayKpisQ = useQuery({
    queryKey: ["admin-day-kpis", dayRange.day, iso(dayRange.from), iso(dayRange.toExclusive)],
    queryFn: async () => {
      const { data: session } = await supabaseBrowser().auth.getSession();
      if (!session.session) return null;

      const { data: profile } = await supabaseBrowser()
        .from("profiles")
        .select("tenant_id")
        .eq("user_id", session.session.user.id)
        .single();
      if (!profile) return null;

      const tenantId = (profile as any).tenant_id as string;
      const fromIso = iso(dayRange.from);
      const toIso = iso(dayRange.toExclusive);

      const startedRes = await supabaseBrowser()
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("created_at", fromIso)
        .lt("created_at", toIso);

      const closedRes = await supabaseBrowser()
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status_fila", "finalizado")
        .gte("updated_at", fromIso)
        .lt("updated_at", toIso);

      const [funnelMoves, agentRows] = await Promise.all([
        apiReportFunnel({ accessToken: accessToken!, from: fromIso, to: toIso }),
        apiReportAgents({ accessToken: accessToken!, from: fromIso, to: toIso })
      ]);

      const started = startedRes.count ?? 0;
      const closed = closedRes.count ?? 0;

      const outMessages = agentRows.reduce((sum, r) => sum + Number(r.out_messages || 0), 0);
      const inMessages = agentRows.reduce((sum, r) => sum + Number(r.in_messages || 0), 0);
      const slaBreaches = agentRows.reduce((sum, r) => sum + Number(r.sla_breaches || 0), 0);
      const avgResponseSeconds = (() => {
        const vals = agentRows.map((r) => r.avg_response_seconds).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
        if (vals.length === 0) return null;
        return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
      })();

      return {
        started,
        closed,
        inMessages,
        outMessages,
        slaBreaches,
        avgResponseSeconds,
        topFunnelMoves: funnelMoves.slice(0, 6)
      };
    },
    enabled: !!accessToken
  });

  const activeSessionsQ = useQuery({
    queryKey: ["active-sessions"],
    refetchInterval: 15000, // Otimizado: 15s (reduz 66% de requisições)
    queryFn: async () => {
      const { data: session } = await supabaseBrowser().auth.getSession();
      if (!session.session) return [];

      const { data: profile } = await supabaseBrowser()
        .from("profiles")
        .select("tenant_id")
        .eq("user_id", session.session.user.id)
        .single();

      if (!profile) return [];

      const tenantId = (profile as any).tenant_id;

      const { data: shifts, error } = await supabaseBrowser()
        .from("agent_shifts")
        .select(`id, user_id, started_at`)
        .eq("tenant_id", tenantId)
        .is("ended_at", null)
        .order("started_at", { ascending: false });

      if (error || !shifts) return [];

      const userIds = [...new Set(shifts.map((s: any) => s.user_id))];
      const { data: profiles } = await supabaseBrowser()
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);

      const profilesMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));

      const shiftIds = shifts.map((s: any) => s.id);
      const { data: pauses } = await supabaseBrowser()
        .from("agent_pauses")
        .select("id, reason, reason_detail, started_at, ended_at, shift_id")
        .in("shift_id", shiftIds)
        .is("ended_at", null);

      const pausesMap = new Map<string, any[]>();
      (pauses || []).forEach((p: any) => {
        if (!pausesMap.has(p.shift_id)) pausesMap.set(p.shift_id, []);
        pausesMap.get(p.shift_id)!.push(p);
      });

      return await Promise.all(
        shifts.map(async (shift: any) => {
          const { data: conversations } = await supabaseBrowser()
            .from("conversations")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("assigned_user_id", shift.user_id)
            .in("status_fila", ["aguardando_atendimento", "em_atendimento"]);

          const activePause = (pausesMap.get(shift.id) || []).find((p: any) => !p.ended_at);
          const startTime = new Date(shift.started_at).getTime();
          const workedMinutes = Math.floor((Date.now() - startTime) / (1000 * 60));

          return {
            shift_id: shift.id,
            user_id: shift.user_id,
            full_name: profilesMap.get(shift.user_id)?.full_name || "Desconhecido",
            started_at: shift.started_at,
            is_paused: !!activePause,
            pause_reason: activePause?.reason || null,
            worked_time: `${Math.floor(workedMinutes / 60)}h ${workedMinutes % 60}m`
          };
        })
      );
    },
    enabled: !!accessToken
  });

  const realtimeMetricsQ = useQuery({
    queryKey: ["realtime-metrics"],
    refetchInterval: 15000, // Otimizado: 15s (reduz 66% de requisições)
    queryFn: async () => {
      const { data: session } = await supabaseBrowser().auth.getSession();
      if (!session.session) return null;

      const { data: profile } = await supabaseBrowser()
        .from("profiles")
        .select("tenant_id")
        .eq("user_id", session.session.user.id)
        .single();

      if (!profile) return null;

      const tenantId = (profile as any).tenant_id;

      const [conversationsRes, shiftsRes, messagesRes] = await Promise.all([
        supabaseBrowser().from("conversations").select("id, status_fila").eq("tenant_id", tenantId),
        supabaseBrowser().from("agent_shifts").select("id, agent_pauses(id)").eq("tenant_id", tenantId).is("ended_at", null),
        supabaseBrowser().from("messages").select("id").eq("tenant_id", tenantId).gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
      ]);

      const conversations = conversationsRes.data || [];
      const shifts = shiftsRes.data || [];

      return {
        aguardando: conversations.filter((c: any) => c.status_fila === "aguardando_atendimento").length,
        onlineAgents: shifts.filter((s: any) => !s.agent_pauses || (s.agent_pauses as any).length === 0).length,
        messagesLastHour: messagesRes.data?.length || 0
      };
    },
    enabled: !!accessToken
  });

  const metrics = useMemo(() => {
    const agents = agentsQ.data?.items ?? [];
    const totalAgents = agents.length;
    const onlineAgents = agents.filter((a) => a.status === "online").length;
    const pausedAgents = agents.filter((a) => a.status === "paused").length;
    const totalConversations = agents.reduce((sum, a) => sum + a.total_conversations, 0);
    const avgResponseTime = agents.length > 0 ? Math.round(agents.reduce((sum, a) => sum + a.avg_response_time_seconds, 0) / agents.length) : 0;
    const ratedAgents = agents.filter((a) => a.total_ratings > 0);
    const avgRating = ratedAgents.length > 0 ? ratedAgents.reduce((sum, a) => sum + a.avg_rating, 0) / ratedAgents.length : 0;
    const totalSlaBreaches = agents.reduce((sum, a) => sum + a.sla_breaches, 0);

    return { totalAgents, onlineAgents, pausedAgents, totalConversations, avgResponseTime, avgRating, totalSlaBreaches };
  }, [agentsQ.data]);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Premium Glass Header */}
      <div className="relative overflow-hidden rounded-3xl bg-indigo-600 dark:bg-indigo-900 shadow-2xl shadow-indigo-200 dark:shadow-none">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-400/20 rounded-full blur-2xl -ml-24 -mb-24"></div>

        <div className="relative z-10 px-8 py-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
              <div className="p-2 bg-white/20 backdrop-blur-md rounded-xl border border-white/30">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-4xl font-black text-white tracking-tight">Dashboard Admin</h1>
            </div>
            <p className="text-indigo-100 font-medium max-w-md">Controle total sobre a performance dos atendentes e métricas em tempo real.</p>
          </div>

          <div className="flex gap-3">
            <Link
              href="/"
              className="px-6 py-3 rounded-2xl bg-white text-indigo-600 hover:bg-indigo-50 font-bold transition-all shadow-lg hover:shadow-indigo-500/20 flex items-center gap-2 group"
            >
              <Home className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" />
              HUD de Atendimento
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          {/* Real-time Pulse Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="group rounded-3xl bg-white dark:bg-gray-800 p-6 shadow-sm hover:shadow-xl transition-all border border-gray-100 dark:border-gray-700 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <MessageSquare className="w-16 h-16 text-indigo-600" />
              </div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
                <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">Aguardando</span>
              </div>
              <div className="text-4xl font-black text-gray-900 dark:text-white mb-1">
                {realtimeMetricsQ.data?.aguardando ?? 0}
              </div>
              <div className="text-sm font-semibold text-gray-500 dark:text-gray-400">Conversas na fila</div>
            </div>

            <div className="group rounded-3xl bg-white dark:bg-gray-800 p-6 shadow-sm hover:shadow-xl transition-all border border-gray-100 dark:border-gray-700 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Users className="w-16 h-16 text-green-600" />
              </div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-[10px] font-bold text-green-500 uppercase tracking-widest">Online Agora</span>
              </div>
              <div className="text-4xl font-black text-gray-900 dark:text-white mb-1">
                {realtimeMetricsQ.data?.onlineAgents ?? 0}
              </div>
              <div className="text-sm font-semibold text-gray-500 dark:text-gray-400">Atendentes ativos</div>
            </div>

            <div className="group rounded-3xl bg-white dark:bg-gray-800 p-6 shadow-sm hover:shadow-xl transition-all border border-gray-100 dark:border-gray-700 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <TrendingUp className="w-16 h-16 text-purple-600" />
              </div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                <span className="text-[10px] font-bold text-purple-500 uppercase tracking-widest">Flow</span>
              </div>
              <div className="text-4xl font-black text-gray-900 dark:text-white mb-1">
                {realtimeMetricsQ.data?.messagesLastHour ?? 0}
              </div>
              <div className="text-sm font-semibold text-gray-500 dark:text-gray-400">Msgs última hora</div>
            </div>
          </div>

          {/* Performance Charts */}
          <div className="rounded-3xl bg-white dark:bg-gray-800 p-8 shadow-sm border border-gray-100 dark:border-gray-700">
            <h2 className="text-xl font-black text-gray-900 dark:text-white mb-6">Conversas por Atendente</h2>
            <div className="h-[300px] w-full min-h-[300px]">
              {agentsQ.data && agentsQ.data.items.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minHeight={300}>
                  <BarChart data={agentsQ.data.items.slice(0, 10).map((a) => ({ name: a.full_name.split(" ")[0], value: a.total_conversations }))}>
                    <defs>
                      <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={1} />
                        <stop offset="100%" stopColor="#818cf8" stopOpacity={1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#9ca3af" }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#9ca3af" }} />
                    <Tooltip
                      cursor={{ fill: "rgba(99, 102, 241, 0.05)" }}
                      contentStyle={{ borderRadius: "16px", border: "none", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)", backgroundColor: "#fff" }}
                    />
                    <Bar dataKey="value" fill="url(#barGradient)" radius={[8, 8, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                  <Activity className="w-12 h-12 mb-2 opacity-20" />
                  <span className="text-sm font-medium">Aguardando dados...</span>
                </div>
              )}
            </div>
          </div>

          {/* Active Sessions Grid */}
          <div className="space-y-4">
            <h2 className="text-xl font-black text-gray-900 dark:text-white px-2">Sessões Ativas</h2>
            {activeSessionsQ.isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2].map(i => <div key={i} className="h-32 rounded-3xl bg-gray-100 dark:bg-gray-800 animate-pulse"></div>)}
              </div>
            ) : (activeSessionsQ.data || []).length === 0 ? (
              <div className="rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-800 p-10 text-center">
                <Users className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-4 opacity-50" />
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Sem sessões no momento</h3>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(activeSessionsQ.data || []).map((session: any) => (
                  <div key={session.shift_id} className={`group relative rounded-3xl border-2 p-5 transition-all hover:scale-[1.02] ${session.is_paused ? "border-amber-100 bg-amber-50/50" : "border-green-100 bg-green-50/50"}`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black shadow-lg ${session.is_paused ? "bg-amber-500" : "bg-green-500"}`}>
                        {session.full_name[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-black text-gray-900 truncate">{session.full_name}</div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-gray-500">{session.is_paused ? "Pausado" : "Online"}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-bold text-gray-400">Tempo</div>
                        <div className="text-sm font-black">{session.worked_time}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-4 space-y-8">
          {/* Date Selector */}
          <div className="rounded-3xl bg-white dark:bg-gray-800 p-8 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black text-gray-900 dark:text-white">Data</h2>
              <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                <Calendar className="w-3.5 h-3.5" />
                <span>{timeZone}</span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setDateMode("today")}
                  className={`py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-colors ${dateMode === "today"
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                    : "bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                >
                  Hoje
                </button>
                <button
                  onClick={() => setDateMode("date")}
                  className={`py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-colors ${dateMode === "date"
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                    : "bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                >
                  Selecionar
                </button>
              </div>

              <div className="rounded-2xl bg-gray-50 dark:bg-gray-900 p-4 border border-transparent focus-within:border-indigo-500 transition-colors">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Data escolhida</label>
                <input
                  type="date"
                  value={dayRange.day}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setDateMode("date");
                  }}
                  className="mt-2 w-full bg-transparent text-sm font-black text-gray-900 dark:text-white outline-none cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* KPIs do Dia */}
          <div className="rounded-3xl bg-white dark:bg-gray-800 p-8 shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="text-lg font-black text-gray-900 dark:text-white mb-6">KPIs do dia</h3>
            {dayKpisQ.isLoading ? (
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-20 rounded-2xl bg-gray-100 dark:bg-gray-900 animate-pulse"></div>
                ))}
              </div>
            ) : !dayKpisQ.data ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">Sem dados para a data selecionada.</div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Atendimentos iniciados", value: dayKpisQ.data.started, color: "text-indigo-600" },
                    { label: "Atendimentos encerrados", value: dayKpisQ.data.closed, color: "text-green-600" },
                    { label: "Mensagens recebidas", value: dayKpisQ.data.inMessages, color: "text-blue-600" },
                    { label: "Mensagens enviadas", value: dayKpisQ.data.outMessages, color: "text-purple-600" },
                    { label: "Falhas de SLA", value: dayKpisQ.data.slaBreaches, color: "text-red-600" },
                    { label: "Resposta média", value: dayKpisQ.data.avgResponseSeconds !== null ? `${dayKpisQ.data.avgResponseSeconds}s` : "-", color: "text-amber-600" }
                  ].map((k) => (
                    <div key={k.label} className="rounded-2xl bg-gray-50 dark:bg-gray-900 p-4 border border-gray-100 dark:border-gray-800">
                      <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{k.label}</div>
                      <div className={`text-2xl font-black ${k.color} mt-2`}>{k.value}</div>
                    </div>
                  ))}
                </div>

                {dayKpisQ.data.topFunnelMoves.length > 0 && (
                  <div>
                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Movimentações no funil</div>
                    <div className="space-y-2">
                      {dayKpisQ.data.topFunnelMoves.map((m) => (
                        <div key={m.stage_id} className="flex items-center justify-between rounded-2xl bg-gray-50 dark:bg-gray-900 px-4 py-3 border border-gray-100 dark:border-gray-800">
                          <div className="text-xs font-black text-gray-900 dark:text-white truncate">{m.stage_name}</div>
                          <div className="text-xs font-black text-gray-500 dark:text-gray-300">{m.moved_in}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Stats Summary */}
          <div className="rounded-3xl bg-indigo-600 p-8 text-white shadow-xl">
            <h3 className="text-lg font-black mb-6">Resumo Global</h3>
            <div className="space-y-6">
              <div className="flex justify-between">
                <div>
                  <div className="text-[10px] font-black text-indigo-200 uppercase">Conversas</div>
                  <div className="text-3xl font-black">{metrics.totalConversations}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-black text-indigo-200 uppercase">Tempo Médio</div>
                  <div className="text-2xl font-black">{metrics.avgResponseTime}s</div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-black">
                    {metrics.avgRating > 0 ? metrics.avgRating.toFixed(1) : "-"}
                  </div>
                  <span className="text-xs font-bold">Avaliação Média</span>
                </div>
                {metrics.totalSlaBreaches > 0 && (
                  <div className="flex items-center gap-1.5 text-red-200">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-xs font-black">{metrics.totalSlaBreaches} Falhas</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Agents List Card */}
          <div className="rounded-3xl bg-white dark:bg-gray-800 p-8 shadow-sm border border-gray-100 dark:border-gray-700">
            <h2 className="text-xl font-black text-gray-900 dark:text-white mb-6">Equipe</h2>
            <div className="space-y-4">
              {(agentsQ.data?.items ?? []).slice(0, 5).map((agent) => (
                <Link key={agent.user_id} href={`/admin/agents/${agent.user_id}`} className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-gray-900 hover:bg-white transition-all border-2 border-transparent hover:border-indigo-100">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-xs ${agent.status === "online" ? "bg-green-500" : agent.status === "paused" ? "bg-amber-500" : "bg-gray-400"}`}>
                    {agent.full_name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-black truncate">{agent.full_name}</div>
                    <div className="text-[10px] text-gray-500 font-bold uppercase">{agent.total_conversations} conversas</div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-gray-300" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
