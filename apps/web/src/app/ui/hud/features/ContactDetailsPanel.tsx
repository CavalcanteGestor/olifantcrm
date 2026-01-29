"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { notify } from "@/lib/toastBus";
import { User, Phone, Mail, Tag, Save, X } from "lucide-react";

type ContactDetails = {
  id: string;
  display_name: string;
  phone_e164: string;
  email: string | null;
  tags: string[]; // Assuming tags is an array of strings or jsonb
  additional_attributes: any;
};

export function ContactDetailsPanel({ 
  conversationId, 
  isOpen, 
  onClose 
}: { 
  conversationId: string; 
  isOpen: boolean; 
  onClose: () => void 
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<ContactDetails>>({});
  const qc = useQueryClient();

  // 1. Fetch Contact ID from Conversation
  const { data: contactId } = useQuery({
    queryKey: ["contact-id", conversationId],
    queryFn: async () => {
      const { data } = await supabaseBrowser()
        .from("conversations")
        .select("contact_id")
        .eq("id", conversationId)
        .single();
      return data?.contact_id;
    },
    enabled: !!conversationId
  });

  // 2. Fetch Contact Details
  const { data: contact, isLoading } = useQuery({
    queryKey: ["contact-details", contactId],
    queryFn: async () => {
      if (!contactId) return null;
      const { data } = await supabaseBrowser()
        .from("contacts")
        .select("*")
        .eq("id", contactId)
        .single();
      return data as ContactDetails;
    },
    enabled: !!contactId
  });

  useEffect(() => {
    if (contact) {
      setFormData({
        display_name: contact.display_name,
        email: contact.email,
        phone_e164: contact.phone_e164,
        // tags: contact.tags
      });
    }
  }, [contact]);

  const handleSave = async () => {
    if (!contactId) return;
    try {
      const { error } = await supabaseBrowser()
        .from("contacts")
        .update({
          display_name: formData.display_name,
          email: formData.email,
          // tags: formData.tags
        })
        .eq("id", contactId);

      if (error) throw error;
      
      notify("Contato atualizado!", "success");
      setIsEditing(false);
      qc.invalidateQueries({ queryKey: ["contact-details", contactId] });
      qc.invalidateQueries({ queryKey: ["hud-queue"] }); // Update name in list
    } catch (e) {
      notify("Erro ao atualizar contato.", "error");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-2xl z-40 flex flex-col transform transition-transform duration-300 ease-in-out animate-in slide-in-from-right">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
        <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <User className="w-5 h-5" />
          Detalhes do Contato
        </h2>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {isLoading ? (
          <div className="text-center text-gray-500 mt-10">Carregando...</div>
        ) : contact ? (
          <>
            <div className="flex flex-col items-center py-4">
              <div className="w-20 h-20 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-3">
                {contact.display_name?.[0]?.toUpperCase() || "?"}
              </div>
              {!isEditing && (
                <h3 className="text-lg font-bold text-gray-900 dark:text-white text-center">
                  {contact.display_name}
                </h3>
              )}
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase">Nome</label>
                {isEditing ? (
                  <input
                    value={formData.display_name || ""}
                    onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
                    className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent text-sm"
                  />
                ) : (
                  <div className="flex items-center gap-2 text-sm text-gray-900 dark:text-white p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <User className="w-4 h-4 text-gray-400" />
                    {contact.display_name}
                  </div>
                )}
              </div>

              {/* Phone */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase">Telefone</label>
                <div className="flex items-center gap-2 text-sm text-gray-900 dark:text-white p-2 bg-gray-50 dark:bg-gray-800 rounded-lg opacity-70 cursor-not-allowed" title="Não editável">
                  <Phone className="w-4 h-4 text-gray-400" />
                  {contact.phone_e164}
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase">Email</label>
                {isEditing ? (
                  <input
                    value={formData.email || ""}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent text-sm"
                    placeholder="email@exemplo.com"
                  />
                ) : (
                  <div className="flex items-center gap-2 text-sm text-gray-900 dark:text-white p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <Mail className="w-4 h-4 text-gray-400" />
                    {contact.email || <span className="text-gray-400 italic">Sem email</span>}
                  </div>
                )}
              </div>

              {/* Tags (Placeholder for now) */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase">Tags</label>
                <div className="flex flex-wrap gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg min-h-[40px]">
                  <span className="text-xs text-gray-400 italic">Em breve: gerenciamento de tags</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center text-red-500">Contato não encontrado.</div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        {isEditing ? (
          <div className="flex gap-2">
            <button
              onClick={() => setIsEditing(false)}
              className="flex-1 py-2 px-4 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="flex-1 py-2 px-4 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              Salvar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            disabled={!contact}
            className="w-full py-2 px-4 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors"
          >
            Editar Informações
          </button>
        )}
      </div>
    </div>
  );
}
