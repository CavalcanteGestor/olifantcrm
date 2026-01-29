"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiAdminAgents } from "@/lib/api";
import { Circle, Pause, Search, CheckSquare, Square } from "lucide-react";

type AgentsMonitorProps = {
  accessToken: string;
  selectedAgentIds: string[];
  onSelectAgent: (agentId: string) => void;
};

export default function AgentsMonitor({ accessToken, selectedAgentIds, onSelectAgent }: AgentsMonitorProps) {
  const [search, setSearch] = useState("");

  const agentsQ = useQuery({
    queryKey: ["admin-agents"],
    queryFn: () => apiAdminAgents({ accessToken }),
    enabled: !!accessToken,
    refetchInterval: 20000 // Otimizado: 20s (reduz 50% de requisições)
  });

  if (agentsQ.isLoading) {
    return (
      <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">
        Carregando agentes...
      </div>
    );
  }

  if (agentsQ.error) {
    return (
      <div className="text-xs text-red-500 dark:text-red-400 text-center py-4">
        Erro ao carregar agentes
      </div>
    );
  }

  const allAgents = agentsQ.data?.items ?? [];
  const agents = allAgents.filter(a => 
    a.full_name.toLowerCase().includes(search.toLowerCase()) ||
    a.email.toLowerCase().includes(search.toLowerCase())
  );

  if (allAgents.length === 0) {
    return (
      <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">
        Nenhum agente encontrado
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar agente..."
          className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
        />
      </div>

      <div className="space-y-1 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
        {agents.map((agent) => {
          const isSelected = selectedAgentIds.includes(agent.user_id);
          
          const statusConfig = {
            online: {
              icon: <Circle className="w-1.5 h-1.5 fill-green-500 text-green-500" />,
              label: "Online"
            },
            paused: {
              icon: <Pause className="w-1.5 h-1.5 text-yellow-600 dark:text-yellow-400" />,
              label: "Pausado"
            },
            offline: {
              icon: <Circle className="w-1.5 h-1.5 fill-gray-400 text-gray-400" />,
              label: "Offline"
            }
          };

          const status = agent.status === "online" ? statusConfig.online : 
                        agent.status === "paused" ? statusConfig.paused : 
                        statusConfig.offline;

          return (
            <button
              key={agent.user_id}
              onClick={() => onSelectAgent(agent.user_id)}
              className={`w-full text-left px-2 py-1.5 rounded-lg border transition-all duration-150 group ${
                isSelected
                  ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 shadow-sm"
                  : "border-transparent hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              <div className="flex items-center gap-2">
                {/* Checkbox visual */}
                <div className={`flex-shrink-0 transition-colors ${
                  isSelected ? "text-indigo-600 dark:text-indigo-400" : "text-gray-300 dark:text-gray-600 group-hover:text-gray-400"
                }`}>
                  {isSelected ? (
                    <CheckSquare className="w-4 h-4" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </div>
                
                {/* Avatar Compacto */}
                <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-[10px] ${
                  isSelected
                    ? "bg-indigo-600 dark:bg-indigo-700"
                    : "bg-gray-400 dark:bg-gray-600"
                }`}>
                  {agent.full_name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase()}
                </div>
                
                {/* Nome e Status */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <div className={`text-xs font-medium truncate ${
                      isSelected
                        ? "text-indigo-900 dark:text-indigo-100"
                        : "text-gray-700 dark:text-gray-300"
                    }`}>
                      {agent.full_name}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {status.icon}
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">{status.label}</span>
                  </div>
                </div>
                
                {/* Número de conversas */}
                {agent.total_conversations > 0 && (
                  <div className="flex-shrink-0">
                    <div className="px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-[10px] font-bold text-gray-600 dark:text-gray-400">
                      {agent.total_conversations}
                    </div>
                  </div>
                )}
              </div>
            </button>
          );
        })}
        {agents.length === 0 && search && (
          <div className="text-xs text-gray-500 text-center py-2">
            Nenhum agente encontrado
          </div>
        )}
      </div>
    </div>
  );
}
