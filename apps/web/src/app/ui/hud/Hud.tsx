"use client";

// Force update check
import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useHudQueue } from "@/hooks/hud/useHudQueue";
import { useHudChat } from "@/hooks/hud/useHudChat";
import { useUnansweredCounts } from "@/hooks/hud/useUnansweredCounts";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { getSlaIndicator, needsFollowUp } from "@/lib/slaHelpers";

import { notify } from "@/lib/toastBus";
import { WhisperInput } from "./features/WhisperInput";
import { ScheduleMessageModal } from "./features/ScheduleMessageModal";
import { ForwardToInternalChatModal } from "./features/ForwardToInternalChatModal";
import { ContactDetailsPanel } from "./features/ContactDetailsPanel";
import { WikiPanel } from "./features/WikiPanel";
import { ShortcutsManager } from "./features/ShortcutsManager";
import InternalChat from "./InternalChat";
import TransferModal from "./TransferModal";
import TaskCreator from "./TaskCreator";
import SlaControls from "./SlaControls";
import ChatInput from "./ChatInput";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import AgentStatus from "./AgentStatus";
import TemplateSelector from "./TemplateSelector";
import ConfigAlerts from "./ConfigAlerts";
import Notifications from "./Notifications";
import LogoutButton from "@/components/LogoutButton";
import ThemeToggle from "@/components/ThemeToggle";
import MessageMedia from "@/app/ui/hud/MessageMedia"; // Import MessageMedia
import { 
  MessageSquare, 
  BarChart3,
  Search, 
  Clock, 
  MoreVertical, 
  Phone, 
  Video, 
  UserPlus, 
  Archive,
  Ban,
  Zap,
  FileText,
  BookOpen,
  CalendarClock,
  Info,
  CornerUpRight,
  Smile,
  Edit3,
  Check,
  X
} from "lucide-react";
import { apiCloseConversation, apiGetSlaTimer, apiGetTasks, apiPauseSla, apiResumeSla, apiSendMedia, apiSetTaskStatus, apiReactMessage, apiGetMediaUrl, apiReturnToQueue, apiEditMessage } from "@/lib/api";
import EmojiPicker, { EmojiClickData, Theme } from "emoji-picker-react";
import { useTheme } from "@/contexts/ThemeContext";

type Message = {
  id: string;
  direction: "in" | "out";
  content: string;
  type?: string;
  created_at: string;
  status?: string;
  body_json?: any;
};

type HudQueueConversation = {
  id: string;
  assigned_user_id: string | null;
  updated_at: string;
  priority: number;
  last_outbound_at: string | null;
  last_patient_message_at: string | null;
  contacts: {
    display_name: string | null;
    profile_picture_url: string | null;
    phone_e164: string | null;
  } | null;
  funnel_stages: { name: string | null } | null;
  assigned_user: { full_name: string | null } | null;
  sla_timers: {
    due_at: string;
    breached_at: string | null;
    paused_at: string | null;
    started_at: string;
  } | null;
};

type Task = {
  id: string;
  title: string;
  due_at: string | null;
  status: string;
};

// Removido AudioMessage e ImageMessage em favor de MessageMedia

