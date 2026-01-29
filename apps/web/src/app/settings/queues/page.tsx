"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { apiGetQueueSettings, apiUpdateQueueSettings } from "@/lib/api";
import { notify } from "@/lib/toastBus";

export default function QueueSettingsPage() {
  const qc = useQueryClient();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Form State
  const [noResponseMinutes, setNoResponseMinutes] = useState(5);
  const [followUpMinutes, setFollowUpMinutes] = useState(120);

  useEffect(() => {
    supabaseBrowser().auth.getSession().then(({ data }) => {
      setAccessToken(data.session?.access_token ?? null);
    });
  }, []);

  const settingsQ = useQuery({
    queryKey: ["queue-settings"],
    queryFn: () => apiGetQueueSettings({ accessToken: accessToken! }),
    enabled: !!accessToken
  });

  useEffect(() => {
    if (settingsQ.data) {
      setNoResponseMinutes(settingsQ.data.no_response_alert_minutes);
      setFollowUpMinutes(settingsQ.data.follow_up_alert_minutes);
    }
  }, [settingsQ.data]);

  async function onSave() {
    if (!accessToken) return;
    setBusy(true);
    try {
      await apiUpdateQueueSettings({
        accessToken,
        data: {
          no_response_alert_minutes: noResponseMinutes,
          follow_up_alert_minutes: followUpMinutes
        }
      });
      notify("Configurações salvas!", "success");
      await qc.invalidateQueries({ queryKey: ["queue-settings"] });
    } catch (e: any) {
      notify(`Erro ao salvar: ${e?.message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Filas & Alertas</h1>
          <div className="text-sm text-gray-500 dark:text-gray-400">Configure os tempos de alerta e follow-up automático.</div>
        </div>
        <button
          onClick={onSave}
          disabled={busy || !accessToken}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Salvando..." : "Salvar Alterações"}
        </button>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-8">
        {/* Section 1: Agent Alert */}
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Alerta de Atendente (SLA Interno)</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Tempo máximo que uma conversa pode ficar sem resposta do <strong>atendente</strong> antes de gerar um alerta.
            </p>
          </div>
          
          <div className="flex items-center gap-4">
             <div className="w-32">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Minutos</label>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={noResponseMinutes}
                  onChange={(e) => setNoResponseMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
             </div>
             <div className="text-sm text-gray-500 mt-5">
               minutos sem resposta do atendente.
             </div>
          </div>
        </div>

        <div className="border-t border-gray-100 dark:border-gray-800" />

        {/* Section 2: Client Follow-up */}
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Follow-up de Cliente (Aguardando Resposta)</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Tempo máximo que um cliente pode ficar sem responder antes de ser marcado como <strong>Follow-up Necessário</strong>.
            </p>
          </div>
          
          <div className="flex items-center gap-4">
             <div className="w-32">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Minutos</label>
                <input
                  type="number"
                  min={1}
                  max={10080}
                  value={followUpMinutes}
                  onChange={(e) => setFollowUpMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
             </div>
             <div className="text-sm text-gray-500 mt-5">
               minutos ({Math.floor(followUpMinutes/60)}h {followUpMinutes%60}m) sem resposta do cliente.
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
