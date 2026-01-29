"use client";

import { useEffect, useRef, useState } from "react";

type SlaTimer = {
  due_at: string;
  paused_at: string | null;
  started_at: string;
};

type SlaControlsProps = {
  accessToken: string;
  conversationId: string;
  timer: SlaTimer | null;
  onUpdate: () => void;
};

export default function SlaControls({ accessToken, conversationId, timer, onUpdate }: SlaControlsProps) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const lastBeepTimeRef = useRef<number>(0);

  useEffect(() => {
    // Ignorar se estiver pausado - não mostrar nada quando pausado
    if (!timer?.due_at || timer.paused_at) {
      setRemaining(null);
      return;
    }

    const interval = setInterval(() => {
      const due = new Date(timer.due_at).getTime();
      const now = Date.now();
      const diff = due - now;
      setRemaining(Math.max(0, Math.floor(diff / 1000)));

      // Alerta sonoro quando < 10s (tocar beep a cada segundo)
      if (diff > 0 && diff < 10000) {
        const now = Date.now();
        if (now - lastBeepTimeRef.current > 1000) {
          lastBeepTimeRef.current = now;
          try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);
            oscillator.frequency.value = 800;
            oscillator.type = "sine";
            gainNode.gain.value = 0.1;
            oscillator.start();
            oscillator.stop(ctx.currentTime + 0.1);
          } catch (err) {
            // Ignorar erros de áudio
          }
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [timer]);

  function formatTime(seconds: number): string {
    if (seconds <= 0) return "0s";
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m < 60) return `${m}m ${s}s`;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}h ${mm}m`;
  }

  if (!timer || timer.paused_at) return null;

  const isWarning = remaining !== null && remaining > 0 && remaining <= 20;
  const isCritical = remaining !== null && remaining <= 0;

  return (
    <div className="flex items-center gap-2">
      {remaining !== null && (
        <span
          className={`text-xs font-semibold px-2 py-1 rounded ${
            isCritical
              ? "bg-red-500 text-white animate-pulse"
              : isWarning
                ? "bg-yellow-400 text-gray-900 dark:text-gray-950"
                : "bg-indigo-600 text-white"
          }`}
        >
          {remaining <= 0 ? "Prazo vencido" : formatTime(remaining)}
        </span>
      )}
    </div>
  );
}

