"use client";

import { useState, useEffect } from "react";

export default function KeyboardShortcutsHelp() {
  const [showHelp, setShowHelp] = useState(false);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "?") {
        e.preventDefault();
        setShowHelp(true);
      }
      if (e.key === "Escape" && showHelp) {
        setShowHelp(false);
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showHelp]);
  
  if (!showHelp) return null;
  
  const shortcuts = [
    { keys: "Ctrl+K / Cmd+K", description: "Buscar conversas" },
    { keys: "Ctrl+H / Cmd+H", description: "Voltar para HUD" },
    { keys: "Ctrl+Shift+?", description: "Mostrar esta ajuda" },
    { keys: "Esc", description: "Fechar modais/busca" },
    { keys: "Ctrl+Enter", description: "Enviar mensagem" },
  ];
  
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowHelp(false)}>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Atalhos de Teclado</h2>
        <div className="space-y-2">
          {shortcuts.map((s, i) => (
            <div key={i} className="flex justify-between items-center py-2 border-b border-gray-200 dark:border-gray-800">
              <span className="text-sm text-gray-600 dark:text-gray-400">{s.description}</span>
              <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono text-gray-900 dark:text-white">{s.keys}</kbd>
            </div>
          ))}
        </div>
        <button
          onClick={() => setShowHelp(false)}
          className="mt-4 w-full px-4 py-2 rounded-lg bg-[#d97757] text-white font-semibold hover:bg-[#b85a3f] transition-colors"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