export default function Hud2() {
  const qc = useQueryClient();
  const { data: queue, isLoading: queueLoading } = useHudQueue();
  const conversationIds = useMemo(() => queue?.map(c => c.id) ?? [], [queue]);
  const { data: unansweredCounts } = useUnansweredCounts(conversationIds);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"mine" | "queue" | "assigned">("queue");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [canTransfer, setCanTransfer] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [followUpMinutes, setFollowUpMinutes] = useState<number>(120);
  const { messages, sendMessage } = useHudChat(selectedConversationId, accessToken);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sb = supabaseBrowser();
        const { data } = await sb.auth.getSession();
        const session = data.session;
        if (!session) {
          if (!cancelled) {
            setCurrentUserId(null);
            setAccessToken(null);
            setCanTransfer(false);
          }
          return;
        }
        if (!cancelled) {
          setCurrentUserId(session.user.id);
          setAccessToken(session.access_token);
        }

        const { data: profile } = await sb.from("profiles").select("tenant_id").eq("user_id", session.user.id).single();
        const tenantId = (profile as any)?.tenant_id as string | undefined;
        if (!cancelled) setTenantId(tenantId ?? null);
        if (!tenantId) {
          if (!cancelled) setCanTransfer(false);
          return;
        }

        // Buscar configuração de follow-up do tenant
        const { data: tenant, error: tenantErr } = await sb
          .from("tenants")
          .select("follow_up_alert_minutes")
          .eq("id", tenantId)
          .maybeSingle();
        
        if (!cancelled && tenant && !tenantErr) {
          setFollowUpMinutes((tenant as any)?.follow_up_alert_minutes ?? 120);
        }

        const { data: userRoles } = await sb
          .from("user_roles")
          .select("role_id")
          .eq("tenant_id", tenantId)
          .eq("user_id", session.user.id);
        const roleIds = (userRoles ?? []).map((ur: any) => ur.role_id).filter(Boolean);
        if (roleIds.length === 0) {
          if (!cancelled) setCanTransfer(false);
          return;
        }

        const { data: roles } = await sb.from("roles").select("key").in("id", roleIds);
        const keys = new Set((roles ?? []).map((r: { key: string }) => r.key).filter(Boolean));
        if (!cancelled) {
          const isAdm = keys.has("admin");
          setCanTransfer(true); // Todos podem transferir (regra atualizada)
          setIsAdmin(isAdm);
        }
      } catch {
        if (!cancelled) {
          setCurrentUserId(null);
          setAccessToken(null);
          setCanTransfer(false);
          setIsAdmin(false);
          setTenantId(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onOpenConversation = (evt: Event) => {
      const ce = evt as CustomEvent<{ conversationId?: string }>;
      const id = ce.detail?.conversationId;
      if (!id) return;
      setSelectedConversationId(id);
    };
    const onOpenInternalChat = () => {
      setIsInternalChatOpen(true);
    };
    const onHudOpenTemplate = (evt: Event) => {
      const ce = evt as CustomEvent<{ conversationId?: string }>;
      const id = ce.detail?.conversationId;
      if (id) setSelectedConversationId(id);
      setIsTemplateOpen(true);
    };
    window.addEventListener("openConversation", onOpenConversation as any);
    window.addEventListener("openInternalChat", onOpenInternalChat as any);
    window.addEventListener("hud:openTemplate", onHudOpenTemplate as any);
    return () => {
      window.removeEventListener("openConversation", onOpenConversation as any);
      window.removeEventListener("openInternalChat", onOpenInternalChat as any);
      window.removeEventListener("hud:openTemplate", onHudOpenTemplate as any);
    };
  }, []);

  const myConversations = useMemo(
    () => (queue?.filter((c: any) => currentUserId && c.assigned_user_id === currentUserId) || []),
    [queue, currentUserId]
  );
  const assignedConversations = useMemo(
    () => {
      if (!queue) return [];
      // Se for admin, mostra todas as conversas atribuídas
      if (isAdmin) {
        return queue.filter((c: any) => c.assigned_user_id !== null);
      }
      // Se não for admin, mostra apenas as conversas do próprio usuário
      return queue.filter((c: any) => currentUserId && c.assigned_user_id === currentUserId);
    },
    [queue, isAdmin, currentUserId]
  );
  const waitingQueue = useMemo(() => queue?.filter((c: any) => c.assigned_user_id === null) || [], [queue]);

  // Contadores de urgência
  const urgentCounts = useMemo(() => {
    const countUrgent = (convs: HudQueueConversation[]) => {
      return convs.filter(c => {
        if (!c.sla_timers?.due_at || c.sla_timers.paused_at) return false;
        const remaining = new Date(c.sla_timers.due_at).getTime() - Date.now();
        return c.sla_timers.breached_at || remaining <= 0;
      }).length;
    };
    
    return {
      mine: countUrgent(myConversations),
      queue: countUrgent(waitingQueue),
      assigned: countUrgent(assignedConversations)
    };
  }, [myConversations, waitingQueue, assignedConversations]);

  // Auto-switch tab if queue is empty but mine has items
  useEffect(() => {
    if (waitingQueue.length === 0 && myConversations.length > 0 && activeTab === "queue") {
      setActiveTab("mine");
    }
  }, [waitingQueue.length, myConversations.length, activeTab]);

  // Scroll para o final SEMPRE - quando abre conversa ou quando novas mensagens chegam
  useEffect(() => {
    if (selectedConversationId && messages.length > 0 && messagesEndRef.current) {
      // Usar setTimeout para garantir que as mensagens foram renderizadas
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      }, 50);
    }
  }, [selectedConversationId, messages.length]); // Monitora mudança de conversa E novas mensagens

  const displayedConversations = useMemo(() => {
    const base = activeTab === "mine" ? myConversations : activeTab === "assigned" ? assignedConversations : waitingQueue;
    const q = searchQuery.trim().toLowerCase();
    let filtered = base;
    
    if (q) {
      filtered = base.filter((conv: HudQueueConversation) => {
        const name = (conv.contacts?.display_name ?? "").toLowerCase();
        const phone = (conv.contacts?.phone_e164 ?? "").toLowerCase();
        return name.includes(q) || phone.includes(q);
      });
    }
    
    // Ordenação inteligente: priorizar atrasados, depois urgentes, depois por prioridade
    return [...filtered].sort((a, b) => {
      // 1. Conversas atrasadas (SLA breach) vêm primeiro
      const aBreached = a.sla_timers?.breached_at || (a.sla_timers?.due_at && new Date(a.sla_timers.due_at).getTime() < Date.now());
      const bBreached = b.sla_timers?.breached_at || (b.sla_timers?.due_at && new Date(b.sla_timers.due_at).getTime() < Date.now());
      
      if (aBreached && !bBreached) return -1;
      if (!aBreached && bBreached) return 1;
      
      // 2. Se ambas atrasadas ou nenhuma atrasada, ordenar por tempo restante de SLA
      if (a.sla_timers?.due_at && b.sla_timers?.due_at && !a.sla_timers.paused_at && !b.sla_timers.paused_at) {
        const aRemaining = new Date(a.sla_timers.due_at).getTime() - Date.now();
        const bRemaining = new Date(b.sla_timers.due_at).getTime() - Date.now();
        if (aRemaining !== bRemaining) return aRemaining - bRemaining;
      }
      
      // 3. Ordenar por prioridade (já vem do banco)
      if (a.priority !== b.priority) return b.priority - a.priority;
      
      // 4. Por último, ordenar por data de atualização
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [activeTab, myConversations, assignedConversations, waitingQueue, searchQuery]);

  // Feature Flags / Modals
  const [isWikiOpen, setIsWikiOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [isInternalChatOpen, setIsInternalChatOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isTasksOpen, setIsTasksOpen] = useState(false);
  const [isTaskCreatorOpen, setIsTaskCreatorOpen] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState<any>(null);
  const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState(false);
  const [isTemplateOpen, setIsTemplateOpen] = useState(false);
  const [isContactDetailsOpen, setIsContactDetailsOpen] = useState(false);
  const [editingMessage, setEditingMessage] = useState<any>(null);
  const [editText, setEditText] = useState("");

  const selectedConversation = queue?.find(c => c.id === selectedConversationId);

  const tasksQ = useQuery({
    queryKey: ["hud-tasks", selectedConversationId],
    queryFn: () => apiGetTasks({ accessToken: accessToken!, conversationId: selectedConversationId! }),
    enabled: !!accessToken && !!selectedConversationId && isTasksOpen,
    refetchInterval: 15000 // Otimizado: 15s (reduz 66% de requisições)
  });

  const slaQ = useQuery({
    queryKey: ["hud-sla", selectedConversationId],
    queryFn: () => apiGetSlaTimer({ accessToken: accessToken!, conversationId: selectedConversationId! }),
    enabled: !!accessToken && !!selectedConversationId,
    refetchInterval: 15000 // Otimizado: 15s (reduz 66% de requisições)
  });

  async function fileToBase64(file: Blob): Promise<string> {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("file_read_failed"));
      reader.onload = () => {
        const result = String(reader.result || "");
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        resolve(base64);
      };
      reader.readAsDataURL(file);
    });
  }

  // Verificar se mensagem pode ser editada (até 15 minutos)
  function canEditMessage(msg: Message): boolean {
    if (msg.direction !== 'out') return false;
    if (msg.type !== 'text') return false;
    if (!msg.body_json?.text && !msg.content) return false;
    
    const messageAge = Date.now() - new Date(msg.created_at).getTime();
    const fifteenMinutes = 15 * 60 * 1000;
    return messageAge <= fifteenMinutes;
  }

  // Editar mensagem
  async function editMessage(messageId: string, newText: string) {
    if (!accessToken) return;
    
    try {
      await apiEditMessage({
        accessToken,
        messageId,
        text: newText
      });
      
      notify("Mensagem editada com sucesso!", "success");
      setEditingMessage(null);
      setEditText("");
      
      // Atualizar mensagens
      await qc.invalidateQueries({ queryKey: ["messages", selectedConversationId] });
    } catch (e: any) {
      const errorMsg = e?.message || "Erro ao editar mensagem";
      if (errorMsg.includes("edit_window_expired")) {
        notify("Mensagens só podem ser editadas até 15 minutos após o envio", "warning");
      } else if (errorMsg.includes("can_only_edit_text_messages")) {
        notify("Só é possível editar mensagens de texto", "warning");
      } else {
        notify(errorMsg, "error");
      }
    }
  }

  return (
    <div className="flex h-[calc(100vh-64px)] bg-gray-50 dark:bg-gray-900">
      {/* Sidebar de Navegação Rápida */}
      <div className="w-16 border-r border-gray-200 dark:border-gray-800 flex flex-col items-center py-4 bg-white dark:bg-gray-900 space-y-4 shrink-0">
        <button 
          onClick={() => setIsInternalChatOpen(true)}
          className="p-3 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" 
          title="Chat Interno (Equipe)"
        >
          <MessageSquare className="w-6 h-6" />
        </button>
        <a href="/kanban" className="p-3 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors" title="Kanban">
          <BookOpen className="w-6 h-6" />
        </a>
        <a href="/history" className="p-3 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors" title="Histórico">
          <Archive className="w-6 h-6" />
        </a>
        
        {isAdmin && (
          <a href="/admin" className="p-3 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors" title="Painel Admin">
            <BarChart3 className="w-6 h-6" />
          </a>
        )}

        <div className="flex-1"></div>
        <div className="mb-4">
          <ThemeToggle simple />
        </div>
      </div>

      {/* 1. Coluna da Fila (Queue) */}
      <div className="w-80 border-r border-gray-200 dark:border-gray-800 flex flex-col bg-white dark:bg-gray-900">
        {accessToken && <AgentStatus accessToken={accessToken} />}
        {accessToken && <ConfigAlerts accessToken={accessToken} />}
        {accessToken && (
          <div className="px-4 pb-2">
            <Notifications />
          </div>
        )}
        <div className="p-4 border-b border-gray-200 dark:border-gray-800">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input 
              placeholder="Buscar cliente..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {/* Abas */}
          <div className="flex items-center gap-1 p-2 border-b border-gray-100 dark:border-gray-800">
            <button
              onClick={() => setActiveTab("mine")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors relative ${
                activeTab === "mine"
                  ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400"
                  : "text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              Meus ({myConversations.length})
              {urgentCounts.mine > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {urgentCounts.mine}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("queue")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors relative ${
                activeTab === "queue"
                  ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400"
                  : "text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              Fila ({waitingQueue.length})
              {urgentCounts.queue > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {urgentCounts.queue}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("assigned")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors relative ${
                activeTab === "assigned"
                  ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400"
                  : "text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              Atribuídas ({assignedConversations.length})
              {urgentCounts.assigned > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {urgentCounts.assigned}
                </span>
              )}
            </button>
          </div>

          {queueLoading ? (
            <div className="p-4 text-center text-gray-400 text-sm">Carregando fila...</div>
          ) : (
            displayedConversations.map((conv: HudQueueConversation) => {
              const slaIndicator = getSlaIndicator(conv.sla_timers);
              const unansweredCount = unansweredCounts?.get(conv.id) ?? 0;
              const showFollowUp = needsFollowUp(conv.last_patient_message_at, conv.last_outbound_at, followUpMinutes);
              
              return (
                <div 
                  key={conv.id}
                  onClick={() => setSelectedConversationId(conv.id)}
                  className={`
                    p-4 border-b border-gray-100 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors
                    ${selectedConversationId === conv.id ? "bg-indigo-50 dark:bg-indigo-900/20 border-l-4 border-l-indigo-500" : ""}
                  `}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <img 
                        src={conv.contacts?.profile_picture_url || "https://ui-avatars.com/api/?name=" + conv.contacts?.display_name} 
                        className="w-10 h-10 rounded-full object-cover"
                        alt=""
                      />
                      {conv.priority > 500 && (
                        <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-gray-900"></span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <h3 className="font-bold text-sm text-gray-900 dark:text-white truncate">{conv.contacts?.display_name}</h3>
                        <div className="flex flex-col items-end shrink-0">
                          <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">
                            {conv.last_patient_message_at 
                              ? new Date(conv.last_patient_message_at).toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'})
                              : new Date(conv.updated_at).toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'})}
                          </span>
                          <span className="text-[10px] text-gray-500">
                            {conv.last_patient_message_at 
                              ? new Date(conv.last_patient_message_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})
                              : new Date(conv.updated_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {conv.funnel_stages?.name}
                        {conv.assigned_user_id && (
                          <span className="ml-1">
                            • {conv.assigned_user?.full_name ? conv.assigned_user.full_name.split(" ")[0] : "Atribuída"}
                          </span>
                        )}
                      </p>
                      
                      {/* Indicadores */}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {/* Mensagens não respondidas */}
                        {unansweredCount > 0 && (
                          <div className="flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded">
                            💬 {unansweredCount} {unansweredCount === 1 ? 'msg' : 'msgs'}
                          </div>
                        )}
                        
                        {/* Indicador de SLA */}
                        {slaIndicator && (
                          <div className={`flex items-center gap-1 text-[10px] font-semibold ${slaIndicator.color} ${slaIndicator.bgColor} px-1.5 py-0.5 rounded`}>
                            {slaIndicator.icon} {slaIndicator.label}
                          </div>
                        )}
                        
                        {/* Indicador de Follow-up */}
                        {showFollowUp && (
                          <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded">
                            📞 Follow-up
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Online</span>
          </div>
          <LogoutButton />
        </div>
      </div>

      {/* 2. Área Central (Chat) */}
      <div className="flex-1 flex flex-col bg-gray-100 dark:bg-gray-950 relative">
        {selectedConversationId ? (
          <>
            {/* Header do Chat */}
            <div className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-6">
              <div 
                className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => setIsContactDetailsOpen(true)}
              >
                <img 
                  src={
                    selectedConversation?.contacts?.profile_picture_url ||
                    "https://ui-avatars.com/api/?name=" +
                      (selectedConversation?.contacts?.display_name ?? "Cliente")
                  } 
                  className="w-10 h-10 rounded-full"
                  alt=""
                />
                <div>
                  <h2 className="font-bold text-gray-900 dark:text-white">{selectedConversation?.contacts?.display_name}</h2>
                  <div className="flex items-center gap-2 text-xs text-green-600">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                    WhatsApp Oficial
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsContactDetailsOpen(!isContactDetailsOpen)}
                  className={`p-2 rounded-lg transition-colors ${isContactDetailsOpen ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-gray-100 text-gray-500'}`}
                  title="Detalhes do Contato"
                >
                  <Info className="w-5 h-5" />
                </button>
                {accessToken && selectedConversationId && (
                  <>
                    <SlaControls
                      accessToken={accessToken}
                      conversationId={selectedConversationId}
                      timer={slaQ.data?.timer ?? null}
                      onUpdate={async () => {
                        await qc.invalidateQueries({ queryKey: ["hud-sla", selectedConversationId] });
                      }}
                    />
                    {slaQ.data?.timer?.paused_at ? (
                      <button
                        onClick={async () => {
                          await apiResumeSla({ accessToken, conversationId: selectedConversationId });
                          await qc.invalidateQueries({ queryKey: ["hud-sla", selectedConversationId] });
                        }}
                        className="px-2 py-1 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                        title="Retomar SLA"
                      >
                        Retomar
                      </button>
                    ) : slaQ.data?.timer ? (
                      <button
                        onClick={async () => {
                          await apiPauseSla({ accessToken, conversationId: selectedConversationId });
                          await qc.invalidateQueries({ queryKey: ["hud-sla", selectedConversationId] });
                        }}
                        className="px-2 py-1 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                        title="Pausar SLA"
                      >
                        Pausar
                      </button>
                    ) : null}
                  </>
                )}
                <button 
                  onClick={() => setIsScheduleOpen(true)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 hover:text-indigo-600 tooltip" 
                  title="Agendar Mensagem"
                >
                  <CalendarClock className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => setIsShortcutsOpen(true)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 hover:text-yellow-500" 
                  title="Atalhos Rápidos"
                >
                  <Zap className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setIsTemplateOpen(true)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 hover:text-indigo-600"
                  title="Enviar Template"
                >
                  <FileText className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setIsTasksOpen(true)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 hover:text-indigo-600"
                  title="Tarefas"
                >
                  <Clock className="w-5 h-5" />
                </button>
                {canTransfer && (
                  <button
                    onClick={() => setIsTransferOpen(true)}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 hover:text-indigo-600"
                    title="Transferir"
                  >
                    <UserPlus className="w-5 h-5" />
                  </button>
                )}
                {/* Botão Devolver para Fila - admin pode devolver qualquer conversa, usuário normal só a sua */}
                {(isAdmin || selectedConversation?.assigned_user_id === currentUserId) && selectedConversation?.assigned_user_id && (
                  <button
                    onClick={async () => {
                      if (!accessToken || !selectedConversationId) return;
                      try {
                        await apiReturnToQueue({
                          accessToken,
                          conversationId: selectedConversationId
                        });
                        
                        notify("Conversa devolvida para a fila.", "success");
                        await qc.invalidateQueries({ queryKey: ["hud-queue"] });
                        setSelectedConversationId(null);
                      } catch (e: any) {
                        notify(e.message || "Erro ao devolver conversa.", "error");
                      }
                    }}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 hover:text-orange-500"
                    title="Devolver para fila"
                  >
                    <Archive className="w-5 h-5" />
                  </button>
                )}
                <button 
                  onClick={() => setIsCloseConfirmOpen(true)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 hover:text-red-500"
                  title="Finalizar conversa"
                >
                  <Ban className="w-5 h-5" />
                </button>
                <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-2"></div>
                <button 
                  onClick={() => setIsWikiOpen(!isWikiOpen)}
                  className={`p-2 rounded-lg transition-colors ${isWikiOpen ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-gray-100 text-gray-500'}`}
                >
                  <BookOpen className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => setIsInternalChatOpen(!isInternalChatOpen)}
                  className={`p-2 rounded-lg transition-colors ${isInternalChatOpen ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-gray-100 text-gray-500'}`}
                >
                  <MessageSquare className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Lista de Mensagens */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                  Nenhuma mensagem encontrada
                </div>
              ) : (
                messages.map((msg: Message) => (
                  <div key={msg.id} className={`flex ${msg.direction === 'out' ? 'justify-end' : 'justify-start'} group/message`}>
                    <div className={`
                      max-w-[70%] rounded-2xl p-4 shadow-sm text-sm wrap-break-word relative
                      ${msg.direction === 'out' 
                        ? 'bg-indigo-600 text-white rounded-tr-none' 
                        : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-tl-none border border-gray-100 dark:border-gray-700'
                      }
                    `}>
                      {/* Conteúdo da Mensagem */}
                      {editingMessage?.id === msg.id ? (
                        // Modo de edição
                        <div className="space-y-2">
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="w-full p-2 rounded bg-white/10 text-white placeholder-white/70 resize-none outline-none"
                            rows={3}
                            placeholder="Digite a nova mensagem..."
                            autoFocus
                          />
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              onClick={() => {
                                setEditingMessage(null);
                                setEditText("");
                              }}
                              className="p-1 rounded hover:bg-white/10 text-white/70 hover:text-white"
                              title="Cancelar"
                            >
                              <X className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => editMessage(msg.id, editText)}
                              disabled={!editText.trim()}
                              className="p-1 rounded hover:bg-white/10 text-white/70 hover:text-white disabled:opacity-50"
                              title="Salvar"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        // Modo normal
                        <div className="whitespace-pre-wrap">
                          {(() => {
                             const effectiveType = msg.body_json?.message?.type ?? msg.type;
                             const isMedia = ["image", "audio", "document", "video", "location"].includes(effectiveType || "");
                             
                             if (isMedia && accessToken) {
                               return <MessageMedia accessToken={accessToken} messageId={msg.id} messageType={effectiveType || ""} bodyJson={msg.body_json} />;
                             }
                             
                             return String(msg.content || (msg.type && msg.type !== "text" ? `[${msg.type}]` : ""));
                          })()}
                        </div>
                      )}

                      <div className={`text-[10px] mt-1 text-right ${msg.direction === 'out' ? 'text-indigo-200' : 'text-gray-400'}`}>
                        {new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        {msg.body_json?.edited && ' • Editada'}
                        {msg.status === 'queued' &&
                          (new Date(msg.created_at).getTime() - Date.now() > 60_000 ? " • Agendado" : " • Enviando...")}
                        {msg.status === 'failed' && ' • Falha'}
                      </div>

                      {/* Botões de ação (Hover) */}
                      <div className={`
                        absolute ${msg.direction === 'out' ? '-left-20' : '-right-20'} top-2 
                        flex items-center gap-1 opacity-0 group-hover/message:opacity-100 transition-opacity
                      `}>
                        {/* Botão Editar (só para mensagens próprias de texto até 15 min) */}
                        {msg.direction === 'out' && canEditMessage(msg) && (
                          <button
                            onClick={() => {
                              setEditingMessage(msg);
                              setEditText(msg.content || msg.body_json?.text || "");
                            }}
                            className="p-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-blue-600 shadow-sm"
                            title="Editar mensagem (até 15 min)"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                        
                        {/* Botão Encaminhar */}
                        <button
                          onClick={() => setForwardingMessage(msg)}
                          className="p-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-indigo-600 shadow-sm"
                          title="Encaminhar para equipe"
                        >
                          <CornerUpRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Areas */}
            <div className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
              {/* Modo Sussurro (Supervisor) */}
              {isAdmin &&
                !!tenantId &&
                !!currentUserId &&
                !!selectedConversationId &&
                !!selectedConversation?.assigned_user_id &&
                selectedConversation.assigned_user_id !== currentUserId && (
                  <WhisperInput
                    onSend={async (text) => {
                      try {
                        const { error } = await supabaseBrowser().from("internal_messages").insert({
                          tenant_id: tenantId,
                          from_user_id: currentUserId,
                          to_user_id: selectedConversation.assigned_user_id,
                          conversation_id: selectedConversationId,
                          message: `[Sussurro] ${text}`
                        } as any);
                        if (error) throw new Error(error.message);
                        notify("Sussurro enviado.", "success");
                      } catch (e: any) {
                        notify(String(e?.message || "Falha ao sussurrar."), "error");
                      }
                    }}
                  />
                )}
              
              {/* Input Principal */}
              <ChatInput
                onSendText={(text) => sendMessage(text)}
                onSendAudio={async (blob) => {
                  if (!accessToken || !selectedConversationId) return;
                  const base64 = await fileToBase64(blob);
                  await apiSendMedia({
                    accessToken,
                    conversationId: selectedConversationId,
                    mediaType: "audio",
                    fileData: base64,
                    fileName: "audio.webm"
                  });
                  await qc.invalidateQueries({ queryKey: ["messages", selectedConversationId] });
                }}
                onSendFile={async (file, caption) => {
                  if (!accessToken || !selectedConversationId) return;
                  const base64 = await fileToBase64(file);
                  const mediaType = file.type.startsWith("image/")
                    ? "image"
                    : file.type.startsWith("video/")
                      ? "video"
                      : "document";
                  await apiSendMedia({
                    accessToken,
                    conversationId: selectedConversationId,
                    mediaType,
                    mimeType: file.type,
                    fileData: base64,
                    fileName: file.name,
                    caption: caption || undefined
                  });
                  await qc.invalidateQueries({ queryKey: ["messages", selectedConversationId] });
                }}
                disabled={!accessToken}
                allowAudio={true}
                allowAttachments={true}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <MessageSquare className="w-16 h-16 mb-4 opacity-20" />
            <p>Selecione uma conversa para iniciar o atendimento</p>
          </div>
        )}
      </div>

      {/* 3. Painéis Laterais (Direita) */}
      {isInternalChatOpen && (
        <div className="w-80 border-l border-gray-200 dark:border-gray-800 animate-in slide-in-from-right duration-300">
          <InternalChat 
            conversationId={selectedConversationId} 
            onClose={() => setIsInternalChatOpen(false)}
          />
        </div>
      )}

      {/* Modals e Overlays */}
      <WikiPanel isOpen={isWikiOpen} onClose={() => setIsWikiOpen(false)} />
      {accessToken && selectedConversationId && (
        <ContactDetailsPanel 
          isOpen={isContactDetailsOpen} 
          onClose={() => setIsContactDetailsOpen(false)} 
          conversationId={selectedConversationId}
        />
      )}
      <ShortcutsManager
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
        onSelect={(text) => {
          if (!selectedConversationId) return;
          sendMessage(text);
          notify("Mensagem enviada.", "success");
        }}
      />
      {accessToken && selectedConversationId && (
        <ScheduleMessageModal
          isOpen={isScheduleOpen}
          onClose={() => setIsScheduleOpen(false)}
          accessToken={accessToken}
          conversationId={selectedConversationId}
          onScheduled={async () => {
            await qc.invalidateQueries({ queryKey: ["messages", selectedConversationId] });
          }}
        />
      )}
      {isTransferOpen && canTransfer && accessToken && selectedConversationId && (
        <TransferModal
          accessToken={accessToken}
          conversationId={selectedConversationId}
          currentUserId={currentUserId}
          onClose={() => setIsTransferOpen(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["hud-queue"] });
            setSelectedConversationId(null);
          }}
        />
      )}

      {forwardingMessage && currentUserId && tenantId && (
        <ForwardToInternalChatModal
          isOpen={true}
          onClose={() => setForwardingMessage(null)}
          messageToForward={forwardingMessage}
          currentUserId={currentUserId}
          tenantId={tenantId}
        />
      )}

      {isTasksOpen && accessToken && selectedConversationId && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setIsTasksOpen(false)}>
          <div
            className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-lg border border-gray-200 dark:border-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
              <div className="text-lg font-semibold text-gray-900 dark:text-white">Tarefas</div>
              <button
                onClick={() => setIsTasksOpen(false)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
              >
                <MoreVertical className="w-5 h-5 rotate-90" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {tasksQ.isLoading ? "Carregando..." : `${(tasksQ.data?.items ?? []).length} tarefa(s)`}
                </div>
                <button
                  onClick={() => setIsTaskCreatorOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                >
                  Nova
                </button>
              </div>

              <div className="space-y-2 max-h-[50vh] overflow-auto">
                {(tasksQ.data?.items ?? []).map((t: Task) => (
                  <div key={t.id} className="p-3 rounded-lg border border-gray-200 dark:border-gray-800">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{t.title}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {t.due_at ? `Vence: ${new Date(t.due_at).toLocaleString()}` : "Sem prazo"} • {t.status}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {t.status !== "done" && (
                          <button
                            onClick={async () => {
                              await apiSetTaskStatus({ accessToken, taskId: t.id, status: "done" });
                              await qc.invalidateQueries({ queryKey: ["hud-tasks", selectedConversationId] });
                            }}
                            className="px-3 py-1.5 rounded-lg text-sm font-medium text-green-700 hover:bg-green-50 dark:text-green-300 dark:hover:bg-green-900/20"
                          >
                            Concluir
                          </button>
                        )}
                        {t.status !== "cancelled" && (
                          <button
                            onClick={async () => {
                              await apiSetTaskStatus({ accessToken, taskId: t.id, status: "cancelled" });
                              await qc.invalidateQueries({ queryKey: ["hud-tasks", selectedConversationId] });
                            }}
                            className="px-3 py-1.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            Cancelar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {!tasksQ.isLoading && (tasksQ.data?.items ?? []).length === 0 && (
                  <div className="text-sm text-gray-500 dark:text-gray-400 p-3">Nenhuma tarefa nesta conversa.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {isTaskCreatorOpen && accessToken && selectedConversationId && (
        <TaskCreator
          accessToken={accessToken}
          conversationId={selectedConversationId}
          onCancel={() => setIsTaskCreatorOpen(false)}
          onTaskCreated={async () => {
            setIsTaskCreatorOpen(false);
            await qc.invalidateQueries({ queryKey: ["hud-tasks", selectedConversationId] });
          }}
        />
      )}

      {isTemplateOpen && accessToken && selectedConversationId && (
        <TemplateSelector
          accessToken={accessToken}
          conversationId={selectedConversationId}
          onSend={async () => {
            await qc.invalidateQueries({ queryKey: ["messages", selectedConversationId] });
          }}
          onClose={() => setIsTemplateOpen(false)}
        />
      )}

      <ConfirmDialog
        isOpen={isCloseConfirmOpen}
        title="Finalizar conversa"
        message="Deseja finalizar esta conversa agora? Ela sairá da fila."
        type="danger"
        confirmText="Finalizar"
        cancelText="Cancelar"
        onCancel={() => setIsCloseConfirmOpen(false)}
        onConfirm={async () => {
          if (!accessToken || !selectedConversationId) {
            setIsCloseConfirmOpen(false);
            notify("Sessão ou conversa não selecionada.", "warning");
            return;
          }
          try {
            await apiCloseConversation({ accessToken, conversationId: selectedConversationId });
            notify("Conversa finalizada.", "success");
            setIsCloseConfirmOpen(false);
            await qc.invalidateQueries({ queryKey: ["hud-queue"] });
            await qc.invalidateQueries({ queryKey: ["messages", selectedConversationId] });
            setSelectedConversationId(null);
          } catch (e: unknown) {
            notify(String((e as Error)?.message || "Falha ao finalizar."), "error");
            setIsCloseConfirmOpen(false);
          }
        }}
      />
    </div>
  );
}
