"use client";

import { useEffect, useMemo, useRef } from "react";
import { CheckCircle, AlertTriangle, Info, XCircle, X } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

export type Toast = {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
};

function toastIcon(type: ToastType) {
  switch (type) {
    case "success":
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case "error":
      return <XCircle className="h-5 w-5 text-red-500" />;
    case "warning":
      return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    default:
      return <Info className="h-5 w-5 text-blue-500" />;
  }
}

function toastRing(type: ToastType) {
  switch (type) {
    case "success":
      return "border-green-200 dark:border-green-900/40";
    case "error":
      return "border-red-200 dark:border-red-900/40";
    case "warning":
      return "border-yellow-200 dark:border-yellow-900/40";
    default:
      return "border-blue-200 dark:border-blue-900/40";
  }
}

export function ToastContainer({
  toasts,
  onClose
}: {
  toasts: Toast[];
  onClose: (id: string) => void;
}) {
  const timersRef = useRef<Map<string, number>>(new Map());

  const ordered = useMemo(() => toasts.slice(-5), [toasts]);

  useEffect(() => {
    for (const t of ordered) {
      if (timersRef.current.has(t.id)) continue;
      const ms = t.duration ?? 4000;
      const timerId = window.setTimeout(() => {
        timersRef.current.delete(t.id);
        onClose(t.id);
      }, ms);
      timersRef.current.set(t.id, timerId);
    }

    return () => {
      for (const [id, timer] of timersRef.current) {
        if (!ordered.some((t) => t.id === id)) {
          window.clearTimeout(timer);
          timersRef.current.delete(id);
        }
      }
    };
  }, [ordered, onClose]);

  if (!ordered.length) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2">
      {ordered.map((t) => (
        <div
          key={t.id}
          className={[
            "flex items-start gap-3 rounded-lg border bg-white/95 p-3 shadow-lg backdrop-blur-sm dark:bg-gray-900/90",
            toastRing(t.type)
          ].join(" ")}
        >
          <div className="mt-0.5">{toastIcon(t.type)}</div>
          <div className="flex-1 text-sm text-gray-900 dark:text-gray-100">{t.message}</div>
          <button
            type="button"
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            onClick={() => onClose(t.id)}
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

