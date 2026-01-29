"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useToast } from "@/hooks/useToast";
import { ToastContainer } from "@/app/ui/hud/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type QuickMessage = {
  id: string;
  title: string;
  shortcut: string;
  content: string;
  created_by?: string | null;
  category: string;
};

type QuickMessagesProps = {
  onSelect: (content: string) => void;
  onClose: () => void;
};

export default function QuickMessages({ onSelect, onClose }: QuickMessagesProps) {
  const { toasts, showToast, removeToast } = useToast();
  const [selectedMessage, setSelectedMessage] = useState<QuickMessage | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMessage, setEditingMessage] = useState<QuickMessage | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formContent, setFormContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<QuickMessage | null>(null);
  const qc = useQueryClient();

  const supabase = supabaseBrowser();

  // Buscar mensagens do Supabase
  const messagesQ = useQuery({
    queryKey: ["quick_messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("canned_responses" as any)
        .select("id,title,shortcut,body_template,created_by,created_at")
        .order("title", { ascending: true })
        .order("shortcut", { ascending: true });
      
      if (error) throw error;

      const rows = (data || []) as Array<{
        id: string;
        title: string;
        shortcut: string;
        body_template: string;
        created_by: string | null;
        created_at: string;
      }>;

      const toCategory = (shortcut: string) => {
        const s = String(shortcut || "");
        const byColon = s.includes(":") ? s.split(":")[0] : null;
        const bySlash = s.includes("/") ? s.split("/")[0] : null;
        const raw = (byColon ?? bySlash ?? "Geral").trim();
        return raw.length ? raw : "Geral";
      };

      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        shortcut: r.shortcut,
        content: r.body_template,
        created_by: r.created_by,
        category: toCategory(r.shortcut)
      })) as QuickMessage[];
    }
  });

  const messages = messagesQ.data || [];
  const categories = [...new Set(messages.map((m) => m.category))].sort();

  const filteredMessages = messages.filter((msg) => {
    const matchesSearch = searchQuery === "" || 
      msg.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      msg.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === null || msg.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Agrupar mensagens por categoria
  const messagesByCategory = filteredMessages.reduce((acc, msg) => {
    if (!acc[msg.category]) acc[msg.category] = [];
    acc[msg.category].push(msg);
    return acc;
  }, {} as Record<string, QuickMessage[]>);

  function handleSelect() {
    if (selectedMessage) {
      onSelect(selectedMessage.content);
      onClose();
    }
  }

  async function handleAddNew() {
    setEditingMessage(null);
    setFormTitle("");
    setFormCategory("");
    setFormContent("");
    setShowAddForm(true);
  }

  async function handleEdit(msg: QuickMessage) {
    setEditingMessage(msg);
    setFormTitle(msg.title);
    setFormCategory(msg.category);
    setFormContent(msg.content);
    setShowAddForm(true);
  }

  async function handleDelete(msg: QuickMessage) {
    setShowDeleteConfirm(msg);
  }

  async function confirmDelete() {
    if (!showDeleteConfirm) return;
    const msg = showDeleteConfirm;
    setSaving(true);
    try {
      const { error } = await (supabase
        .from("canned_responses" as any) as any)
        .delete()
        .eq("id", msg.id);
      
      if (error) throw error;
      
      await qc.invalidateQueries({ queryKey: ["quick_messages"] });
      if (selectedMessage?.id === msg.id) {
        setSelectedMessage(null);
      }
      showToast(`Mensagem "${msg.title}" excluída com sucesso`, "success");
      setShowDeleteConfirm(null);
    } catch (err: any) {
      showToast(`Erro ao excluir: ${err.message}`, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveForm() {
    if (!formTitle.trim() || !formCategory.trim() || !formContent.trim()) {
      showToast("Preencha todos os campos", "warning");
      return;
    }

    setSaving(true);
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      const slug = (s: string) =>
        s
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "")
          .slice(0, 32) || "geral";

      if (editingMessage) {
        // Editar mensagem existente
        const { error } = await (supabase
          .from("canned_responses" as any) as any)
          .update({
            title: formTitle.trim(),
            body_template: formContent.trim()
          })
          .eq("id", editingMessage.id);
        
        if (error) throw error;
      } else {
        // Adicionar nova mensagem
        const shortcut = `${slug(formCategory)}/${slug(formTitle)}_${Math.random().toString(36).slice(2, 6)}`;
        const { error } = await (supabase
          .from("canned_responses" as any) as any)
          .insert({
            title: formTitle.trim(),
            shortcut,
            body_template: formContent.trim(),
            created_by: user?.id || null
          });
        
        if (error) throw error;
      }
      
      await qc.invalidateQueries({ queryKey: ["quick_messages"] });
      setShowAddForm(false);
      setEditingMessage(null);
      setFormTitle("");
      setFormCategory("");
      setFormContent("");
      showToast(editingMessage ? "Mensagem atualizada com sucesso!" : "Mensagem adicionada com sucesso!", "success");
    } catch (err: any) {
      showToast(`Erro ao salvar: ${err.message}`, "error");
    } finally {
      setSaving(false);
    }
  }

  function handleCancelForm() {
    setShowAddForm(false);
    setEditingMessage(null);
    setFormTitle("");
    setFormCategory("");
    setFormContent("");
  }

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 max-w-5xl w-full mx-4 max-h-[90vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-lg font-semibold text-gray-900 dark:text-white">Mensagens Rápidas</div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAddNew}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
            >
              + Nova Mensagem
            </button>
            <button
              onClick={onClose}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Busca e filtros */}
        <div className="mb-4 space-y-2">
          <input
            type="text"
            placeholder="Buscar mensagem..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 dark:text-white transition-all"
          />
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedCategory === null
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              Todas ({messages.length})
            </button>
            {categories.map((cat) => {
              const count = messages.filter((m) => m.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    selectedCategory === cat
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-2 gap-4 overflow-hidden">
          {/* Lista de mensagens organizadas por categoria */}
          <div className="border-r border-gray-200 dark:border-gray-800 pr-4 overflow-auto">
            {messagesQ.isLoading ? (
              <div className="text-xs text-gray-500 dark:text-gray-400">Carregando...</div>
            ) : filteredMessages.length === 0 ? (
              <div className="text-xs text-gray-500 dark:text-gray-400">Nenhuma mensagem encontrada</div>
            ) : selectedCategory ? (
              // Mostrar apenas a categoria selecionada
              <div className="space-y-3">
                <div className="sticky top-0 bg-white dark:bg-gray-900 pb-2 z-10">
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">{selectedCategory}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{messagesByCategory[selectedCategory]?.length || 0} mensagens</div>
                </div>
                <div className="space-y-2">
                  {messagesByCategory[selectedCategory]?.map((msg) => (
                    <div
                      key={msg.id}
                      className={`group relative rounded-lg border transition-colors ${
                        selectedMessage?.id === msg.id
                          ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
                          : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-white dark:bg-gray-900"
                      }`}
                    >
                      <button
                        onClick={() => setSelectedMessage(msg)}
                        className="w-full text-left px-3 py-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">{msg.title}</div>
                          </div>
                          <div className="ml-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(msg);
                              }}
                              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                              title="Editar"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(msg);
                              }}
                              className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400"
                              title="Excluir"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              // Mostrar todas as categorias agrupadas
              <div className="space-y-4">
                {Object.entries(messagesByCategory).map(([category, msgs]) => (
                  <div key={category} className="space-y-2">
                    <div className="sticky top-0 bg-white dark:bg-gray-900 pb-2 z-10">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">{category}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{msgs.length} mensagem{msgs.length !== 1 ? "s" : ""}</div>
                    </div>
                    <div className="space-y-2">
                      {msgs.map((msg) => (
                        <div
                          key={msg.id}
                          className={`group relative rounded-lg border transition-colors ${
                            selectedMessage?.id === msg.id
                              ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
                              : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-white dark:bg-gray-900"
                          }`}
                        >
                          <button
                            onClick={() => setSelectedMessage(msg)}
                            className="w-full text-left px-3 py-2"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="text-sm font-medium text-gray-900 dark:text-white">{msg.title}</div>
                              </div>
                              <div className="ml-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEdit(msg);
                                  }}
                                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                                  title="Editar"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(msg);
                                  }}
                                  className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400"
                                  title="Excluir"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Preview ou Formulário */}
          <div className="overflow-auto">
            {showAddForm ? (
              <div className="space-y-4">
                <div className="text-sm font-semibold text-gray-900 dark:text-white">
                  {editingMessage ? "Editar Mensagem" : "Nova Mensagem Rápida"}
                </div>
                
                <div>
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">Categoria</label>
                  <input
                    type="text"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    placeholder="Ex: Agendamento, Confirmação, Lembrete..."
                    className="w-full rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 dark:text-white"
                    list="categories"
                  />
                  <datalist id="categories">
                    {categories.map((cat) => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">Título</label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="Ex: Confirmação de consulta"
                    className="w-full rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">Conteúdo da Mensagem</label>
                  <textarea
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                    placeholder="Digite o conteúdo da mensagem..."
                    rows={12}
                    className="w-full rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 dark:text-white resize-none font-mono"
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <button
                    onClick={handleCancelForm}
                    disabled={saving}
                    className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-semibold hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSaveForm}
                    disabled={saving}
                    className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-all shadow-sm hover:shadow-md disabled:opacity-50"
                  >
                    {saving ? "Salvando..." : editingMessage ? "Salvar Alterações" : "Adicionar Mensagem"}
                  </button>
                </div>
              </div>
            ) : !selectedMessage ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">Selecione uma mensagem</div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-indigo-600 dark:text-indigo-400 font-medium mb-1">{selectedMessage.category}</div>
                  <div className="text-sm font-semibold mb-1 text-gray-900 dark:text-white">{selectedMessage.title}</div>
                </div>

                <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 p-4 text-sm whitespace-pre-wrap text-gray-900 dark:text-white max-h-96 overflow-auto">
                  {selectedMessage.content}
                </div>

                <div className="flex gap-2 pt-4">
                  <button
                    onClick={onClose}
                    className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-semibold hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSelect}
                    className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-all shadow-sm hover:shadow-md"
                  >
                    Usar Mensagem
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          isOpen={!!showDeleteConfirm}
          title="Excluir Mensagem"
          message={`Tem certeza que deseja excluir "${showDeleteConfirm.title}"?`}
          onConfirm={confirmDelete}
          onCancel={() => setShowDeleteConfirm(null)}
          confirmText="Excluir"
          cancelText="Cancelar"
          type="danger"
        />
      )}

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
