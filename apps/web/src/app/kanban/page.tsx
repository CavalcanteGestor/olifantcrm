"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Home, GripVertical, Clock, User, Phone, AlertCircle, History, LayoutGrid, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable
} from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { notify } from "@/lib/toastBus";
import { apiListStages, apiMoveStage } from "@/lib/api";
import ThemeToggle from "@/components/ThemeToggle";
import LogoutButton from "@/components/LogoutButton";

type Stage = { id: string; name: string; sort_order: number };

type Conversation = {
  id: string;
  contact_id: string;
  status_fila: string;
  priority: number;
  assigned_user_id: string | null;
  current_stage_id: string | null;
  last_patient_message_at: string | null;
  last_outbound_at: string | null;
  updated_at: string;
  contacts: { phone_e164: string; display_name: string | null; status: string } | null;
  funnel_stages?: { name: string } | null;
  sla_timers?: { due_at: string; breached_at: string | null; paused_at: string | null; started_at: string } | null;
  assigned_profiles?: { full_name: string } | null;
};

function formatSince(iso: string | null) {
  if (!iso) return "-";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}

function slaIndicator(timer: Conversation["sla_timers"]) {
  if (!timer?.due_at || timer.paused_at) return { label: "—", cls: "bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300" };
  const due = new Date(timer.due_at).getTime();
  const now = Date.now();
  const remaining = due - now;
  if (remaining <= 0) return { label: "Atrasado", cls: "bg-red-500 text-white" };
  if (remaining <= 20_000) return { label: "Urgente", cls: "bg-yellow-400 text-gray-900 dark:text-gray-950" };
  return { label: "No prazo", cls: "bg-indigo-600 text-white" };
}

