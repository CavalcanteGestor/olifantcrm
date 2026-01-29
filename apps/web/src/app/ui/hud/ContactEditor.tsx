"use client";

import { useEffect, useState } from "react";
import { apiUpdateContact } from "@/lib/api";
import TagsInput from "./TagsInput";

type Contact = {
  id: string;
  display_name: string | null;
  status: string;
  tags: string[];
  internal_notes: string | null;
};

type ContactEditorProps = {
  accessToken: string;
  contact: Contact | null;
  onUpdate: () => void;
};

export default function ContactEditor({ accessToken, contact, onUpdate }: ContactEditorProps) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"lead" | "paciente" | "paciente_recorrente">("lead");
  const [tags, setTags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (contact) {
      setName(contact.display_name ?? "");
      setStatus(contact.status as "lead" | "paciente" | "paciente_recorrente");
      setTags(contact.tags ?? []);
      setNotes(contact.internal_notes ?? "");
      setSaved(false);
    }
  }, [contact]);

  async function handleSave() {
    if (!contact) return;
    setSaving(true);
    setSaved(false);
    try {
      await apiUpdateContact({
        accessToken,
        contactId: contact.id,
        display_name: name.trim() || undefined,
        status,
        tags,
        internal_notes: notes.trim() || undefined
      });
      setSaved(true);
      onUpdate();
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert("Erro ao salvar dados do contato");
    } finally {
      setSaving(false);
    }
  }

  if (!contact) {
    return (
      <div className="text-sm font-medium text-center py-8 text-gray-500 dark:text-gray-400">
        Selecione uma conversa para editar o contato
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className={`text-[10px] font-bold uppercase tracking-wider mb-2 block text-orange-600 dark:text-orange-400`}>
          Nome
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl border-2 border-orange-200 dark:border-orange-800 bg-white dark:bg-gray-900 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 transition-all duration-200"
          placeholder="Nome do contato"
        />
      </div>

      <div>
        <label className={`text-[10px] font-bold uppercase tracking-wider mb-2 block text-orange-600 dark:text-orange-400`}>
          Status
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "lead" | "paciente" | "paciente_recorrente")}
          className="w-full rounded-xl border-2 border-orange-200 dark:border-orange-800 bg-white dark:bg-slate-900 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 text-gray-900 dark:text-white transition-all duration-200"
        >
          <option value="lead">Lead</option>
          <option value="paciente">Paciente</option>
          <option value="paciente_recorrente">Paciente Recorrente</option>
        </select>
      </div>

      <div>
        <label className={`text-[10px] font-bold uppercase tracking-wider mb-2 block text-orange-600 dark:text-orange-400`}>
          Tags
        </label>
        <TagsInput tags={tags} onChange={setTags} placeholder="Adicionar tag..." />
      </div>

      <div>
        <label className={`text-[10px] font-bold uppercase tracking-wider mb-2 block text-orange-600 dark:text-orange-400`}>
          Observações Internas
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="w-full rounded-xl border-2 border-orange-200 dark:border-orange-800 bg-white dark:bg-slate-900 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 text-gray-900 dark:text-white resize-none placeholder-gray-500 dark:placeholder-gray-400 transition-all duration-200"
          placeholder="Observações internas (não visíveis ao paciente)"
        />
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className={`w-full rounded-xl px-4 py-3.5 text-sm font-extrabold uppercase tracking-wider transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none ${
          saved
            ? "bg-gradient-to-r from-green-500 to-emerald-500 text-white border-2 border-green-400/50"
            : saving
            ? "bg-gradient-to-r from-gray-400 to-slate-400 text-white border-2 border-gray-300/50 cursor-not-allowed"
            : "bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 border-2 border-orange-400/50"
        }`}
      >
        {saving ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            SALVANDO...
          </span>
        ) : saved ? (
          <span className="flex items-center justify-center gap-2">
            <span>✓</span>
            SALVO COM SUCESSO
          </span>
        ) : (
          "SALVAR ALTERAÇÕES"
        )}
      </button>
    </div>
  );
}

