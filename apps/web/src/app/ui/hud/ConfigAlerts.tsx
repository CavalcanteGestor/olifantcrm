"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, AlertCircle, X } from "lucide-react";
import { apiGetConfigStatus } from "@/lib/api";

type AlertItem = { level: "error" | "warning"; title: string; detail?: string; href?: string; actionLabel?: string };

export default function ConfigAlerts({ accessToken }: { accessToken: string }) {
  const [dismissed, setDismissed] = useState(false);

  const q = useQuery({
    queryKey: ["config-status"],
    queryFn: () => apiGetConfigStatus({ accessToken }),
    enabled: !!accessToken,
    refetchInterval: 30000
  });

  const alerts = useMemo<AlertItem[]>(() => {
    const s = q.data;
    if (!s) return [];
    const items: AlertItem[] = [];

    if (!s.env.loaded_env_path && !s.env.dotenv_config_path_env) {
      items.push({
        level: "warning",
        title: "Arquivo de variáveis da API não carregado",
        detail: `A API está rodando sem carregar .env/.env.local/env.local (cwd: ${s.env.cwd}).`
      });
    }

    if (!s.api.webhook_configured) {
      const missing = (s.api.missing_env ?? []).filter((k) => k.includes("META_APP_SECRET") || k.includes("VERIFY"));
      items.push({
        level: "warning",
        title: "Webhook do WhatsApp não configurado na API",
        detail: missing.length ? `Faltando: ${missing.join(", ")}.` : "Mensagens recebidas podem não entrar no sistema."
      });
    }

    if (!s.api.whatsapp_access_token_present) {
      const missing = (s.api.missing_env ?? []).filter((k) => k.includes("WHATSAPP_ACCESS_TOKEN"));
      items.push({
        level: "warning",
        title: "Token WhatsApp ausente na API",
        detail: missing.length
          ? `Faltando: ${missing.join(", ")}. Para enviar mensagens, o token precisa estar no worker; na API ele é usado para sincronizar templates manualmente.`
          : "Para enviar mensagens, o token precisa estar no worker; na API ele é usado para sincronizar templates manualmente."
      });
    }

    if (!s.tenant.whatsapp_account_configured) {
      const missing = [
        !s.tenant.whatsapp_phone_number_id_present ? "phone_number_id" : null,
        !s.tenant.whatsapp_waba_id_present ? "waba_id" : null
      ]
        .filter(Boolean)
        .join(", ");
      items.push({
        level: "error",
        title: "Conta WhatsApp do tenant não configurada",
        detail: missing ? `Campos faltando em whatsapp_accounts: ${missing}.` : "Cadastre whatsapp_accounts para este tenant."
      });
    }

    if (s.whatsapp.templates_approved === 0) {
      items.push({
        level: "warning",
        title: "Nenhum template WhatsApp aprovado encontrado",
        detail: "Fora da janela de 24h você só consegue responder via template.",
        href: "/settings/templates",
        actionLabel: "Abrir Templates"
      });
    }

    if (s.queues.queued_jobs_overdue > 0) {
      items.push({
        level: "warning",
        title: "Existem envios pendentes na fila",
        detail: `${s.queues.queued_jobs_overdue} job(s) aguardando há mais de 2 minutos. Verifique se o worker está rodando.`
      });
    }

    if (s.queues.webhook_events_overdue_global > 0) {
      items.push({
        level: "warning",
        title: "Eventos do webhook sem processamento",
        detail: `${s.queues.webhook_events_overdue_global} evento(s) aguardando há mais de 2 minutos. Verifique se o worker inbound está rodando.`
      });
    }

    return items;
  }, [q.data]);

  const level: "error" | "warning" | null = useMemo(() => {
    if (alerts.some((a) => a.level === "error")) return "error";
    if (alerts.length > 0) return "warning";
    return null;
  }, [alerts]);

  if (dismissed) return null;
  if (q.isLoading) return null;
  if (q.isError) return null;
  if (!level) return null;

  const isError = level === "error";

  return (
    <div
      className={`m-2 rounded-xl border p-3 ${
        isError
          ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-100"
          : "border-yellow-200 bg-yellow-50 text-yellow-900 dark:border-yellow-900/40 dark:bg-yellow-900/20 dark:text-yellow-100"
      }`}
    >
      <div className="flex items-start gap-2">
        {isError ? <AlertTriangle className="w-4 h-4 mt-0.5" /> : <AlertCircle className="w-4 h-4 mt-0.5" />}
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold">{isError ? "Atenção: configuração crítica" : "Avisos de configuração"}</div>
          <div className="mt-2 space-y-2">
            {alerts.slice(0, 3).map((a) => (
              <div key={a.title} className="text-xs">
                <div className="font-semibold">{a.title}</div>
                {a.detail && <div className="opacity-90">{a.detail}</div>}
                {a.href && (
                  <button
                    className="mt-1 underline underline-offset-2"
                    onClick={() => {
                      window.location.href = a.href!;
                    }}
                  >
                    {a.actionLabel ?? "Abrir"}
                  </button>
                )}
              </div>
            ))}
          </div>
          {alerts.length > 3 && <div className="text-[11px] mt-2 opacity-80">+{alerts.length - 3} aviso(s)</div>}
        </div>
        <button
          className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
          onClick={() => setDismissed(true)}
          aria-label="Fechar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
