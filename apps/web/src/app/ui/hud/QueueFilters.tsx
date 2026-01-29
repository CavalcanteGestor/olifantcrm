"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Filter, Search, X, ChevronDown, ChevronUp } from "lucide-react";
import { apiListStages, apiListUsers } from "@/lib/api";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type QueueFiltersProps = {
  accessToken: string;
  filters: {
    stageId: string | null;
    contactStatus: string | null;
    assignedUserId: string | null;
    statusFila: string | null;
    searchQuery: string;
  };
  onFiltersChange: (filters: QueueFiltersProps["filters"]) => void;
  isAdminHud?: boolean;
};

export default function QueueFilters({ accessToken, filters, onFiltersChange, isAdminHud = false }: QueueFiltersProps) {
  const [localFilters, setLocalFilters] = useState(filters);
  const [isExpanded, setIsExpanded] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stagesQ = useQuery({
    queryKey: ["stages"],
    queryFn: async () => {
      try {
        return await apiListStages({ accessToken });
      } catch (err: any) {
        // Se a API não estiver disponível, buscar diretamente do Supabase
        if (err.message?.includes('ERR_CONNECTION_REFUSED') || err.message?.includes('Failed to fetch')) {
          const { data: session } = await supabaseBrowser().auth.getSession();
          if (!session.session) throw err;
          
          const { data: profile } = await supabaseBrowser()
            .from("profiles")
            .select("tenant_id")
            .eq("user_id", session.session.user.id)
            .maybeSingle();
          
          if (!profile) throw err;
          
          const { data: stages } = await supabaseBrowser()
            .from("funnel_stages")
            .select("id, name, sort_order")
            .eq("tenant_id", (profile as any).tenant_id)
            .order("sort_order", { ascending: true });
          
          return { items: stages || [] };
        }
        throw err;
      }
    },
    enabled: !!accessToken
  });

  const usersQ = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      try {
        return await apiListUsers({ accessToken });
      } catch (err: any) {
        // Se a API não estiver disponível, buscar diretamente do Supabase
        if (err.message?.includes('ERR_CONNECTION_REFUSED') || err.message?.includes('Failed to fetch')) {
          const { data: session } = await supabaseBrowser().auth.getSession();
          if (!session.session) throw err;
          
          const { data: profile } = await supabaseBrowser()
            .from("profiles")
            .select("tenant_id")
            .eq("user_id", session.session.user.id)
            .maybeSingle();
          
          if (!profile) throw err;
          
          const { data: users } = await supabaseBrowser()
            .from("profiles")
            .select("user_id, full_name")
            .eq("tenant_id", (profile as any).tenant_id)
            .order("full_name", { ascending: true });
          
          return { items: users || [] };
        }
        throw err;
      }
    },
    enabled: !!accessToken
  });

  useEffect(() => {
    setLocalFilters(filters);
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [filters]);

  function updateFilter(key: keyof typeof localFilters, value: string | null) {
    const newFilters = { ...localFilters, [key]: value };
    setLocalFilters(newFilters);
    onFiltersChange(newFilters);
  }

  function clearFilters() {
    const cleared = {
      stageId: null,
      contactStatus: null,
      assignedUserId: null,
      statusFila: null,
      searchQuery: ""
    };
    setLocalFilters(cleared);
    onFiltersChange(cleared);
  }

  const hasActiveFilters = useMemo(() => {
    return !!(
      localFilters.stageId ||
      localFilters.contactStatus ||
      localFilters.assignedUserId ||
      localFilters.statusFila ||
      localFilters.searchQuery.trim()
    );
  }, [localFilters]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (localFilters.stageId) count++;
    if (localFilters.contactStatus) count++;
    if (localFilters.assignedUserId) count++;
    if (localFilters.statusFila) count++;
    return count;
  }, [localFilters]);

  const getActiveFilterLabels = () => {
    const labels: string[] = [];
    if (localFilters.stageId) {
      const stage = stagesQ.data?.items?.find(s => s.id === localFilters.stageId);
      if (stage) labels.push(stage.name);
    }
    if (localFilters.contactStatus) labels.push(localFilters.contactStatus);
    if (localFilters.assignedUserId) {
      const user = usersQ.data?.items?.find(u => u.user_id === localFilters.assignedUserId);
      if (user) labels.push(user.full_name);
    }
    if (localFilters.statusFila) {
      const statusMap: Record<string, string> = {
        "aguardando_atendimento": "Aguardando",
        "em_atendimento": "Em Atendimento",
        "aguardando_paciente": "Aguardando Paciente",
        "finalizado": "Finalizado"
      };
      labels.push(statusMap[localFilters.statusFila] || localFilters.statusFila);
    }
    return labels;
  };

  return (
    <div className="border-b border-gray-200 dark:border-gray-800">
      {/* Header - Sempre visível */}
      <div className="p-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all ${
            isExpanded
              ? "bg-gray-100 dark:bg-gray-800/50"
              : "hover:bg-gray-50 dark:hover:bg-gray-800/30"
          }`}
        >
          <div className="flex items-center gap-2">
            <Filter className={`w-4 h-4 ${isAdminHud ? "text-blue-600 dark:text-blue-400" : "text-orange-600 dark:text-orange-400"}`} />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Filtros
            </span>
            {activeFiltersCount > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                isAdminHud
                  ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                  : "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"
              }`}>
                {activeFiltersCount}
              </span>
            )}
          </div>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          )}
        </button>

        {/* Chips de filtros ativos quando colapsado */}
        {!isExpanded && activeFiltersCount > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {getActiveFilterLabels().map((label, idx) => (
              <span
                key={idx}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${
                  isAdminHud
                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                    : "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"
                }`}
              >
                {label}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // Remover filtro específico
                    if (localFilters.stageId && stagesQ.data?.items?.find(s => s.id === localFilters.stageId)?.name === label) {
                      updateFilter("stageId", null);
                    } else if (localFilters.contactStatus === label) {
                      updateFilter("contactStatus", null);
                    } else if (localFilters.assignedUserId && usersQ.data?.items?.find(u => u.user_id === localFilters.assignedUserId)?.full_name === label) {
                      updateFilter("assignedUserId", null);
                    } else if (localFilters.statusFila) {
                      updateFilter("statusFila", null);
                    }
                  }}
                  className="hover:opacity-70"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Conteúdo expandido */}
      {isExpanded && (
        <div className="p-3 space-y-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
          {/* Busca - Sempre visível */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              value={localFilters.searchQuery}
              onChange={(e) => {
                const newFilters = { ...localFilters, searchQuery: e.target.value };
                setLocalFilters(newFilters);
                if (searchTimeoutRef.current) {
                  clearTimeout(searchTimeoutRef.current);
                }
                searchTimeoutRef.current = setTimeout(() => {
                  onFiltersChange(newFilters);
                }, 500);
              }}
              placeholder="Buscar por nome ou telefone..."
              className={`w-full pl-10 pr-4 py-2 rounded-lg border ${
                isAdminHud
                  ? "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  : "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
              } outline-none transition-all text-sm`}
            />
          </div>

          {/* Filtros dropdowns */}
          <div className="grid grid-cols-2 gap-2">
            <select
              value={localFilters.stageId || ""}
              onChange={(e) => updateFilter("stageId", e.target.value || null)}
              className={`text-sm rounded-lg border px-3 py-2 outline-none transition-all ${
                isAdminHud
                  ? "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
              }`}
            >
              <option value="">Todas as etapas</option>
              {(stagesQ.data?.items ?? []).map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>

            <select
              value={localFilters.contactStatus || ""}
              onChange={(e) => updateFilter("contactStatus", e.target.value || null)}
              className={`text-sm rounded-lg border px-3 py-2 outline-none transition-all ${
                isAdminHud
                  ? "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
              }`}
            >
              <option value="">Todos os tipos</option>
              <option value="lead">Lead</option>
              <option value="paciente">Paciente</option>
              <option value="paciente_recorrente">Paciente Recorrente</option>
            </select>

            <select
              value={localFilters.assignedUserId || ""}
              onChange={(e) => updateFilter("assignedUserId", e.target.value || null)}
              className={`text-sm rounded-lg border px-3 py-2 outline-none transition-all ${
                isAdminHud
                  ? "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
              }`}
            >
              <option value="">Todos os atendentes</option>
              {(usersQ.data?.items ?? []).map((user) => (
                <option key={user.user_id} value={user.user_id}>
                  {user.full_name}
                </option>
              ))}
            </select>

            <select
              value={localFilters.statusFila || ""}
              onChange={(e) => updateFilter("statusFila", e.target.value || null)}
              className={`text-sm rounded-lg border px-3 py-2 outline-none transition-all ${
                isAdminHud
                  ? "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
              }`}
            >
              <option value="">Todos os status</option>
              <option value="aguardando_atendimento">Aguardando Atendimento</option>
              <option value="em_atendimento">Em Atendimento</option>
              <option value="aguardando_paciente">Aguardando Paciente</option>
              <option value="finalizado">Finalizado</option>
            </select>
          </div>

          {/* Botão limpar */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors"
            >
              <X className="w-4 h-4" />
              Limpar Filtros
            </button>
          )}
        </div>
      )}
    </div>
  );
}

