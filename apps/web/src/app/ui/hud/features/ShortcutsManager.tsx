"use client";

import QuickMessages from "@/app/ui/hud/QuickMessages";

export function ShortcutsManager(opts: { isOpen: boolean; onClose: () => void; onSelect: (text: string) => void }) {
  const { isOpen, onClose, onSelect } = opts;
  if (!isOpen) return null;
  return <QuickMessages onSelect={onSelect} onClose={onClose} />;
}