function DroppableStage({ 
  stage, 
  conversations, 
  onConversationClick 
}: { 
  stage: Stage; 
  conversations: Conversation[];
  onConversationClick: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const stageConversations = conversations.filter(c => c.current_stage_id === stage.id);

  return (
    <div ref={setNodeRef} className="shrink-0 w-[300px] flex flex-col bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 shadow-sm">
      {/* Header do estágio */}
      <div className={`px-4 py-3 border-b border-gray-200 dark:border-gray-800 ${isOver ? "bg-indigo-50 dark:bg-indigo-900/20" : "bg-gray-50 dark:bg-gray-800/50"}`}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{stage.name}</h3>
          <span className="text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 px-2 py-0.5 rounded-full">
            {stageConversations.length}
          </span>
        </div>
      </div>

      {/* Lista de conversas */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[200px] max-h-[calc(100vh-200px)]">
        {stageConversations.length === 0 ? (
          <div className="text-xs text-gray-400 dark:text-gray-500 text-center py-8">
            Nenhuma conversa
          </div>
        ) : (
          stageConversations.map((conv) => (
            <ConversationCard
              key={conv.id}
              conversation={conv}
              onClick={() => onConversationClick(conv.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ConversationCard({ conversation, onClick }: { conversation: Conversation; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: conversation.id });
  const sla = slaIndicator(conversation.sla_timers ?? null);
  const isSlaBreached = sla.label === "Atrasado";
  const contactName = conversation.contacts?.display_name || conversation.contacts?.phone_e164 || "Sem nome";
  const statusFila = conversation.status_fila;

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className={`p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
        isSlaBreached
          ? "border-red-500 bg-red-50 dark:bg-red-900/30 animate-pulse-border shadow-[0_0_0_2px_rgba(239,68,68,0.2)]"
          : conversation.priority >= 2
          ? "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20"
          : statusFila === "em_atendimento"
          ? "border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20"
          : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600"
      }`}
    >
      {/* Header com grip e SLA */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <GripVertical className="w-3 h-3 text-gray-400 dark:text-gray-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-gray-900 dark:text-white truncate">
              {contactName}
            </div>
          </div>
        </div>
        <div className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 flex items-center gap-1 ${sla.cls}`}>
          {isSlaBreached && <AlertCircle className="w-3 h-3 animate-bounce" />}
          {sla.label}
        </div>
      </div>

      {/* Informações do contato */}
      <div className="space-y-1 mb-2">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-600 dark:text-gray-400">
          <Phone className="w-3 h-3" />
          <span className="font-mono truncate">{conversation.contacts?.phone_e164 || "-"}</span>
        </div>
        {conversation.contacts?.status && (
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              conversation.contacts.status === "lead"
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                : conversation.contacts.status === "paciente"
                ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                : "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
            }`}>
              {conversation.contacts.status === "lead" ? "Lead" : conversation.contacts.status === "paciente" ? "Paciente" : "Recorrente"}
            </span>
          </div>
        )}
      </div>

      {/* Status e tempo */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
        <div className="text-[10px] text-gray-500 dark:text-gray-400">
          {conversation.last_patient_message_at ? (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatSince(conversation.last_patient_message_at)}
            </span>
          ) : (
            "-"
          )}
        </div>
        {conversation.assigned_profiles && (
          <div className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <User className="w-3 h-3" />
            <span className="truncate max-w-[80px]">{conversation.assigned_profiles.full_name}</span>
          </div>
        )}
      </div>

      {/* Prioridade alta */}
      {conversation.priority >= 2 && (
        <div className="mt-2 pt-2 border-t border-red-200 dark:border-red-800">
          <div className="flex items-center gap-1 text-[10px] text-red-600 dark:text-red-400">
            <AlertCircle className="w-3 h-3" />
            <span className="font-semibold">Prioridade Alta</span>
          </div>
        </div>
      )}
    </div>
  );
}

function DraggableOverlay({ conversation }: { conversation: Conversation | null }) {
  if (!conversation) return null;
  
  return (
    <div className="w-64 p-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
      <div className="text-xs font-semibold text-gray-900 dark:text-white">
        {conversation.contacts?.display_name || conversation.contacts?.phone_e164 || "Sem nome"}
      </div>
      <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
        Movendo para outro estágio...
      </div>
    </div>
  );
}

export default function KanbanPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [sessionReady, setSessionReady] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"kanban" | "history">("kanban");
  const [historyConversations, setHistoryConversations] = useState<Conversation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedHistoryConversation, setSelectedHistoryConversation] = useState<Conversation | null>(null);
  const [historyMessages, setHistoryMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    })
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: session } = await supabaseBrowser().auth.getSession();
      if (!alive) return;
      if (!session.session) {
        router.replace("/login");
        return;
      }
      setAccessToken(session.session.access_token);
      setSessionReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [router]);

  // Buscar estágios
  useEffect(() => {
    if (!accessToken) return;
    let alive = true;
    (async () => {
      try {
        const data = await apiListStages({ accessToken });
        if (!alive) return;
        setStages(data.items);
      } catch (err: any) {
        if (err.message?.includes('ERR_CONNECTION_REFUSED') || err.message?.includes('Failed to fetch')) {
          try {
            const { data: session } = await supabaseBrowser().auth.getSession();
            if (!session.session || !alive) return;
            
            const { data: profile } = await supabaseBrowser()
              .from("profiles")
              .select("tenant_id")
              .eq("user_id", session.session.user.id)
              .maybeSingle();
            
            if (!profile || !alive) return;
            
            const { data: stagesData } = await supabaseBrowser()
              .from("funnel_stages")
              .select("id, name, sort_order")
              .eq("tenant_id", (profile as any).tenant_id)
              .order("sort_order", { ascending: true });
            
            if (alive) {
              setStages((stagesData || []).map((s: any) => ({
                id: s.id,
                name: s.name,
                sort_order: s.sort_order
              })));
            }
          } catch (supabaseErr) {
            console.error("Erro ao buscar estágios:", supabaseErr);
          }
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [accessToken]);

  // Buscar conversas
  useEffect(() => {
    if (!accessToken || stages.length === 0) return;
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const { data: session } = await supabaseBrowser().auth.getSession();
        if (!session.session || !alive) return;

        const { data: profile } = await supabaseBrowser()
          .from("profiles")
          .select("tenant_id")
          .eq("user_id", session.session.user.id)
          .maybeSingle();

        if (!profile || !alive) return;
        
        const tenantId = (profile as any).tenant_id;

        const { data: convs, error } = await supabaseBrowser()
          .from("conversations")
          .select(`
            id,
            contact_id,
            status_fila,
            priority,
            assigned_user_id,
            current_stage_id,
            last_patient_message_at,
            last_outbound_at,
            updated_at,
            contacts(phone_e164,display_name,status),
            funnel_stages(name),
            sla_timers(due_at,breached_at,paused_at,started_at)
          `)
          .eq("tenant_id", (profile as any).tenant_id)
          .neq("status_fila", "finalizado")
          .order("priority", { ascending: false })
          .order("last_patient_message_at", { ascending: true, nullsFirst: false });

        if (error) throw error;
        if (!alive) return;

        // Buscar nomes dos atendentes para conversas atribuídas
        const assignedUserIds = [...new Set((convs || []).filter((c: any) => c.assigned_user_id).map((c: any) => c.assigned_user_id))];
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

        // Adicionar nome do atendente aos resultados
        const results = (convs || []).map((c: any) => ({
          ...c,
          assigned_profiles: c.assigned_user_id ? { full_name: assignedUsersMap.get(c.assigned_user_id) || "Desconhecido" } : null
        }));

        setConversations(results as unknown as Conversation[]);
      } catch (err) {
        console.error("Erro ao buscar conversas:", err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [accessToken, stages]);

  // Atualizar conversas periodicamente
  useEffect(() => {
    if (!accessToken || stages.length === 0) return;
    const interval = setInterval(() => {
      // Refetch conversations
      supabaseBrowser().auth.getSession().then(({ data: session }) => {
        if (!session?.session) return;
        supabaseBrowser()
          .from("profiles")
          .select("tenant_id")
          .eq("user_id", session.session.user.id)
          .maybeSingle()
          .then(({ data: profile }) => {
            if (!profile) return;
            supabaseBrowser()
              .from("conversations")
              .select(`
                id,
                contact_id,
                status_fila,
                priority,
                assigned_user_id,
                current_stage_id,
                last_patient_message_at,
                last_outbound_at,
                updated_at,
                contacts(phone_e164,display_name,status),
                funnel_stages(name),
                sla_timers(due_at,breached_at,paused_at,started_at)
              `)
              .eq("tenant_id", (profile as any).tenant_id)
              .neq("status_fila", "finalizado")
              .order("priority", { ascending: false })
              .order("last_patient_message_at", { ascending: true, nullsFirst: false })
              .then(({ data: convs }) => {
                // Buscar nomes dos atendentes
                const assignedUserIds = [...new Set((convs || []).filter((c: any) => c.assigned_user_id).map((c: any) => c.assigned_user_id))];
                if (assignedUserIds.length > 0) {
                  supabaseBrowser()
                    .from("profiles")
                    .select("user_id, full_name")
                    .in("user_id", assignedUserIds)
                    .then(({ data: profiles }) => {
                      const assignedUsersMap = new Map<string, string>();
                      if (profiles) {
                        profiles.forEach((p: any) => {
                          assignedUsersMap.set(p.user_id, p.full_name || "Sem nome");
                        });
                      }
                      const results = (convs || []).map((c: any) => ({
                        ...c,
                        assigned_profiles: c.assigned_user_id ? { full_name: assignedUsersMap.get(c.assigned_user_id) || "Desconhecido" } : null
                      }));
                      setConversations(results as unknown as Conversation[]);
                    });
                } else {
                  setConversations((convs || []) as unknown as Conversation[]);
                }
              });
          });
      });
    }, 10000); // Atualizar a cada 10 segundos

    return () => clearInterval(interval);
  }, [accessToken, stages]);

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    if (!event.over || !accessToken) return;

    const conversationId = event.active.id as string;
    const targetStageId = event.over.id as string;

    // Verificar se o ID é de um estágio válido
    const isStageId = stages.some(s => s.id === targetStageId);
    if (!isStageId) return;

    const conversation = conversations.find(c => c.id === conversationId);
    if (!conversation || conversation.current_stage_id === targetStageId) return;

    // Validar UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(targetStageId)) {
      notify("Erro: ID de estágio inválido.", "error", 8000);
      return;
    }

    setMoving(true);
    try {
      await apiMoveStage({ accessToken, conversationId, stageId: targetStageId });
      
      // Atualizar estado local
      setConversations(prev => prev.map(c => 
        c.id === conversationId 
          ? { ...c, current_stage_id: targetStageId }
          : c
      ));
    } catch (err: any) {
      let errorMsg = "Erro ao mover conversa";
      if (err.details) {
        errorMsg = err.details;
      } else if (err.message === "already_at_stage") {
        errorMsg = "A conversa já está nesta etapa";
      } else if (err.message === "stage_not_found") {
        errorMsg = "Etapa não encontrada";
      } else if (err.message === "conversation_not_found") {
        errorMsg = "Conversa não encontrada";
      }
      notify(`Erro: ${errorMsg}`, "error", 8000);
      console.error("Erro ao mover conversa:", err);
    } finally {
      setMoving(false);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleConversationClick(conversationId: string) {
    router.push(`/?conversation=${conversationId}`);
  }

  // Buscar mensagens quando uma conversa do histórico é selecionada
  useEffect(() => {
    if (!selectedHistoryConversation) {
      setHistoryMessages([]);
      return;
    }

    let alive = true;
    setLoadingMessages(true);
    (async () => {
      try {
        const { data: session } = await supabaseBrowser().auth.getSession();
        if (!session.session || !alive) return;

        const { data: profile } = await supabaseBrowser()
          .from("profiles")
          .select("tenant_id")
          .eq("user_id", session.session.user.id)
          .maybeSingle();

        if (!profile || !alive) return;
        const tenantId = (profile as any).tenant_id;

        // Buscar mensagens
        const { data: messages, error } = await supabaseBrowser()
          .from("messages")
          .select("id,direction,type,body_json,status,created_at,sent_by_user_id")
          .eq("conversation_id", selectedHistoryConversation.id)
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: true })
          .limit(500);

        if (error) throw error;
        if (!alive) return;

        // Buscar profiles dos usuários que enviaram mensagens
        const userIds = [...new Set((messages || []).filter((m: any) => m.sent_by_user_id).map((m: any) => m.sent_by_user_id))];
        let profilesMap = new Map<string, string>();
        
        if (userIds.length > 0) {
          const { data: profiles } = await supabaseBrowser()
            .from("profiles")
            .select("user_id, full_name")
            .in("user_id", userIds);
          
          if (profiles) {
            profiles.forEach((p: any) => {
              profilesMap.set(p.user_id, p.full_name || "Sem nome");
            });
          }
        }

        // Adicionar profiles aos resultados
        const results = (messages || []).map((m: any) => ({
          ...m,
          profiles: m.sent_by_user_id ? { full_name: profilesMap.get(m.sent_by_user_id) || null } : null
        }));

        if (alive) setHistoryMessages(results);
      } catch (err) {
        console.error("Erro ao buscar mensagens:", err);
      } finally {
        if (alive) setLoadingMessages(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [selectedHistoryConversation]);

  // Buscar histórico de conversas finalizadas
  useEffect(() => {
    if (activeTab !== "history" || !accessToken) return;
    let alive = true;
    setHistoryLoading(true);
    (async () => {
      try {
        const { data: session } = await supabaseBrowser().auth.getSession();
        if (!session.session || !alive) return;

        const { data: profile } = await supabaseBrowser()
          .from("profiles")
          .select("tenant_id")
          .eq("user_id", session.session.user.id)
          .maybeSingle();

        if (!profile || !alive) return;
        
        const tenantId = (profile as any).tenant_id;

        const { data: convs, error } = await supabaseBrowser()
          .from("conversations")
          .select(`
            id,
            contact_id,
            status_fila,
            priority,
            assigned_user_id,
            current_stage_id,
            last_patient_message_at,
            last_outbound_at,
            updated_at,
            created_at,
            contacts(phone_e164,display_name,status),
            funnel_stages(name)
          `)
          .eq("tenant_id", tenantId)
          .eq("status_fila", "finalizado")
          .order("updated_at", { ascending: false })
          .limit(100);

        if (error) throw error;
        if (!alive) return;

        // Buscar nomes dos atendentes para conversas atribuídas
        const assignedUserIds = [...new Set((convs || []).filter((c: any) => c.assigned_user_id).map((c: any) => c.assigned_user_id))];
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

        // Adicionar nome do atendente aos resultados
        const results = (convs || []).map((c: any) => ({
          ...c,
          assigned_profiles: c.assigned_user_id ? { full_name: assignedUsersMap.get(c.assigned_user_id) || "Desconhecido" } : null
        }));

        setHistoryConversations(results as unknown as Conversation[]);
      } catch (err) {
        console.error("Erro ao buscar histórico:", err);
      } finally {
        if (alive) setHistoryLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [activeTab, accessToken]);

  if (!sessionReady) {
    return (
      <div className="h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-sm text-gray-400">Carregando...</div>
        </div>
      </div>
    );
  }

  const activeConversation = activeId ? conversations.find(c => c.id === activeId) : null;

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden">
      {/* Barra superior */}
      <div className="h-14 shrink-0 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="relative w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 p-1.5">
              <Image
                src="/logo.png"
                alt="Clínica Olifant"
                fill
                sizes="32px"
                className="object-contain"
                priority
              />
            </div>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Kanban</span>
          </Link>
          <div className="h-5 w-px bg-gray-200 dark:bg-gray-800"></div>
          <Link
            href="/"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 transition-colors"
          >
            <Home className="w-4 h-4" />
            <span>Voltar para HUD</span>
          </Link>
          <div className="h-5 w-px bg-gray-200 dark:bg-gray-800"></div>
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setActiveTab("kanban")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === "kanban"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              <span>Kanban</span>
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === "history"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              }`}
            >
              <History className="w-4 h-4" />
              <span>Histórico</span>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </div>

      {/* Área do Kanban ou Histórico */}
      <div className="flex-1 overflow-hidden p-4" style={{ minHeight: 0 }}>
        {activeTab === "kanban" ? (
          <>
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-sm text-gray-500 dark:text-gray-400">Carregando conversas...</div>
              </div>
            ) : stages.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Nenhuma etapa configurada</div>
                  <Link
                    href="/settings/funnel"
                    className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Configurar etapas do funil
                  </Link>
                </div>
              </div>
            ) : (
              <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <div className="h-full flex gap-4 overflow-x-auto overflow-y-hidden pb-4" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgb(156 163 175) transparent' }}>
                  {stages.map((stage) => (
                    <DroppableStage
                      key={stage.id}
                      stage={stage}
                      conversations={conversations}
                      onConversationClick={handleConversationClick}
                    />
                  ))}
                  {/* Espaço extra no final para melhor scroll */}
                  <div className="flex-shrink-0 w-4"></div>
                </div>
                <DragOverlay>
                  {activeConversation && <DraggableOverlay conversation={activeConversation} />}
                </DragOverlay>
              </DndContext>
            )}
          </>
        ) : (
          /* Histórico de Conversas Finalizadas */
          <div className="h-full overflow-y-auto">
            {historyLoading ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-sm text-gray-500 dark:text-gray-400">Carregando histórico...</div>
              </div>
            ) : historyConversations.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <History className="w-12 h-12 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
                  <div className="text-sm text-gray-500 dark:text-gray-400">Nenhuma conversa finalizada ainda</div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {historyConversations.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => setSelectedHistoryConversation(conv)}
                    className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-md cursor-pointer transition-all"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                          {conv.contacts?.display_name || conv.contacts?.phone_e164 || "Sem nome"}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {conv.contacts?.phone_e164 || "-"}
                        </div>
                      </div>
                      <div className="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                        Finalizada
                      </div>
                    </div>
                    {conv.funnel_stages?.name && (
                      <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                        Etapa: {conv.funnel_stages.name}
                      </div>
                    )}
                    {conv.assigned_profiles && (
                      <div className="text-xs text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-1">
                        <User className="w-3 h-3" />
                        <span>{conv.assigned_profiles.full_name}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700">
                      <Clock className="w-3 h-3" />
                      <span>
                        {conv.updated_at
                          ? new Date(conv.updated_at).toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit"
                            })
                          : "-"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Overlay de loading ao mover */}
      {moving && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-900 rounded-lg px-6 py-4 shadow-xl">
            <div className="text-sm text-gray-900 dark:text-white">Movendo conversa...</div>
          </div>
        </div>
      )}

      {/* Modal de Histórico de Conversa */}
      {selectedHistoryConversation && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col">
            {/* Header do Modal */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {selectedHistoryConversation.contacts?.display_name || selectedHistoryConversation.contacts?.phone_e164 || "Conversa"}
                </h2>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {selectedHistoryConversation.contacts?.phone_e164 || "-"}
                  {selectedHistoryConversation.assigned_profiles && (
                    <span className="ml-2">
                      • Atendido por: {selectedHistoryConversation.assigned_profiles.full_name}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedHistoryConversation(null);
                  setHistoryMessages([]);
                }}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            {/* Área de Mensagens */}
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-900">
              {loadingMessages ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-sm text-gray-500 dark:text-gray-400">Carregando mensagens...</div>
                </div>
              ) : historyMessages.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Nenhuma mensagem encontrada</div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {historyMessages.map((msg: any) => {
                    const isInbound = msg.direction === "in";
                    const messageText = msg.body_json?.text || msg.body_json?.body || JSON.stringify(msg.body_json);
                    const messageTime = new Date(msg.created_at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    });
                    const senderName = msg.profiles?.full_name || (isInbound ? "Cliente" : "Atendente");

                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isInbound ? "justify-start" : "justify-end"}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-lg px-4 py-2 ${
                            isInbound
                              ? "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                              : "bg-blue-600 text-white"
                          }`}
                        >
                          <div className="text-xs font-medium mb-1 opacity-70">
                            {senderName} • {messageTime}
                          </div>
                          <div className={`text-sm ${isInbound ? "text-gray-900 dark:text-white" : "text-white"}`}>
                            {messageText}
                          </div>
                          {msg.status && (
                            <div className="text-[10px] mt-1 opacity-60">
                              {msg.status === "read" && "✓✓ Lida"}
                              {msg.status === "delivered" && "✓✓ Entregue"}
                              {msg.status === "sent" && "✓ Enviada"}
                              {msg.status === "queued" && "⏳ Na fila"}
                              {msg.status === "failed" && "❌ Falhou"}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer do Modal */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {historyMessages.length} mensagem{historyMessages.length !== 1 ? "s" : ""}
              </div>
              <button
                onClick={() => router.push(`/?conversation=${selectedHistoryConversation.id}`)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Abrir no HUD
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
