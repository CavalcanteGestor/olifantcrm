"use client";

import { useState } from "react";

export function WhisperInput(opts: { onSend: (text: string) => void; disabled?: boolean }) {
  const { onSend, disabled } = opts;
  const [value, setValue] = useState("");

  return (
    <div className="p-2 bg-yellow-50 dark:bg-yellow-900/20 border-t border-yellow-200 dark:border-yellow-900">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Sussurrar para o atendente..."
        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-900 border border-yellow-200 dark:border-yellow-900 text-sm outline-none focus:ring-2 focus:ring-yellow-400"
        disabled={!!disabled}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setValue("");
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            const text = value.trim();
            if (!text || disabled) return;
            onSend(text);
            setValue("");
          }
        }}
      />
    </div>
  );
}
