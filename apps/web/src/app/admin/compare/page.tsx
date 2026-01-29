"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueries } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { apiAdminAgents, apiAdminAgentMetrics } from "@/lib/api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, Clock, Activity, MessageSquare } from "lucide-react";

function iso(d: Date) {
  return d.toISOString();
}

export default function CompareAgentsPage() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [maxAgents] = useState(4);

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

  const metricsQueries = useQueries({
    queries: selectedAgents.map((userId) => ({
      queryKey: ["admin-agent-metrics", userId, iso(range.from), iso(range.to)],
      queryFn: () => apiAdminAgentMetrics({ accessToken: accessToken!, userId, from: iso(range.from), to: iso(range.to) }),
      enabled: !!accessToken && selectedAgents.includes(userId)
    }))
  });

  const comparisonData = useMemo(() => {
    const agents = agentsQ.data?.items || [];
    return agents.map((agent) => ({
      name: agent.full_name,
      userId: agent.user_id,
      conversations: agent.total_conversations,
      avgResponseTime: agent.avg_response_time_seconds,
      avgRating: agent.avg_rating,
      slaBreaches: agent.sla_breaches,
      minutesWorked: agent.total_minutes_worked
    }));
  }, [agentsQ.data]);

  const chartData = useMemo(() => {
    return selectedAgents
      .map((userId, idx) => {
        const metrics = metricsQueries[idx]?.data;
        const agent = agentsQ.data?.items.find((a) => a.user_id === userId);
        if (!metrics || !agent) return null;
        return {
          name: agent.full_name,
          conversations: metrics.conversations.total,
          avgResponseTime: metrics.conversations.avg_response_time_seconds,
          avgRating: metrics.ratings.avg,
          slaBreaches: metrics.conversations.sla_breaches,
          minutesWorked: metrics.shifts.reduce((sum: number, s: any) => sum + s.minutes_worked, 0)
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [selectedAgents, metricsQueries, agentsQ.data]);

  function toggleAgent(userId: string) {
    setSelectedAgents((prev) => {
      if (prev.includes(userId)) return prev.filter((id) => id !== userId);
      if (prev.length >= maxAgents) return prev;
      return [...prev, userId];
    });
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Premium Header */}
      <div className="relative overflow-hidden rounded-3xl bg-indigo-600 dark:bg-indigo-900 shadow-2xl shadow-indigo-200 dark:shadow-none p-8 text-white">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-white/20 backdrop-blur-md rounded-xl border border-white/30">
              <TrendingUp className="w-6 h-6" />
            </div>
            <h1 className="text-3xl font-black tracking-tight">Comparativo de Equipe</h1>
          </div>
          <p className="text-indigo-100 font-medium">Análise detalhada e comparativa entre até {maxAgents} atendentes.</p>
        </div>
      </div>

      {/* Select Agents Panel */}
      <div className="rounded-3xl bg-white dark:bg-gray-800 p-8 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8">
          <div>
            <h2 className="text-xl font-black text-gray-900 dark:text-white">Selecionar para Comparar</h2>
            <p className="text-sm text-gray-500 font-medium">Escolha os atendentes para visualizar os gráficos.</p>
          </div>
          <div className="flex gap-2 p-1 bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 h-fit">
            <div className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl shadow-sm text-xs font-black text-indigo-600 flex items-center gap-2">
              <Clock className="w-3 h-3" />
              {selectedAgents.length} Selecionados
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {comparisonData.map((agent) => {
            const isSelected = selectedAgents.includes(agent.userId);
            return (
              <button
                key={agent.userId}
                onClick={() => toggleAgent(agent.userId)}
                className={`group px-4 py-3 rounded-2xl text-xs font-black transition-all border-2 text-center truncate ${isSelected
                  ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                  : "bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 text-gray-500 hover:border-indigo-100 dark:hover:border-indigo-900/50"
                  }`}
              >
                {agent.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading state */}
      {selectedAgents.length > 0 && metricsQueries.some(q => q.isLoading) && (
        <div className="col-span-full py-20 text-center">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm font-bold text-gray-500">Calculando métricas comparativas...</p>
        </div>
      )}

      {/* Comparison results */}
      {selectedAgents.length > 0 && chartData.length > 0 && !metricsQueries.some(q => q.isLoading) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Conversas Chart */}
          <div className="rounded-3xl bg-white dark:bg-gray-800 p-8 shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="text-lg font-black text-gray-900 dark:text-white mb-6">Volume de Conversas</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%" minHeight={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#9ca3af" }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#9ca3af" }} />
                  <Tooltip
                    cursor={{ fill: "rgba(99, 102, 241, 0.05)" }}
                    contentStyle={{ borderRadius: "16px", border: "none", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)", backgroundColor: "#fff" }}
                  />
                  <Bar dataKey="conversations" fill="#6366f1" radius={[8, 8, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Response Time Chart */}
          <div className="rounded-3xl bg-white dark:bg-gray-800 p-8 shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="text-lg font-black text-gray-900 dark:text-white mb-6">Tempo de Resposta (s)</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%" minHeight={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#9ca3af" }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#9ca3af" }} />
                  <Tooltip
                    cursor={{ fill: "rgba(99, 102, 241, 0.05)" }}
                    contentStyle={{ borderRadius: "16px", border: "none", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)", backgroundColor: "#fff" }}
                  />
                  <Bar dataKey="avgResponseTime" fill="#8b5cf6" radius={[8, 8, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Table Summary */}
          <div className="col-span-full rounded-3xl bg-white dark:bg-gray-800 p-8 shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="text-xl font-black text-gray-900 dark:text-white mb-8">Tabela Comparativa</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-left">
                    <th className="pb-6 pl-2">Atendente</th>
                    <th className="pb-6 text-center">Conversas</th>
                    <th className="pb-6 text-center">Resposta</th>
                    <th className="pb-6 text-center">Nota</th>
                    <th className="pb-6 text-right pr-2">Falhas SLA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                  {chartData.map((agent, idx) => (
                    <tr key={idx} className="group hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                      <td className="py-5 pl-2">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-xs font-black">
                            {agent.name[0]}
                          </div>
                          <span className="text-sm font-black text-gray-900 dark:text-white">{agent.name}</span>
                        </div>
                      </td>
                      <td className="py-5 text-center text-sm font-bold text-gray-600 dark:text-gray-400">{agent.conversations}</td>
                      <td className="py-5 text-center text-sm font-bold text-gray-600 dark:text-gray-400">{agent.avgResponseTime}s</td>
                      <td className="py-5 text-center">
                        <span className="px-3 py-1 bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 rounded-full text-xs font-black">
                          {agent.avgRating > 0 ? agent.avgRating.toFixed(1) : "-"} ⭐
                        </span>
                      </td>
                      <td className="py-5 text-right pr-2 font-black text-red-500">{agent.slaBreaches}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
