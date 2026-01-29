"use client";

import { useMemo, useState } from "react";

type WikiItem = { title: string; description: string; href: string };

export function WikiPanel(opts: { isOpen: boolean; onClose: () => void }) {
  const { isOpen, onClose } = opts;
  const [q, setQ] = useState("");

  const items = useMemo<WikiItem[]>(
    () => [
      { title: "Tutorial do HUD", description: "Guia visual de uso do atendimento", href: "/tutorial" },
      { title: "Relatórios", description: "Métricas e análises do atendimento", href: "/reports" },
      { title: "Configurar SLA", description: "Definir tempos e alertas de resposta", href: "/settings/sla" },
      { title: "Templates", description: "Gerenciar templates e respostas rápidas", href: "/settings/templates" },
      { title: "Usuários", description: "Gerenciar acessos e permissões", href: "/settings/users" }
    ],
    []
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter((i) => (i.title + " " + i.description).toLowerCase().includes(term));
  }, [items, q]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl w-full max-w-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">Ajuda</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Links úteis para configurar e usar o sistema</div>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200"
          >
            Fechar
          </button>
        </div>

        <div className="p-5 space-y-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar ajuda..."
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent px-4 py-2 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
          />

          <div className="space-y-2">
            {filtered.map((item) => (
              <button
                key={item.href}
                onClick={() => {
                  window.location.href = item.href;
                }}
                className="w-full text-left p-4 rounded-xl border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="text-sm font-semibold text-gray-900 dark:text-white">{item.title}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{item.description}</div>
              </button>
            ))}

            {filtered.length === 0 && (
              <div className="text-sm text-gray-500 dark:text-gray-400 p-3">Nenhum resultado.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
