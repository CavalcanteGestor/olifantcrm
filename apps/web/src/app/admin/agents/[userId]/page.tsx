"use client";

import { useEffect, useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { apiAdminAgentMetrics, apiAdminAgentConversations, apiGetAgentGoals, apiSetAgentGoal, apiGetAgentBadges, apiGetAgentNotes, apiCreateAgentNote } from "@/lib/api";
import { exportToCSV, exportToPDF } from "@/lib/export";
import Link from "next/link";
import {
  ChevronLeft, ChevronRight, Download, FileText, LayoutDashboard,
  Clock, MessageSquare, TrendingUp, Star, Target, Award,
  FileEdit, AlertTriangle, Calendar, User, Activity
} from "lucide-react";

function iso(d: Date) {
  return d.toISOString();
}

function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function AdminAgentDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.userId as string;
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "shifts" | "conversations" | "metrics" | "ratings" | "goals" | "badges" | "notes">("overview");
  const [conversationsPage, setConversationsPage] = useState(1);

  const [range, setRange] = useState(() => {
    const to = new Date();
    const from = new Date(Date.now() - 30 * 86400 * 1000);
    return { from, to };
  });

  useEffect(() => {
    (async () => {
      const { data } = await supabaseBrowser().auth.getSession();
      if (!data.session) router.replace("/login");
      else setAccessToken(data.session.access_token);
    })();
  }, [router]);

  const metricsQ = useQuery({
    queryKey: ["admin-agent-metrics", userId, iso(range.from), iso(range.to)],
    queryFn: () => apiAdminAgentMetrics({ accessToken: accessToken!, userId, from: iso(range.from), to: iso(range.to) }),
    enabled: !!accessToken && !!userId
  });

  const conversationsQ = useQuery({
    queryKey: ["admin-agent-conversations", userId, iso(range.from), iso(range.to), conversationsPage],
    queryFn: () =>
      apiAdminAgentConversations({
        accessToken: accessToken!,
        userId,
        from: iso(range.from),
        to: iso(range.to),
        page: conversationsPage,
        limit: 50
      }),
    enabled: !!accessToken && !!userId
  });

  const currentMonth = new Date().toISOString().slice(0, 7);
  const goalsQ = useQuery({
    queryKey: ["agent-goals", userId, currentMonth],
    queryFn: () => apiGetAgentGoals({ accessToken: accessToken!, userId, monthYear: currentMonth }),
    enabled: !!accessToken && !!userId
  });

  const badgesQ = useQuery({
    queryKey: ["agent-badges", userId],
    queryFn: () => apiGetAgentBadges({ accessToken: accessToken!, userId }),
    enabled: !!accessToken && !!userId
  });

  const notesQ = useQuery({
    queryKey: ["agent-notes", userId],
    queryFn: () => apiGetAgentNotes({ accessToken: accessToken!, userId }),
    enabled: !!accessToken && !!userId
  });

  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [goalForm, setGoalForm] = useState({
    goal_conversations: "",
    goal_avg_rating: "",
    goal_avg_response_seconds: "",
    goal_sla_compliance_percent: ""
  });
  const [savingGoal, setSavingGoal] = useState(false);

  const metrics = metricsQ.data;

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Premium Header */}
      <div className="relative overflow-hidden rounded-3xl bg-indigo-600 dark:bg-indigo-900 shadow-2xl shadow-indigo-200 dark:shadow-none p-8 text-white">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-3xl font-black border border-white/30 shadow-xl">
              {metrics?.full_name?.[0].toUpperCase() || "?"}
            </div>
            <div>
              <Link href="/admin/agents" className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-indigo-200 hover:text-white transition-colors mb-2">
                <ChevronLeft className="w-3 h-3" /> Voltar para lista
              </Link>
              <h1 className="text-3xl font-black tracking-tight">{metrics?.full_name || "Carregando..."}</h1>
              <div className="flex items-center gap-3 mt-2">
                <div className="px-3 py-1 bg-green-500/20 backdrop-blur-md rounded-full text-[10px] font-black uppercase tracking-wide border border-green-500/30">
                  Agente Ativo
                </div>
                <div className="text-indigo-100 text-xs font-medium">Desde {new Date().toLocaleDateString("pt-BR")}</div>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-3">
            <div className="flex gap-2 p-1 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20">
              <input
                type="date"
                value={range.from.toISOString().split("T")[0]}
                onChange={(e) => setRange((r) => ({ ...r, from: new Date(e.target.value) }))}
                className="bg-transparent text-xs font-black px-3 py-1 outline-none cursor-pointer"
              />
              <span className="text-indigo-300">/</span>
              <input
                type="date"
                value={range.to.toISOString().split("T")[0]}
                onChange={(e) => setRange((r) => ({ ...r, to: new Date(e.target.value) }))}
                className="bg-transparent text-xs font-black px-3 py-1 outline-none cursor-pointer"
              />
            </div>
            {metrics && (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const conversations = conversationsQ.data?.items || [];
                    if (conversations.length === 0) { alert("Carregue as conversas primeiro"); return; }
                    exportToCSV(conversations.map((c) => ({
                      Data_Início: c.started_at,
                      Data_Fim: c.ended_at || "",
                      Contato: c.contact_name || c.contact_phone || "",
                      Telefone: c.contact_phone || "",
                      Duração_Minutos: c.duration_minutes,
                      Mensagens: c.messages_count,
                      Avaliação: c.rating ? `${c.rating} ⭐` : "",
                      Status: c.status_fila,
                      Etapa: c.stage_name || ""
                    })), `relatorio-${metrics.full_name}-${new Date().toISOString().split("T")[0]}`);
                  }}
                  className="px-4 py-2 rounded-xl bg-white text-indigo-600 text-xs font-black hover:bg-indigo-50 transition-all flex items-center gap-2 shadow-lg"
                >
                  <Download className="w-3 h-3" /> CSV
                </button>
                <button
                  onClick={async () => {
                    if (!metrics) return;
                    const contentData = [
                      { label: "Nome", value: metrics.full_name },
                      { label: "Período", value: `${range.from.toLocaleDateString("pt-BR")} - ${range.to.toLocaleDateString("pt-BR")}` },
                      { label: "Turnos", value: metrics.shifts.length.toString() },
                      { label: "Tempo Total Trabalhado", value: formatMinutes(metrics.shifts.reduce((sum, s) => sum + s.minutes_worked, 0)) },
                      { label: "Tempo Total Pausado", value: formatMinutes(metrics.shifts.reduce((sum, s) => sum + s.minutes_paused, 0)) },
                      { label: "Conversas Atendidas", value: metrics.conversations.total.toString() },
                      { label: "Tempo Médio de Resposta", value: `${metrics.conversations.avg_response_time_seconds}s` },
                      { label: "SLA Breaches", value: metrics.conversations.sla_breaches.toString() },
                      { label: "Nota Média", value: metrics.ratings.avg.toFixed(1) },
                      { label: "Total de Avaliações", value: metrics.ratings.count.toString() }
                    ];
                    const contentHtml = `
                      <table style="width:100%; border-collapse:collapse;">
                        <thead><tr style="background:#f8fafc;"><th style="padding:12px;text-align:left;">Métrica</th><th style="padding:12px;text-align:left;">Valor</th></tr></thead>
                        <tbody>${contentData.map(item => `<tr><td style="padding:12px;border-bottom:1px solid #e2e8f0;"><strong>${item.label}</strong></td><td style="padding:12px;border-bottom:1px solid #e2e8f0;">${item.value}</td></tr>`).join("")}</tbody>
                      </table>
                    `;
                    await exportToPDF(`Relatório - ${metrics.full_name}`, contentHtml);
                  }}
                  className="px-4 py-2 rounded-xl bg-white/10 text-white text-xs font-black hover:bg-white/20 transition-all flex items-center gap-2 border border-white/20 backdrop-blur-md shadow-lg"
                >
                  <FileText className="w-3 h-3" /> PDF
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs Layout */}
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left Column: Navigation */}
        <div className="lg:w-64 space-y-2">
          {[
            { id: "overview", label: "Visão Geral", icon: LayoutDashboard },
            { id: "shifts", label: "Turnos", icon: Clock },
            { id: "conversations", label: "Conversas", icon: MessageSquare },
            { id: "metrics", label: "Métricas", icon: TrendingUp },
            { id: "ratings", label: "Avaliações", icon: Star },
            { id: "goals", label: "Metas", icon: Target },
            { id: "badges", label: "Conquistas", icon: Award },
            { id: "notes", label: "Notas", icon: FileEdit }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`w-full px-6 py-4 rounded-2xl text-sm font-black flex items-center gap-4 transition-all ${activeTab === tab.id
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                : "bg-white dark:bg-gray-800 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-white"
                }`}
            >
              <tab.icon className="w-5 h-5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right Column: Content */}
        <div className="flex-1 space-y-8 animate-in slide-in-from-right-4 duration-500">
          {metricsQ.isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-center bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700">
              <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-gray-500 font-bold">Carregando detalhes do agente...</p>
            </div>
          ) : !metrics ? (
            <div className="py-20 text-center bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700">
              <AlertTriangle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
              <h2 className="text-xl font-black text-gray-900 dark:text-white">Atendente não encontrado</h2>
            </div>
          ) : (
            <>
              {/* Tab: Visão Geral */}
              {activeTab === "overview" && (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {[
                      { label: "Turnos", value: metrics.shifts.length, icon: Calendar, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-900/20" },
                      { label: "Atendimentos", value: metrics.conversations.total, icon: MessageSquare, color: "text-indigo-500", bg: "bg-indigo-50 dark:bg-indigo-900/20" },
                      { label: "Tempo de Resposta", value: `${metrics.conversations.avg_response_time_seconds}s`, icon: Clock, color: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-900/20" },
                      { label: "Nota Média", value: metrics.ratings.avg.toFixed(1), icon: Star, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-900/20" },
                    ].map((m, i) => (
                      <div key={i} className="rounded-3xl bg-white dark:bg-gray-800 p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{m.label}</span>
                          <div className={`p-2 rounded-xl ${m.bg} ${m.color}`}>
                            <m.icon className="w-4 h-4" />
                          </div>
                        </div>
                        <div className="text-3xl font-black text-gray-900 dark:text-white">{m.value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-3xl bg-white dark:bg-gray-800 p-8 shadow-sm border border-gray-100 dark:border-gray-700">
                    <h3 className="text-lg font-black text-gray-900 dark:text-white mb-6">Resumo da Performance</h3>
                    <div className="space-y-4">
                      {[
                        { label: "Tempo total trabalhado", value: formatMinutes(metrics.shifts.reduce((sum, s) => sum + s.minutes_worked, 0)), color: "text-green-500" },
                        { label: "Tempo total pausado", value: formatMinutes(metrics.shifts.reduce((sum, s) => sum + s.minutes_paused, 0)), color: "text-amber-500" },
                        { label: "Falhas de SLA", value: metrics.conversations.sla_breaches, color: "text-red-500" },
                      ].map((item, i) => (
                        <div key={i} className="flex items-center justify-between py-4 border-b border-gray-50 dark:border-gray-700 last:border-0">
                          <span className="text-sm font-bold text-gray-500">{item.label}</span>
                          <span className={`text-sm font-black ${item.color}`}>{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: Turnos */}
              {activeTab === "shifts" && (
                <div className="space-y-4">
                  {metrics.shifts.length === 0 ? (
                    <div className="py-20 text-center bg-gray-50 dark:bg-gray-900/50 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                      <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 font-bold">Nenhum turno registrado no período.</p>
                    </div>
                  ) : (
                    metrics.shifts.map((shift, idx) => (
                      <div key={idx} className="rounded-3xl bg-white dark:bg-gray-800 p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600">
                              <Calendar className="w-6 h-6" />
                            </div>
                            <div>
                              <div className="text-lg font-black text-gray-900 dark:text-white">{shift.date}</div>
                              <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">
                                {formatDate(shift.started_at)} → {shift.ended_at ? formatDate(shift.ended_at) : "EM CURSO"}
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-8 text-center">
                            <div>
                              <div className="text-[9px] font-black text-gray-400 uppercase mb-1">TRABALHADO</div>
                              <div className="text-lg font-black text-indigo-600">{formatMinutes(shift.minutes_worked)}</div>
                            </div>
                            <div>
                              <div className="text-[9px] font-black text-gray-400 uppercase mb-1">PAUSADO</div>
                              <div className="text-lg font-black text-amber-500">{formatMinutes(shift.minutes_paused)}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Tab: Conversas */}
              {activeTab === "conversations" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between px-2">
                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      {conversationsQ.data?.total || 0} TOTAL DE CONVERSAS
                    </div>
                  </div>
                  <div className="space-y-3">
                    {conversationsQ.data?.items.map((conv) => (
                      <div key={conv.id} className="group rounded-3xl bg-white dark:bg-gray-800 p-6 shadow-sm hover:shadow-xl border border-gray-100 dark:border-gray-700 transition-all">
                        <div className="flex flex-col md:flex-row justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-gray-50 dark:bg-gray-900/50 flex items-center justify-center text-gray-400">
                              <User className="w-6 h-6" />
                            </div>
                            <div>
                              <div className="text-sm font-black text-gray-900 dark:text-white">{conv.contact_name || conv.contact_phone || "Sem nome"}</div>
                              <div className="text-[10px] font-black text-gray-400 uppercase mt-1">{formatDate(conv.started_at)}</div>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-4">
                            <div className="text-center">
                              <div className="text-[8px] font-black text-gray-400">MSG</div>
                              <div className="text-xs font-black">{conv.messages_count}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-[8px] font-black text-gray-400">DURAÇÃO</div>
                              <div className="text-xs font-black">{formatMinutes(conv.duration_minutes)}</div>
                            </div>
                            {conv.rating && (
                              <div className="px-2 py-1 bg-amber-50 dark:bg-amber-950/20 text-amber-500 rounded-lg text-[10px] font-black">
                                {conv.rating} ⭐
                              </div>
                            )}
                            <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wide ${conv.status_fila === "finalizado" ? "bg-green-50 dark:bg-green-950/20 text-green-600" :
                              conv.status_fila === "em_atendimento" ? "bg-blue-50 dark:bg-blue-950/20 text-blue-600" :
                                "bg-gray-100 dark:bg-gray-900 text-gray-500"
                              }`}>
                              {conv.status_fila}
                            </div>
                            <button
                              onClick={() => {
                                if (conv.status_fila === 'em_atendimento') {
                                  const event = new CustomEvent("openConversation", { detail: { conversationId: conv.id } });
                                  window.dispatchEvent(event);
                                  router.push("/hud");
                                } else {
                                  router.push(`/history?conversationId=${conv.id}`);
                                }
                              }}
                              className="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                            >
                              {conv.status_fila === 'em_atendimento' ? 'Ir para conversa' : 'Ver histórico'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Pagination modernized */}
                  {conversationsQ.data && conversationsQ.data.total > conversationsQ.data.items.length && (
                    <div className="flex items-center justify-center gap-6 pt-4">
                      <button
                        onClick={() => setConversationsPage((p) => Math.max(1, p - 1))}
                        disabled={conversationsPage === 1}
                        className="p-3 rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 disabled:opacity-30"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <div className="text-xs font-black text-gray-500">
                        {conversationsPage} / {Math.ceil((conversationsQ.data.total || 0) / 50)}
                      </div>
                      <button
                        onClick={() => setConversationsPage((p) => p + 1)}
                        disabled={conversationsPage >= Math.ceil((conversationsQ.data?.total || 0) / 50)}
                        className="p-3 rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 disabled:opacity-30"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Metas modernized */}
              {activeTab === "goals" && (
                <div className="space-y-8">
                  <div className="rounded-3xl bg-white dark:bg-gray-800 p-8 shadow-sm border border-gray-100 dark:border-gray-700">
                    <h3 className="text-xl font-black text-gray-900 dark:text-white mb-8">Definir Metas Mensais</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                      {[
                        { key: "goal_conversations", label: "Conversas Mensais", icon: MessageSquare },
                        { key: "goal_avg_rating", label: "Nota Média Alvo", icon: Star },
                        { key: "goal_avg_response_seconds", label: "Tempo Resposta Alvo (s)", icon: Clock },
                        { key: "goal_sla_compliance_percent", label: "Conformidade SLA (%)", icon: Activity },
                      ].map((field) => (
                        <div key={field.key} className="space-y-2">
                          <label className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                            <field.icon className="w-3 h-3" /> {field.label}
                          </label>
                          <input
                            type="number"
                            step={field.key.includes("rating") ? "0.1" : "1"}
                            className="w-full rounded-2xl bg-gray-50 dark:bg-gray-900 border-2 border-transparent focus:border-indigo-500 py-3 px-4 font-bold outline-none transition-all"
                            value={(goalForm as any)[field.key] || (goalsQ.data?.goal as any)?.[field.key] || ""}
                            onChange={(e) => setGoalForm((f) => ({ ...f, [field.key]: e.target.value }))}
                          />
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={async () => {
                        setSavingGoal(true);
                        try {
                          await apiSetAgentGoal({
                            accessToken: accessToken!,
                            userId,
                            monthYear: new Date().toISOString().slice(0, 7),
                            goal_conversations: goalForm.goal_conversations ? parseInt(goalForm.goal_conversations) : undefined,
                            goal_avg_rating: goalForm.goal_avg_rating ? parseFloat(goalForm.goal_avg_rating) : undefined,
                            goal_avg_response_seconds: goalForm.goal_avg_response_seconds ? parseInt(goalForm.goal_avg_response_seconds) : undefined,
                            goal_sla_compliance_percent: goalForm.goal_sla_compliance_percent ? parseFloat(goalForm.goal_sla_compliance_percent) : undefined
                          });
                          await goalsQ.refetch();
                          alert("Meta salva com sucesso!");
                        } catch (err: any) { alert("Erro: " + err.message); } finally { setSavingGoal(false); }
                      }}
                      disabled={savingGoal}
                      className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-black hover:bg-indigo-700 disabled:opacity-50 shadow-lg shadow-indigo-500/20 transition-all"
                    >
                      {savingGoal ? "ATUALIZANDO..." : "SALVAR METAS DO AGENTE"}
                    </button>
                  </div>
                </div>
              )}

              {/* Tab: Badges modernized */}
              {activeTab === "badges" && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  {badgesQ.data?.badges.length === 0 ? (
                    <div className="col-span-full py-20 text-center bg-gray-50 dark:bg-gray-900/50 rounded-3xl border-2 border-dashed border-gray-200">
                      <Award className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 font-bold">Nenhuma conquista registrada.</p>
                    </div>
                  ) : (
                    badgesQ.data?.badges.map((badge) => (
                      <div key={badge.id} className="rounded-3xl bg-white dark:bg-gray-800 p-8 shadow-sm border border-gray-100 dark:border-gray-700 text-center group hover:shadow-xl transition-all">
                        <div className="text-6xl mb-4 group-hover:scale-110 transition-transform duration-300">
                          {badge.badge_key === "super_atendente" ? "🚀" :
                            badge.badge_key === "rapido" ? "⚡" :
                              badge.badge_key === "favorito" ? "⭐" :
                                badge.badge_key === "consistente" ? "🔥" : "🏆"}
                        </div>
                        <div className="text-sm font-black text-gray-900 dark:text-white mb-2">{badge.badge_name}</div>
                        <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                          Em {new Date(badge.earned_at).toLocaleDateString("pt-BR")}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Tab: Notas modernized */}
              {activeTab === "notes" && (
                <div className="space-y-8">
                  <div className="rounded-3xl bg-white dark:bg-gray-800 p-8 shadow-sm border border-gray-100 dark:border-gray-700">
                    <h3 className="text-xl font-black text-gray-900 dark:text-white mb-6">Nova Nota Interna</h3>
                    <textarea
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Informações relevantes sobre a conduta ou performance deste agente..."
                      rows={4}
                      className="w-full rounded-3xl bg-gray-50 dark:bg-gray-900 border-2 border-transparent focus:border-indigo-500 py-6 px-6 font-bold outline-none transition-all resize-none mb-4"
                    />
                    <button
                      onClick={async () => {
                        if (!newNote.trim()) return;
                        setSavingNote(true);
                        try {
                          await apiCreateAgentNote({ accessToken: accessToken!, userId, note_text: newNote });
                          setNewNote("");
                          await notesQ.refetch();
                        } catch (err: any) { alert("Erro: " + err.message); } finally { setSavingNote(false); }
                      }}
                      disabled={savingNote || !newNote.trim()}
                      className="px-8 py-4 rounded-2xl bg-indigo-600 text-white font-black hover:bg-indigo-700 disabled:opacity-50 shadow-lg shadow-indigo-500/20 transition-all"
                    >
                      {savingNote ? "SALVANDO..." : "ADICIONAR NOTA"}
                    </button>
                  </div>
                  <div className="space-y-4">
                    {notesQ.data?.notes.map((note) => (
                      <div key={note.id} className="rounded-3xl bg-white dark:bg-gray-800 p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                        <div className="text-sm font-bold text-gray-700 dark:text-gray-300 leading-relaxed mb-4">{note.note_text}</div>
                        <div className="flex items-center gap-2 border-t border-gray-50 dark:border-gray-700 pt-4">
                          <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-black">
                            {note.profiles?.full_name?.[0] || "A"}
                          </div>
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                            Por {note.profiles?.full_name || "Admin"} • {new Date(note.created_at).toLocaleString("pt-BR")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

}

