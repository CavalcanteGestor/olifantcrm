"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { apiCreateCannedResponse, apiDeleteCannedResponse, apiGetCannedResponses, apiListTemplates, apiSyncTemplates } from "@/lib/api";
import { notify } from "@/lib/toastBus";

type CannedRow = { id: string; title: string; shortcut: string; body_template: string };

export default function SettingsTemplatesPage() {
  const qc = useQueryClient();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [shortcut, setShortcut] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    supabaseBrowser().auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token ?? null));
  }, []);

  const cannedQ = useQuery({
    queryKey: ["settings-canned"],
    queryFn: () => apiGetCannedResponses({ accessToken: accessToken! }),
    enabled: !!accessToken
  });

  const templatesQ = useQuery({
    queryKey: ["settings-wa-templates"],
    queryFn: () => apiListTemplates({ accessToken: accessToken! }),
    enabled: !!accessToken
  });

  const canned = useMemo(() => (cannedQ.data?.items ?? []) as CannedRow[], [cannedQ.data?.items]);

  async function createCanned() {
    if (!accessToken) return;
    if (!title.trim() || !shortcut.trim() || !body.trim()) {
      notify("Preencha título, atalho e texto.", "warning");
      return;
    }

    setBusy(true);
    try {
      await apiCreateCannedResponse({
        accessToken,
        title: title.trim(),
        shortcut: shortcut.trim(),
        body_template: body.trim()
      });
      notify("Resposta rápida criada.", "success");
      setTitle("");
      setShortcut("");
      setBody("");
      await qc.invalidateQueries({ queryKey: ["settings-canned"] });
    } catch (e: any) {
      notify(`Erro ao criar: ${e?.message || "falha"}`, "error", 8000);
    } finally {
      setBusy(false);
    }
  }

  async function deleteCanned(id: string) {
    if (!accessToken) return;
    const ok = confirm("Remover esta resposta rápida?");
    if (!ok) return;

    setBusy(true);
    try {
      await apiDeleteCannedResponse({ accessToken, id });
      notify("Removido.", "success");
      await qc.invalidateQueries({ queryKey: ["settings-canned"] });
    } catch (e: any) {
      notify(`Erro ao remover: ${e?.message || "falha"}`, "error", 8000);
    } finally {
      setBusy(false);
    }
  }

  async function syncTemplates() {
    if (!accessToken) return;
    setBusy(true);
    try {
      const res = await apiSyncTemplates({ accessToken });
      notify(`Templates sincronizados: ${res.synced}/${res.total}`, "success");
      await qc.invalidateQueries({ queryKey: ["settings-wa-templates"] });
    } catch (e: any) {
      notify(`Erro ao sincronizar: ${e?.message || "falha"}`, "error", 8000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Templates</h1>
        <div className="text-sm text-gray-500 dark:text-gray-400">Respostas rápidas e templates do WhatsApp.</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-900 dark:text-white">Respostas rápidas</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {cannedQ.isLoading ? "Carregando..." : `${canned.length} item(ns)`}
            </div>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-1 gap-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título"
                className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input
                value={shortcut}
                onChange={(e) => setShortcut(e.target.value)}
                placeholder="Atalho (ex: /oi)"
                className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Texto da resposta"
                rows={4}
                className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex justify-end">
              <button
                disabled={busy || !accessToken}
                onClick={createCanned}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                Criar
              </button>
            </div>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {canned.map((c) => (
              <div key={c.id} className="p-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {c.shortcut} • {c.title}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 whitespace-pre-wrap">
                    {c.body_template}
                  </div>
                </div>
                <button
                  disabled={busy}
                  onClick={() => deleteCanned(c.id)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                >
                  Remover
                </button>
              </div>
            ))}
            {!cannedQ.isLoading && canned.length === 0 && (
              <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Nenhuma resposta rápida cadastrada.</div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-900 dark:text-white">Templates WhatsApp</div>
            <button
              disabled={busy || !accessToken}
              onClick={syncTemplates}
              className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-black disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
            >
              Sincronizar
            </button>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {(templatesQ.data?.items ?? []).map((t) => (
              <div key={t.id} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {t.name} ({t.language})
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {t.category ?? "—"} • {t.approved_status ?? "—"}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{t.last_synced_at ? "OK" : "—"}</div>
                </div>
              </div>
            ))}
            {!templatesQ.isLoading && (templatesQ.data?.items?.length ?? 0) === 0 && (
              <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Nenhum template encontrado.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

