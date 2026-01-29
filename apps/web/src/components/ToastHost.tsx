"use client";

import { useCallback, useEffect, useState } from "react";
import { ToastContainer } from "@/app/ui/hud/Toast";
import type { Toast } from "@/app/ui/hud/Toast";
import { onToast } from "@/lib/toastBus";

export default function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const unsubscribe = onToast((payload) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { id, message: payload.message, type: payload.type, duration: payload.duration }]);
    });
    return unsubscribe;
  }, []);

  return <ToastContainer toasts={toasts} onClose={removeToast} />;
}

