"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { apiDeleteSlaPolicy, apiListSlaPolicies, apiListStages, apiUpsertSlaPolicy } from "@/lib/api";
import { notify } from "@/lib/toastBus";

type StageRow = { id: string; name: string; sort_order: number };
type PolicyRow = {
  id: string;
  stage_id: string | null;
  contact_status: "lead" | "paciente" | "paciente_recorrente" | null;
  response_seconds: number;
  warning_threshold_percent: number;
  created_at: string;
};

export default function SettingsSlaPage() {
  const qc = useQueryClient();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [stageId, setStageId] = useState<string>("");
  const [contactStatus, setContactStatus] = useState<string>("");
  const [responseSeconds, setResponseSeconds] = useState<number>(900);
  const [warningPercent, setWarningPercent] = useState<number>(80);

  useEffect(() => {
    supabaseBrowser().auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token ?? null));
  }, []);

  const stagesQ = useQuery({
    queryKey: ["settings-sla-stages"],
    queryFn: () => apiListStages({ accessToken: accessToken! }),
    enabled: !!accessToken
  });

  const policiesQ = useQuery({
    queryKey: ["settings-sla-policies"],
    queryFn: () => apiListSlaPolicies({ accessToken: accessToken! }),
    enabled: !!accessToken
  });

  const stages = useMemo(() => (stagesQ.data?.items ?? []) as StageRow[], [stagesQ.data?.items]);
  const policies = useMemo(() => (policiesQ.data?.items ?? []) as PolicyRow[], [policiesQ.data?.items]);
  const stageNameById = useMemo(() => new Map(stages.map((s) => [s.id, s.name])), [stages]);

  function startCreate() {
    setEditId(null);
    setStageId("");
    setContactStatus("");
    setResponseSeconds(900);
    setWarningPercent(80);
  }

  function startEdit(p: PolicyRow) {
    setEditId(p.id);
    setStageId(p.stage_id ?? "");
    setContactStatus(p.contact_status ?? "");
    setResponseSeconds(p.response_seconds);
    setWarningPercent(p.warning_threshold_percent);
  }

  async function save() {
    if (!accessToken) return;
    if (!Number.isFinite(responseSeconds) || responseSeconds < 30) {
      notify("Tempo de resposta inválido.", "warning");
      return;
    }

    setBusy(true);
    try {
      await apiUpsertSlaPolicy({
        accessToken,
        id: editId ?? undefined,
        stage_id: stageId ? stageId : null,
        contact_status: contactStatus ? (contactStatus as any) : null,
        response_seconds: Number(responseSeconds),
        warning_threshold_percent: Number(warningPercent)
      });
      notify("Política de SLA salva.", "success");
      await qc.invalidateQueries({ queryKey: ["settings-sla-policies"] });
      startCreate();
    } catch (e: any) {
      notify(`Erro ao salvar SLA: ${e?.message || "falha"}`, "error", 8000);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!accessToken) return;
    const ok = confirm("Remover esta política de SLA?");
    if (!ok) return;

    setBusy(true);
    try {
      await apiDeleteSlaPolicy({ accessToken, id });
      notify("Política removida.", "success");
      await qc.invalidateQueries({ queryKey: ["settings-sla-policies"] });
      if (editId === id) startCreate();
    } catch (e: any) {
      notify(`Erro ao remover: ${e?.message || "falha"}`, "error", 8000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">SLA</h1>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Políticas de tempo de resposta por etapa do funil e tipo de contato.
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-gray-900 dark:text-white">Nova política</div>
          <button
            disabled={!accessToken || busy}
            onClick={startCreate}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            Limpar
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Etapa (opcional)</div>
            <select
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Qualquer etapa</option>
              {stages
                .slice()
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Status (opcional)</div>
            <select
              value={contactStatus}
              onChange={(e) => setContactStatus(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Qualquer</option>
              <option value="lead">Lead</option>
              <option value="paciente">Paciente</option>
              <option value="paciente_recorrente">Paciente recorrente</option>
            </select>
          </div>

          <div>
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Resposta (segundos)</div>
            <input
              type="number"
              min={30}
              value={String(responseSeconds)}
              onChange={(e) => setResponseSeconds(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Aviso (%)</div>
            <input
              type="number"
              min={1}
              max={99}
              value={String(warningPercent)}
              onChange={(e) => setWarningPercent(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex items-center justify-end">
          <button
            disabled={!accessToken || busy}
            onClick={save}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-900 dark:text-white">Políticas</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {policiesQ.isLoading ? "Carregando..." : `${policies.length} política(s)`}
          </div>
        </div>

        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {policies.map((p) => (
            <div key={p.id} className="p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {(p.stage_id ? stageNameById.get(p.stage_id) : "Qualquer etapa") ?? "Etapa removida"} •{" "}
                  {p.contact_status ?? "Qualquer"} • {p.response_seconds}s • aviso {p.warning_threshold_percent}%
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{p.id}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={busy}
                  onClick={() => startEdit(p)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
                >
                  Editar
                </button>
                <button
                  disabled={busy}
                  onClick={() => remove(p.id)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                >
                  Remover
                </button>
              </div>
            </div>
          ))}

          {!policiesQ.isLoading && policies.length === 0 && (
            <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Nenhuma política cadastrada.</div>
          )}
        </div>
      </div>
    </div>
  );
}

