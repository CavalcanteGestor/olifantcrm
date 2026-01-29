"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiBaseUrl } from "@/lib/api";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { exportToCSV, exportToPDF } from "@/lib/export";

function iso(d: Date) {
  return d.toISOString();
}

async function authedFetch<T>(path: string, accessToken: string) {
  const res = await fetch(`${apiBaseUrl()}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `http_${res.status}`);
  return json as T;
}

export default function ReportsPage() {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const [range, setRange] = useState(() => {
    const to = new Date();
    const from = new Date(Date.now() - 7 * 86400 * 1000);
    return { from, to };
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabaseBrowser().auth.getSession();
      if (!alive) return;
      if (!data.session) router.replace("/login");
      else setAccessToken(data.session.access_token);
    })();
    return () => {
      alive = false;
    };
  }, [router]);

  const qs = useMemo(() => `?from=${encodeURIComponent(iso(range.from))}&to=${encodeURIComponent(iso(range.to))}`, [range]);

  const agentsQ = useQuery({
    queryKey: ["reports", "agents", qs],
    queryFn: () => authedFetch<{ items: any[] }>(`/api/reports/agents${qs}`, accessToken!),
    enabled: !!accessToken
  });

  const funnelQ = useQuery({
    queryKey: ["reports", "funnel", qs],
    queryFn: () => authedFetch<{ items: any[] }>(`/api/reports/funnel${qs}`, accessToken!),
    enabled: !!accessToken
  });

  const msgQ = useQuery({
    queryKey: ["reports", "messages", qs],
    queryFn: () => authedFetch<{ items: any[] }>(`/api/reports/messages-daily${qs}`, accessToken!),
    enabled: !!accessToken
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Relatórios</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Análise de desempenho e métricas</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              if (!agentsQ.data || !funnelQ.data || !msgQ.data) return;
              const exportData = [
                ...(agentsQ.data.items || []).map((r) => ({
                  tipo: "atendente",
                  id: r.user_id,
                  mensagens_saida: r.out_messages,
                  mensagens_entrada: r.in_messages,
                  violacoes_sla: r.sla_breaches,
                  tempo_medio_resposta_segundos: r.avg_response_seconds || 0
                })),
                ...(funnelQ.data.items || []).map((r) => ({
                  tipo: "funil",
                  etapa: r.stage_name,
                  entradas: r.moved_in
                })),
                ...(msgQ.data.items || []).map((r) => ({
                  tipo: "mensagens_diarias",
                  dia: r.day,
                  entrada: r.inbound,
                  saida: r.outbound
                }))
              ];
              await exportToCSV(exportData, "relatorios");
            }}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors shadow-sm hover:shadow-md"
          >
            📥 Exportar CSV
          </button>
        </div>
      </div>

      {/* Filtros de período */}
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <label className="text-xs text-gray-600 dark:text-gray-400">
          De
          <input
            className="mt-1 w-full rounded-lg bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
            type="datetime-local"
            value={range.from.toISOString().slice(0, 16)}
            onChange={(e) => setRange((r) => ({ ...r, from: new Date(e.target.value) }))}
          />
        </label>
        <label className="text-xs text-gray-600 dark:text-gray-400">
          Até
          <input
            className="mt-1 w-full rounded-lg bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
            type="datetime-local"
            value={range.to.toISOString().slice(0, 16)}
            onChange={(e) => setRange((r) => ({ ...r, to: new Date(e.target.value) }))}
          />
        </label>
      </div>

      {/* Tabelas de Relatórios */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm">
          <div className="text-sm font-semibold mb-1 text-gray-900 dark:text-white">Por Atendente</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">Mensagens e SLA (breaches/respostas)</div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
                <tr>
                  <th className="text-left py-2">ID Usuário</th>
                  <th className="text-right">Saída</th>
                  <th className="text-right">Entrada</th>
                  <th className="text-right">Breaches</th>
                  <th className="text-right">Média (s)</th>
                </tr>
              </thead>
              <tbody>
                {(agentsQ.data?.items ?? []).map((r) => (
                  <tr key={r.user_id} className="border-b border-gray-100 dark:border-gray-800/50">
                    <td className="py-2 text-xs text-gray-700 dark:text-gray-300 font-mono">{r.user_id.slice(0, 8)}...</td>
                    <td className="text-right text-gray-900 dark:text-white">{r.out_messages}</td>
                    <td className="text-right text-gray-900 dark:text-white">{r.in_messages}</td>
                    <td className="text-right text-gray-900 dark:text-white">{r.sla_breaches}</td>
                    <td className="text-right text-gray-900 dark:text-white">{r.avg_response_seconds ? Number(r.avg_response_seconds).toFixed(1) : "-"}</td>
                  </tr>
                ))}
                {agentsQ.isLoading ? (
                  <tr>
                    <td className="py-4 text-gray-500 dark:text-gray-400 text-center" colSpan={5}>
                      Carregando…
                    </td>
                  </tr>
                ) : agentsQ.data?.items.length === 0 ? (
                  <tr>
                    <td className="py-4 text-gray-500 dark:text-gray-400 text-center" colSpan={5}>
                      Nenhum dado encontrado
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm">
          <div className="text-sm font-semibold mb-1 text-gray-900 dark:text-white">Funil</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">Movimentações por etapa</div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
                <tr>
                  <th className="text-left py-2">Etapa</th>
                  <th className="text-right">Entradas</th>
                </tr>
              </thead>
              <tbody>
                {(funnelQ.data?.items ?? []).map((r) => (
                  <tr key={r.stage_id} className="border-b border-gray-100 dark:border-gray-800/50">
                    <td className="py-2 text-gray-900 dark:text-white">{r.stage_name}</td>
                    <td className="text-right text-gray-900 dark:text-white font-semibold">{r.moved_in}</td>
                  </tr>
                ))}
                {funnelQ.isLoading ? (
                  <tr>
                    <td className="py-4 text-gray-500 dark:text-gray-400 text-center" colSpan={2}>
                      Carregando…
                    </td>
                  </tr>
                ) : funnelQ.data?.items.length === 0 ? (
                  <tr>
                    <td className="py-4 text-gray-500 dark:text-gray-400 text-center" colSpan={2}>
                      Nenhum dado encontrado
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm lg:col-span-2">
          <div className="text-sm font-semibold mb-1 text-gray-900 dark:text-white">Volume de Mensagens (Diário)</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">Inbound vs Outbound</div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
                <tr>
                  <th className="text-left py-2">Data</th>
                  <th className="text-right">Entrada</th>
                  <th className="text-right">Saída</th>
                </tr>
              </thead>
              <tbody>
                {(msgQ.data?.items ?? []).map((r) => (
                  <tr key={r.day} className="border-b border-gray-100 dark:border-gray-800/50">
                    <td className="py-2 text-gray-900 dark:text-white">{r.day}</td>
                    <td className="text-right text-gray-900 dark:text-white">{r.inbound}</td>
                    <td className="text-right text-gray-900 dark:text-white">{r.outbound}</td>
                  </tr>
                ))}
                {msgQ.isLoading ? (
                  <tr>
                    <td className="py-4 text-gray-500 dark:text-gray-400 text-center" colSpan={3}>
                      Carregando…
                    </td>
                  </tr>
                ) : msgQ.data?.items.length === 0 ? (
                  <tr>
                    <td className="py-4 text-gray-500 dark:text-gray-400 text-center" colSpan={3}>
                      Nenhum dado encontrado
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}


