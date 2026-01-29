"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { apiAdminAgents, apiDeleteAgent } from "@/lib/api";
import { exportToCSV } from "@/lib/export";
import Link from "next/link";
import { Users, Activity, Clock, MessageSquare, TrendingUp, AlertTriangle, ArrowUpRight } from "lucide-react";

function iso(d: Date) {
  return d.toISOString();
}

export default function AdminAgentsPage() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline" | "paused">("all");
  const [showDeleteModal, setShowDeleteModal] = useState<{ userId: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const agentsQ = useQuery({
    queryKey: ["admin-agents", iso(range.from), iso(range.to)],
    queryFn: () => apiAdminAgents({ accessToken: accessToken!, from: iso(range.from), to: iso(range.to) }),
    enabled: !!accessToken
  });

  const filteredAgents = useMemo(() => {
    let agents = agentsQ.data?.items ?? [];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      agents = agents.filter((a) => a.full_name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") {
      agents = agents.filter((a) => a.status === statusFilter);
    }
    return agents;
  }, [agentsQ.data, searchQuery, statusFilter]);

  const metrics = useMemo(() => {
    const agents = agentsQ.data?.items ?? [];
    return {
      total: agents.length,
      online: agents.filter((a) => a.status === "online").length,
      paused: agents.filter((a) => a.status === "paused").length,
      offline: agents.filter((a) => a.status === "offline").length,
      totalConversations: agents.reduce((sum, a) => sum + a.total_conversations, 0),
      avgResponseTime:
        agents.length > 0
          ? Math.round(agents.reduce((sum, a) => sum + a.avg_response_time_seconds, 0) / agents.length)
          : 0,
      avgRating:
        agents.filter((a) => a.total_ratings > 0).length > 0
          ? agents
            .filter((a) => a.total_ratings > 0)
            .reduce((sum, a) => sum + a.avg_rating, 0) / agents.filter((a) => a.total_ratings > 0).length
          : 0
    };
  }, [agentsQ.data]);

  async function handleDelete() {
    if (!showDeleteModal || !accessToken) return;
    setDeleting(true);
    try {
      await apiDeleteAgent({ accessToken, userId: showDeleteModal.userId });
      setShowDeleteModal(null);
      await agentsQ.refetch();
    } catch (err: any) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Premium Header */}
      <div className="relative overflow-hidden rounded-3xl bg-indigo-600 dark:bg-indigo-900 shadow-2xl shadow-indigo-200 dark:shadow-none p-8 text-white">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-white/20 backdrop-blur-md rounded-xl border border-white/30">
                <Users className="w-6 h-6" />
              </div>
              <h1 className="text-3xl font-black tracking-tight">Equipe de Atendimento</h1>
            </div>
            <p className="text-indigo-100 font-medium">Gerencie seus atendentes e acompanhe a performance individual.</p>
          </div>
          <Link
            href="/settings/users"
            className="px-6 py-3 rounded-2xl bg-white text-indigo-600 hover:bg-indigo-50 font-bold transition-all shadow-lg hover:shadow-indigo-500/20 flex items-center gap-2"
          >
            <span>+ Novo Atendente</span>
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: "Ativos", value: metrics.online, icon: Activity, color: "text-green-500", bg: "bg-green-50 dark:bg-green-950/20" },
          { label: "Pausados", value: metrics.paused, icon: Clock, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950/20" },
          { label: "Conversas", value: metrics.totalConversations, icon: MessageSquare, color: "text-indigo-500", bg: "bg-indigo-50 dark:bg-indigo-950/20" },
          { label: "Nota Média", value: metrics.avgRating > 0 ? metrics.avgRating.toFixed(1) : "-", icon: TrendingUp, color: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-950/20" },
        ].map((m, i) => (
          <div key={i} className="rounded-3xl bg-white dark:bg-gray-800 p-6 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{m.label}</span>
              <m.icon className={`w-4 h-4 ${m.color}`} />
            </div>
            <div className="text-3xl font-black text-gray-900 dark:text-white">{m.value}</div>
          </div>
        ))}
      </div>

      {/* Filters & Tools */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative group">
          <input
            type="text"
            placeholder="Buscar por nome ou email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-2xl bg-white dark:bg-gray-800 border-2 border-transparent focus:border-indigo-500 py-4 px-12 text-sm font-bold text-gray-900 dark:text-white shadow-sm transition-all focus:shadow-indigo-500/10 outline-none"
          />
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-500 transition-colors">
            <Users className="w-5 h-5" />
          </div>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="rounded-2xl bg-white dark:bg-gray-800 border-2 border-transparent focus:border-indigo-500 py-4 px-6 text-sm font-bold text-gray-900 dark:text-white shadow-sm outline-none cursor-pointer"
        >
          <option value="all">Todos os Status</option>
          <option value="online">Online</option>
          <option value="paused">Pausado</option>
          <option value="offline">Offline</option>
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="datetime-local"
            value={range.from.toISOString().slice(0, 16)}
            onChange={(e) => setRange((r) => ({ ...r, from: new Date(e.target.value) }))}
            className="rounded-2xl bg-white dark:bg-gray-800 border-2 border-transparent py-4 px-4 text-[10px] font-black text-gray-500 dark:text-gray-400 shadow-sm outline-none cursor-pointer"
          />
          <input
            type="datetime-local"
            value={range.to.toISOString().slice(0, 16)}
            onChange={(e) => setRange((r) => ({ ...r, to: new Date(e.target.value) }))}
            className="rounded-2xl bg-white dark:bg-gray-800 border-2 border-transparent py-4 px-4 text-[10px] font-black text-gray-500 dark:text-gray-400 shadow-sm outline-none cursor-pointer"
          />
        </div>
      </div>

      {/* Agent List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {agentsQ.isLoading ? (
          Array(6).fill(0).map((_, i) => <div key={i} className="h-64 rounded-3xl bg-gray-100 dark:bg-gray-800 animate-pulse"></div>)
        ) : filteredAgents.length === 0 ? (
          <div className="col-span-full py-20 text-center bg-white dark:bg-gray-800 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-700">
            <Users className="w-16 h-16 text-gray-200 dark:text-gray-700 mx-auto mb-4" />
            <h3 className="text-lg font-black text-gray-900 dark:text-white">Nenhum atendente encontrado</h3>
            <p className="text-sm text-gray-500">Tente ajustar seus filtros ou busca.</p>
          </div>
        ) : filteredAgents.map((agent) => (
          <div key={agent.user_id} className="group rounded-3xl bg-white dark:bg-gray-800 p-6 shadow-sm hover:shadow-xl border border-gray-100 dark:border-gray-700 transition-all">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-lg shadow-lg ${agent.status === "online" ? "bg-green-500" : agent.status === "paused" ? "bg-amber-500" : "bg-gray-400"
                  }`}>
                  {agent.full_name[0].toUpperCase()}
                </div>
                <div>
                  <h3 className="font-black text-gray-900 dark:text-white truncate max-w-[120px]">{agent.full_name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <div className={`w-2 h-2 rounded-full ${agent.status === "online" ? "bg-green-500 animate-pulse" : agent.status === "paused" ? "bg-amber-500" : "bg-gray-400"
                      }`}></div>
                    <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">{agent.status}</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Nota</div>
                <div className="text-lg font-black text-amber-500">{agent.avg_rating > 0 ? agent.avg_rating.toFixed(1) : "-"}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-2xl">
                <div className="text-[9px] font-black text-gray-400 uppercase">Conversas</div>
                <div className="text-lg font-black text-gray-900 dark:text-white">{agent.total_conversations}</div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-2xl">
                <div className="text-[9px] font-black text-gray-400 uppercase">Resposta</div>
                <div className="text-lg font-black text-gray-900 dark:text-white">{agent.avg_response_time_seconds}s</div>
              </div>
            </div>

            <div className="flex gap-2">
              <Link
                href={`/admin/agents/${agent.user_id}`}
                className="flex-1 py-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-black text-center hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
              >
                DETALHES
              </Link>
              <button
                onClick={() => setShowDeleteModal({ userId: agent.user_id, name: agent.full_name })}
                className="p-3 rounded-xl bg-red-50 dark:bg-red-950/20 text-red-500 hover:bg-red-100 transition-colors"
              >
                <div className="w-4 h-4 text-sm font-bold">×</div>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Delete Modal - Modernized */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setShowDeleteModal(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in duration-300" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center mb-6 mx-auto">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-black text-center text-gray-900 dark:text-white mb-2">Remover Atendente?</h2>
            <p className="text-center text-gray-500 font-medium mb-8">
              Tem certeza que deseja remover <span className="text-gray-900 dark:text-white font-bold">{showDeleteModal.name}</span>? Esta ação não poderá ser desfeita.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setShowDeleteModal(null)}
                className="flex-1 py-4 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-4 rounded-2xl bg-red-600 text-white font-bold hover:bg-red-700 disabled:opacity-50 transition-all shadow-lg shadow-red-500/20"
              >
                {deleting ? "Removendo..." : "Sim, Remover"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
