"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type SearchFilters = {
  query: string;
  statusFila?: string;
  contactStatus?: string;
  stageId?: string;
  assignedUserId?: string;
  dateFrom?: string;
  dateTo?: string;
};

type SearchResult = {
  id: string;
  contact_name: string;
  contact_phone: string;
  status_fila: string;
  stage_name: string;
  assigned_to: string | null;
  last_message_at: string;
};

export default function AdvancedSearch({ onSelect }: { onSelect: (conversationId: string) => void }) {
  const [showSearch, setShowSearch] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({ query: "" });
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [stages, setStages] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    const loadFilters = async () => {
      const { data: session } = await supabaseBrowser().auth.getSession();
      if (!session.session) return;
      
      const { data: profile } = await supabaseBrowser()
        .from("profiles")
        .select("tenant_id")
        .eq("user_id", session.session.user.id)
        .single();
      
      if (!profile) return;
      
      const [stagesRes, usersRes] = await Promise.all([
        supabaseBrowser()
          .from("funnel_stages")
          .select("id, name")
          .eq("tenant_id", (profile as any).tenant_id)
          .order("sort_order"),
        supabaseBrowser()
          .from("profiles")
          .select("user_id, full_name")
          .eq("tenant_id", (profile as any).tenant_id)
      ]);
      
      if (stagesRes.data) setStages(stagesRes.data);
      if (usersRes.data) setUsers(usersRes.data);
    };
    
    loadFilters();
  }, []);

  useEffect(() => {
    if (!showSearch || filters.query.length < 2) {
      setResults([]);
      return;
    }

    const search = async () => {
      setLoading(true);
      try {
        const { data: session } = await supabaseBrowser().auth.getSession();
        if (!session.session) return;
        
        const { data: profile } = await supabaseBrowser()
          .from("profiles")
          .select("tenant_id")
          .eq("user_id", session.session.user.id)
          .single();
        
        if (!profile) return;
        
        let query = supabaseBrowser()
          .from("conversations")
          .select(`
            id,
            status_fila,
            last_patient_message_at,
            created_at,
            assigned_user_id,
            contacts(display_name, phone_e164, status, tags),
            funnel_stages(name)
          `)
          .eq("tenant_id", (profile as any).tenant_id);
        
        // Aplicar filtros
        if (filters.statusFila) {
          query = query.eq("status_fila", filters.statusFila);
        }
        if (filters.contactStatus) {
          query = query.eq("contacts.status", filters.contactStatus);
        }
        if (filters.stageId) {
          query = query.eq("current_stage_id", filters.stageId);
        }
        if (filters.assignedUserId) {
          query = query.eq("assigned_user_id", filters.assignedUserId);
        }
        if (filters.dateFrom) {
          query = query.gte("created_at", filters.dateFrom);
        }
        if (filters.dateTo) {
          query = query.lte("created_at", filters.dateTo);
        }
        
        const { data } = await query.limit(50);
        
        // Buscar profiles separadamente
        const assignedUserIds = [...new Set((data || []).filter((c: any) => c.assigned_user_id).map((c: any) => c.assigned_user_id))];
        let assignedUsersMap = new Map<string, string>();
        if (assignedUserIds.length > 0) {
          const { data: profiles } = await supabaseBrowser()
            .from("profiles")
            .select("user_id, full_name")
            .in("user_id", assignedUserIds);
          if (profiles) {
            profiles.forEach((p: any) => {
              assignedUsersMap.set(p.user_id, p.full_name || "Sem nome");
            });
          }
        }
        
        // Busca por texto (nome, telefone, tags)
        const searchLower = filters.query.toLowerCase();
        const filtered = (data || []).filter((conv: any) => {
          const name = (conv.contacts?.display_name || "").toLowerCase();
          const phone = (conv.contacts?.phone_e164 || "").toLowerCase();
          const tags = (conv.contacts?.tags || []).join(" ").toLowerCase();
          return name.includes(searchLower) || phone.includes(searchLower) || tags.includes(searchLower);
        });
        
        setResults(filtered.map((conv: any) => ({
          id: conv.id,
          contact_name: conv.contacts?.display_name || conv.contacts?.phone_e164 || "Sem nome",
          contact_phone: conv.contacts?.phone_e164 || "",
          status_fila: conv.status_fila,
          stage_name: conv.funnel_stages?.name || "-",
          assigned_to: conv.assigned_user_id ? assignedUsersMap.get(conv.assigned_user_id) || null : null,
          last_message_at: conv.last_patient_message_at || conv.created_at
        })));
      } catch (error) {
        // Erro silencioso na busca
      } finally {
        setLoading(false);
      }
    };

    const timeout = setTimeout(search, 300);
    return () => clearTimeout(timeout);
  }, [filters, showSearch]);

  // Atalho Ctrl+K ou Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch(true);
      }
      if (e.key === "Escape" && showSearch) {
        setShowSearch(false);
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showSearch]);

  if (!showSearch) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-20 p-4" onClick={() => setShowSearch(false)}>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-3xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2 mb-4">
            <input
              type="text"
              placeholder="Buscar conversas, contatos... (Ctrl+K ou Cmd+K)"
              value={filters.query}
              onChange={(e) => setFilters({ ...filters, query: e.target.value })}
              className="flex-1 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 transition-all"
              autoFocus
            />
            <button
              onClick={() => setShowSearch(false)}
              className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm text-gray-700 dark:text-gray-300"
            >
              ESC
            </button>
          </div>
          
          {/* Filtros avançados */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <select
              value={filters.statusFila || ""}
              onChange={(e) => setFilters({ ...filters, statusFila: e.target.value || undefined })}
              className="rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 px-2 py-1 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
            >
              <option value="">Todos status</option>
              <option value="aguardando_atendimento">Aguardando</option>
              <option value="em_atendimento">Em Atendimento</option>
              <option value="aguardando_paciente">Aguardando Paciente</option>
              <option value="finalizado">Finalizado</option>
            </select>
            
            <select
              value={filters.contactStatus || ""}
              onChange={(e) => setFilters({ ...filters, contactStatus: e.target.value || undefined })}
              className="rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 px-2 py-1 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
            >
              <option value="">Todos contatos</option>
              <option value="lead">Lead</option>
              <option value="paciente">Paciente</option>
              <option value="paciente_recorrente">Paciente Recorrente</option>
            </select>
            
            <select
              value={filters.stageId || ""}
              onChange={(e) => setFilters({ ...filters, stageId: e.target.value || undefined })}
              className="rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 px-2 py-1 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
            >
              <option value="">Todos estágios</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            
            <select
              value={filters.assignedUserId || ""}
              onChange={(e) => setFilters({ ...filters, assignedUserId: e.target.value || undefined })}
              className="rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 px-2 py-1 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
            >
              <option value="">Todos atendentes</option>
              {users.map((u) => (
                <option key={u.user_id} value={u.user_id}>{u.full_name}</option>
              ))}
            </select>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">Buscando...</div>
          ) : results.length === 0 ? (
            <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">
              {filters.query.length < 2 ? "Digite pelo menos 2 caracteres" : "Nenhum resultado encontrado"}
            </div>
          ) : (
            <div className="space-y-2">
              {results.map((result) => (
                <div
                  key={result.id}
                  onClick={() => {
                    onSelect(result.id);
                    setShowSearch(false);
                  }}
                  className="p-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm text-gray-900 dark:text-white">{result.contact_name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {result.contact_phone} • {result.status_fila} • {result.stage_name}
                      </div>
                    </div>
                    {result.assigned_to && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">{result.assigned_to}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
