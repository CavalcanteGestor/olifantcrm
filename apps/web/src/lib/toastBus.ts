export type ToastBusType = "success" | "error" | "warning" | "info";

export type ToastBusPayload = {
  message: string;
  type: ToastBusType;
  duration?: number;
};

const EVENT_NAME = "olifant:toast";

export function notify(message: string, type: ToastBusType = "info", duration?: number) {
  if (typeof window === "undefined") return;
  const detail: ToastBusPayload = { message, type, duration };
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
}

export function onToast(handler: (payload: ToastBusPayload) => void) {
  if (typeof window === "undefined") return () => {};
  const listener = (evt: Event) => {
    const ce = evt as CustomEvent<ToastBusPayload>;
    if (!ce.detail) return;
    handler(ce.detail);
  };
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}

