"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { apiDeleteStage, apiListStages, apiUpsertStage } from "@/lib/api";
import { notify } from "@/lib/toastBus";

type StageRow = { id: string; name: string; sort_order: number };

export default function SettingsFunnelPage() {
  const qc = useQueryClient();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState<number>(0);

  useEffect(() => {
    supabaseBrowser().auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token ?? null));
  }, []);

  const stagesQ = useQuery({
    queryKey: ["settings-funnel-stages"],
    queryFn: () => apiListStages({ accessToken: accessToken! }),
    enabled: !!accessToken
  });

  const stages = useMemo(() => (stagesQ.data?.items ?? []) as StageRow[], [stagesQ.data?.items]);

  function startCreate() {
    setEditId(null);
    setName("");
    setSortOrder(stages.length > 0 ? Math.max(...stages.map((s) => s.sort_order)) + 1 : 0);
  }

  function startEdit(stage: StageRow) {
    setEditId(stage.id);
    setName(stage.name);
    setSortOrder(stage.sort_order);
  }

  async function save() {
    if (!accessToken) return;
    if (!name.trim()) {
      notify("Informe o nome do estágio.", "warning");
      return;
    }

    setBusy(true);
    try {
      await apiUpsertStage({
        accessToken,
        id: editId ?? undefined,
        name: name.trim(),
        sort_order: Number(sortOrder)
      });
      notify("Estágio salvo.", "success");
      await qc.invalidateQueries({ queryKey: ["settings-funnel-stages"] });
      setEditId(null);
      setName("");
    } catch (e: any) {
      notify(`Erro ao salvar: ${e?.message || "falha"}`, "error", 8000);
    } finally {
      setBusy(false);
    }
  }

  async function remove(stageId: string) {
    if (!accessToken) return;
    const ok = confirm("Remover este estágio? Conversas podem ficar sem etapa.");
    if (!ok) return;

    setBusy(true);
    try {
      await apiDeleteStage({ accessToken, id: stageId });
      notify("Estágio removido.", "success");
      await qc.invalidateQueries({ queryKey: ["settings-funnel-stages"] });
    } catch (e: any) {
      notify(`Erro ao remover: ${e?.message || "falha"}`, "error", 8000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Funil</h1>
        <div className="text-sm text-gray-500 dark:text-gray-400">Gerencie as etapas do funil (Kanban e movimentações).</div>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-gray-900 dark:text-white">Etapas</div>
          <button
            disabled={!accessToken || busy}
            onClick={startCreate}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            Novo estágio
          </button>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nome</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Ex: Primeiro contato"
            />
          </div>
          <div>
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Ordem</div>
            <input
              value={String(sortOrder)}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              type="number"
              min={0}
            />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            disabled={busy}
            onClick={() => {
              setEditId(null);
              setName("");
            }}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            Limpar
          </button>
          <button
            disabled={busy || !accessToken}
            onClick={save}
            className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            Salvar
          </button>
        </div>

        <div className="mt-4 border-t border-gray-200 dark:border-gray-800 pt-4">
          {stagesQ.isLoading ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">Carregando...</div>
          ) : (
            <div className="space-y-2">
              {stages
                .slice()
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((s) => (
                  <div
                    key={s.id}
                    className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${
                      editId === s.id
                        ? "border-indigo-300 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-900/20"
                        : "border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {s.sort_order}. {s.name}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{s.id}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        disabled={busy}
                        onClick={() => startEdit(s)}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
                      >
                        Editar
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => remove(s.id)}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                ))}

              {stages.length === 0 && (
                <div className="text-sm text-gray-500 dark:text-gray-400">Nenhuma etapa cadastrada.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

