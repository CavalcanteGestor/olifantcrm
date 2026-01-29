"use client";

import { useEffect, useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { notify } from "@/lib/toastBus";

type Notification = {
  id: string;
  type: "new_conversation" | "sla_warning" | "sla_breach" | "rating" | "abandoned" | "transfer" | "unattended";
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  conversationId?: string;
};

export default function Notifications() {
  const qc = useQueryClient();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const ch = supabaseBrowser()
      .channel("notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversations",
          filter: "status_fila=eq.aguardando_atendimento"
        },
        (payload) => {
          const conv = payload.new as any;
          addNotification({
            type: "new_conversation",
            title: "Nova Conversa",
            message: `Nova conversa aguardando atendimento`,
            conversationId: conv.id
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sla_events",
          filter: "type=eq.breach"
        },
        (payload) => {
          const event = payload.new as any;
          addNotification({
            type: "sla_breach",
            title: "SLA Violado",
            message: `SLA violado em uma conversa`,
            conversationId: event.conversation_id
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_ratings"
        },
        (payload) => {
          const rating = payload.new as any;
          addNotification({
            type: "rating",
            title: "Nova Avaliação",
            message: `Você recebeu ${rating.rating} ⭐`,
            conversationId: rating.conversation_id
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: "direction=eq.in"
        },
        async (payload) => {
          const msg = payload.new as any;
          const { data: session } = await supabaseBrowser().auth.getSession();
          if (!session.session) return;
          
          const { data: conversation } = await supabaseBrowser()
            .from("conversations")
            .select("id, assigned_user_id, status_fila, contacts(display_name, phone_e164)")
            .eq("id", msg.conversation_id)
            .maybeSingle();
          
          if (conversation) {
            const isAssignedToMe = (conversation as any).assigned_user_id === session.session.user.id;
            // Notificar se for minha conversa OU se estiver na fila (sem dono)
            const isInQueue = (conversation as any).status_fila === "aguardando_atendimento" || !(conversation as any).assigned_user_id;

            if (isAssignedToMe || isInQueue) {
              const contact = (conversation as any).contacts;
              addNotification({
                type: "new_conversation",
                title: isAssignedToMe ? "Nova Mensagem" : "Mensagem na Fila",
                message: `${contact?.display_name || contact?.phone_e164 || "Cliente"}: ${msg.type === 'text' ? (msg.content?.substring(0, 30) + (msg.content?.length > 30 ? '...' : '')) : 'Enviou uma mídia'}`,
                conversationId: (conversation as any).id
              });
            }
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "internal_messages"
        },
        async (payload) => {
          const internalMsg = payload.new as any;
          const { data: session } = await supabaseBrowser().auth.getSession();
          if (!session.session) return;
          
          // Se a mensagem é para o usuário atual
          if (internalMsg.to_user_id === session.session.user.id) {
            // Se tem conversation_id e mensagem começa com ⚠️, é notificação do sistema (conversa sem atendente)
            if (internalMsg.conversation_id && internalMsg.message?.startsWith("⚠️")) {
              addNotification({
                type: "unattended",
                title: "⚠️ Conversa Sem Atendente",
                message: internalMsg.message,
                conversationId: internalMsg.conversation_id
              });
            } 
            // Se tem conversation_id e mensagem começa com 📥, é transferência
            else if (internalMsg.conversation_id && internalMsg.message?.startsWith("📥")) {
              addNotification({
                type: "transfer",
                title: "📥 Conversa Transferida",
                message: internalMsg.message,
                conversationId: internalMsg.conversation_id
              });
            }
            // Outras mensagens internas não são notificações do sistema, apenas chat interno
          }
        }
      )
      .subscribe();

    return () => {
      supabaseBrowser().removeChannel(ch);
    };
  }, []);

  // Verificar conversas sem resposta periodicamente
  const notifiedConversationsRef = useRef<Set<string>>(new Set());
  const [noResponseThresholdMinutes, setNoResponseThresholdMinutes] = useState(5);
  
  // Buscar configuração do tenant
  useEffect(() => {
    let cancelled = false;
    
    const loadConfig = async () => {
      const { data: session } = await supabaseBrowser().auth.getSession();
      if (!session.session || cancelled) return;
      
      const { data: profile } = await supabaseBrowser()
        .from("profiles")
        .select("tenant_id, tenants(no_response_alert_minutes)")
        .eq("user_id", session.session.user.id)
        .maybeSingle();
      
      if (profile && !cancelled) {
        const tenant = (profile as any).tenants;
        const threshold = tenant?.no_response_alert_minutes ?? 5;
        setNoResponseThresholdMinutes(threshold);
      }
    };
    
    loadConfig();
    
    // Escutar mudanças na configuração via realtime
    const ch = supabaseBrowser()
      .channel("tenant-config")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tenants"
        },
        async (payload) => {
          if (cancelled) return;
          // Recarregar configuração quando houver mudança
          await loadConfig();
        }
      )
      .subscribe();
    
    return () => {
      cancelled = true;
      supabaseBrowser().removeChannel(ch);
    };
  }, []);
  
  useEffect(() => {
    const CHECK_INTERVAL_MS = 60 * 1000; // Verificar a cada 1 minuto

    const interval = setInterval(async () => {
      const { data: session } = await supabaseBrowser().auth.getSession();
      if (!session.session) return;

      const { data: profile } = await supabaseBrowser()
        .from("profiles")
        .select("tenant_id")
        .eq("user_id", session.session.user.id)
        .single();

      if (!profile) return;

      // Buscar conversas atribuídas ao atendente atual OU na fila sem resposta há mais de X minutos
      const thresholdMs = noResponseThresholdMinutes * 60 * 1000;
      const thresholdTime = new Date(Date.now() - thresholdMs).toISOString();
      
      const { data: abandoned } = await supabaseBrowser()
        .from("conversations")
        .select("id, contacts(display_name, phone_e164), last_patient_message_at, assigned_user_id, status_fila")
        .eq("tenant_id", (profile as any).tenant_id)
        .not("last_patient_message_at", "is", null)
        .lt("last_patient_message_at", thresholdTime)
        .order("last_patient_message_at", { ascending: true })
        .limit(20);

      if (abandoned && abandoned.length > 0) {
        for (const conv of abandoned) {
          const c = conv as any;
          
          // Filtro: Minhas em atendimento OU qualquer uma na fila
          const isMine = c.status_fila === 'em_atendimento' && c.assigned_user_id === session.session.user.id;
          const isQueue = c.status_fila === 'aguardando_atendimento';
          
          if (!isMine && !isQueue) continue;

          const convId = c.id;
          
          // Evitar notificar a mesma conversa múltiplas vezes
          if (notifiedConversationsRef.current.has(convId)) continue;
          
          const contact = c.contacts;
          const lastMessageTime = new Date(c.last_patient_message_at);
          const minutesAgo = Math.floor((Date.now() - lastMessageTime.getTime()) / (60 * 1000));
          
          addNotification({
            type: "abandoned",
            title: isQueue ? "⚠️ Fila Atrasada" : "⚠️ Conversa Sem Resposta",
            message: `${contact?.display_name || contact?.phone_e164 || "Cliente"} aguardando há ${minutesAgo} min ${isQueue ? '(Fila)' : ''}`,
            conversationId: convId
          });
          
          notifiedConversationsRef.current.add(convId);
        }
      }
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  // Limpar notificações de conversas que foram respondidas (via realtime)
  useEffect(() => {
    const ch = supabaseBrowser()
      .channel("conversation-updates")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations"
        },
        (payload) => {
          const conv = payload.new as any;
          const convId = conv.id;
          
          // Se a conversa foi respondida (last_outbound_at atualizado) ou mudou de status
          if (conv.last_outbound_at || conv.status_fila !== "em_atendimento") {
            // Remover da lista de notificadas
            notifiedConversationsRef.current.delete(convId);
            // Remover notificações relacionadas
            setNotifications((prev) => prev.filter((n) => n.conversationId !== convId || n.type !== "abandoned"));
          }
        }
      )
      .subscribe();

    return () => {
      supabaseBrowser().removeChannel(ch);
    };
  }, []);

  function addNotification(notif: Omit<Notification, "id" | "timestamp" | "read">) {
    const newNotif: Notification = {
      ...notif,
      id: Math.random().toString(36).substring(7),
      timestamp: new Date(),
      read: false
    };
    setNotifications((prev) => [newNotif, ...prev].slice(0, 50)); // Manter apenas últimas 50
    setUnreadCount((prev) => prev + 1);

    // Notificação sonora baseada no tipo
    const playSound = (soundType: string) => {
      try {
        // Usar Web Audio API diretamente (mais confiável que arquivos MP3)
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        gainNode.gain.value = 0.15;
        
        // Frequências diferentes para diferentes tipos de notificação
        switch (soundType) {
          case "new_conversation":
            oscillator.frequency.value = 600;
            oscillator.type = "sine";
            break;
          case "sla_breach":
            oscillator.frequency.value = 800;
            oscillator.type = "sine";
            break;
          case "abandoned":
            oscillator.frequency.value = 400;
            oscillator.type = "square";
            break;
          case "transfer":
            oscillator.frequency.value = 700;
            oscillator.type = "sine";
            break;
          case "unattended":
            oscillator.frequency.value = 600;
            oscillator.type = "square";
            break;
          default:
            oscillator.frequency.value = 500;
            oscillator.type = "sine";
        }
        
        oscillator.start();
        oscillator.stop(ctx.currentTime + 0.15);
      } catch (err) {
        // Silenciar se não conseguir tocar som (navegador não suporta AudioContext)
        console.debug("Não foi possível tocar som de notificação:", err);
      }
    };

    playSound(newNotif.type);

    // Notificação do navegador (se permitido)
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(newNotif.title, {
        body: newNotif.message,
        icon: "/logo.png"
      });
    }
  }

  function markAsRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }

  function markAllAsRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  function removeNotification(id: string) {
    setNotifications((prev) => {
      const notif = prev.find((n) => n.id === id);
      if (notif && !notif.read) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
      return prev.filter((n) => n.id !== id);
    });
  }

  // Estado para controlar banner de permissão
  const [showPermissionBanner, setShowPermissionBanner] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");

  // Verificar permissão de notificações
  useEffect(() => {
    if ("Notification" in window) {
      setNotificationPermission(Notification.permission);
      if (Notification.permission === "default") {
        setShowPermissionBanner(true);
      }
    }
  }, []);

  const unreadNotifications = notifications.filter((n) => !n.read);

  const requestNotificationPermission = async () => {
    if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === "granted") {
        setShowPermissionBanner(false);
        notify("Notificações ativadas! Você receberá alertas de novas mensagens.", "success");
      } else if (permission === "denied") {
        setShowPermissionBanner(false);
        notify("Notificações bloqueadas. Você pode ativar nas configurações do navegador.", "warning");
      }
    }
  };

  return (
    <div className="relative w-full">
      {/* Banner de Permissão de Notificações */}
      {showPermissionBanner && (
        <div className="mb-2 p-3 bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🔔</span>
            <div className="flex-1">
              <div className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                Ativar Notificações
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                Receba alertas de novas mensagens, transferências e conversas sem resposta
              </div>
              <div className="flex gap-2">
                <button
                  onClick={requestNotificationPermission}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-md transition-colors"
                >
                  Ativar Agora
                </button>
                <button
                  onClick={() => setShowPermissionBanner(false)}
                  className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-xs font-semibold rounded-md transition-colors"
                >
                  Agora Não
                </button>
              </div>
            </div>
            <button
              onClick={() => setShowPermissionBanner(false)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => {
          console.log("🔔 Toggling panel", !showPanel);
          setShowPanel(!showPanel);
          if ("Notification" in window && Notification.permission === "default") {
            setShowPermissionBanner(true);
          }
        }}
        className="relative w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border border-gray-200 dark:border-gray-700 flex items-center justify-center gap-2 shadow-sm"
        title={unreadCount > 0 
          ? `Notificações do Sistema: ${unreadCount} notificação${unreadCount > 1 ? 'ões' : ''} não lida${unreadCount > 1 ? 's' : ''} (transferências, conversas sem atendente, SLA, etc.)`
          : "Notificações do Sistema: Alertas de transferências, conversas sem atendente, SLA, avaliações, etc."
        }
      >
        🔔 Notificações
        {notificationPermission === "denied" && (
          <span className="text-[10px] text-red-500" title="Notificações bloqueadas">🚫</span>
        )}
        {notificationPermission === "granted" && (
          <span className="text-[10px] text-green-500" title="Notificações ativadas">✓</span>
        )}
        {unreadCount > 0 && (
          <span 
            className="absolute top-1 right-2 bg-red-500 text-white text-[10px] rounded-full min-w-[1.25rem] h-5 flex items-center justify-center font-bold px-1"
            title={`${unreadCount} notificação${unreadCount > 1 ? 'ões' : ''} não lida${unreadCount > 1 ? 's' : ''} do sistema`}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {showPanel && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowPanel(false)} />
          <div className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-xl z-50 max-h-[600px] flex flex-col min-w-[300px] -ml-4">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-gray-900">
              <div className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                Notificações
                {notificationPermission === "granted" && (
                  <span className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">
                    ✓ Ativadas
                  </span>
                )}
                {notificationPermission === "denied" && (
                  <span className="text-[10px] bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded-full font-medium">
                    🚫 Bloqueadas
                  </span>
                )}
                {notificationPermission === "default" && (
                  <button
                    onClick={requestNotificationPermission}
                    className="text-[10px] bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 px-2 py-1 rounded-full font-medium hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
                  >
                    🔔 Ativar
                  </button>
                )}
                <button 
                   onClick={(e) => {
                     e.stopPropagation();
                     console.log("🔊 Testing sound...");
                     addNotification({
                        type: "new_conversation",
                        title: "Teste de Som",
                        message: "Se você ouviu isso, o som está funcionando!",
                        conversationId: undefined
                     });
                   }}
                   className="text-[10px] bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 px-2 py-1 rounded text-gray-600 dark:text-gray-400 transition-colors"
                   title="Testar notificação sonora"
                >
                  🔊 Testar
                </button>
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors font-medium"
                >
                  Marcar todas como lidas
                </button>
              )}
            </div>
            <div className="flex-1 overflow-auto bg-white dark:bg-gray-900">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">Nenhuma notificação</div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-800">
                  {notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors ${
                        !notif.read ? "bg-indigo-50/50 dark:bg-indigo-900/10" : "bg-white dark:bg-gray-900"
                      }`}
                      onClick={() => {
                        markAsRead(notif.id);
                        if (notif.conversationId) {
                          // Navegar para a conversa se possível
                          window.location.href = `/?conversation=${notif.conversationId}`;
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg">
                              {notif.type === "new_conversation" && "💬"}
                              {notif.type === "sla_warning" && "⚠️"}
                              {notif.type === "sla_breach" && "🔴"}
                              {notif.type === "rating" && "⭐"}
                              {notif.type === "abandoned" && "⏰"}
                              {notif.type === "transfer" && "📥"}
                              {notif.type === "unattended" && "⚠️"}
                            </span>
                            <span className="font-semibold text-sm text-gray-900 dark:text-white">{notif.title}</span>
                            {!notif.read && <span className="w-2 h-2 bg-blue-500 rounded-full" />}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">{notif.message}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {notif.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeNotification(notif.id);
                          }}
                          className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

