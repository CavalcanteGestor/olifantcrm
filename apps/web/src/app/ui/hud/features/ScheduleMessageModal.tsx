"use client";

import { useEffect, useMemo, useState } from "react";
import { apiScheduleText } from "@/lib/api";
import { notify } from "@/lib/toastBus";

function toDatetimeLocalValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

export function ScheduleMessageModal(opts: {
  isOpen: boolean;
  onClose: () => void;
  accessToken: string;
  conversationId: string;
  onScheduled?: () => void | Promise<void>;
}) {
  const { isOpen, onClose, accessToken, conversationId, onScheduled } = opts;
  const [text, setText] = useState("");
  const [runAtLocal, setRunAtLocal] = useState("");
  const [saving, setSaving] = useState(false);

  const defaultRunAtLocal = useMemo(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 5);
    d.setSeconds(0, 0);
    return toDatetimeLocalValue(d);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setText("");
    setRunAtLocal(defaultRunAtLocal);
  }, [isOpen, defaultRunAtLocal]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-200 dark:border-gray-800">
          <div className="text-lg font-semibold text-gray-900 dark:text-white">Agendar Mensagem</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            A mensagem será enviada automaticamente no horário escolhido (se ainda estiver na janela de 24h).
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Quando</div>
            <input
              type="datetime-local"
              value={runAtLocal}
              onChange={(e) => setRunAtLocal(e.target.value)}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent px-4 py-2 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mensagem</div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent px-4 py-3 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              placeholder="Digite a mensagem que será enviada..."
            />
          </div>
        </div>

        <div className="p-5 border-t border-gray-200 dark:border-gray-800 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200"
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            onClick={async () => {
              const trimmed = text.trim();
              if (!trimmed) {
                notify("Digite uma mensagem para agendar.", "warning");
                return;
              }
              if (!runAtLocal) {
                notify("Escolha um horário para agendar.", "warning");
                return;
              }
              const runAt = new Date(runAtLocal);
              if (Number.isNaN(runAt.getTime())) {
                notify("Horário inválido.", "error");
                return;
              }
              setSaving(true);
              try {
                await apiScheduleText({ accessToken, conversationId, text: trimmed, runAt: runAt.toISOString() });
                notify("Mensagem agendada com sucesso.", "success");
                await onScheduled?.();
                onClose();
              } catch (e: any) {
                notify(String(e?.message || "Falha ao agendar."), "error");
              } finally {
                setSaving(false);
              }
            }}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={saving}
          >
            Agendar
          </button>
        </div>
      </div>
    </div>
  );
}
