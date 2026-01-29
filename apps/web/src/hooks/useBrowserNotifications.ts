"use client";

import { useEffect, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

// Evento customizado para abrir conversa quando notificação é clicada
declare global {
  interface WindowEventMap {
    openConversation: CustomEvent<{ conversationId: string }>;
  }
}

type NotificationOptions = {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  data?: any;
};

export function useBrowserNotifications(options?: {
  selectedConversationId?: string | null;
  onConversationSelect?: (conversationId: string) => void;
}) {
  const permissionRef = useRef<NotificationPermission>("default");
  const channelRef = useRef<any>(null);
  const selectedIdRef = useRef<string | null>(options?.selectedConversationId || null);

  // Atualizar selectedId quando mudar
  useEffect(() => {
    selectedIdRef.current = options?.selectedConversationId || null;
  }, [options?.selectedConversationId]);

  useEffect(() => {
    // Solicitar permissão de notificação
    if ("Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission().then((permission) => {
          permissionRef.current = permission;
        });
      } else {
        permissionRef.current = Notification.permission;
      }
    }

    // Escutar novas mensagens via Supabase Realtime
    const setupRealtime = async () => {
      const { data: session } = await supabaseBrowser().auth.getSession();
      if (!session.session) return;

      const { data: profile } = await supabaseBrowser()
        .from("profiles")
        .select("tenant_id")
        .eq("user_id", session.session.user.id)
        .maybeSingle();

      if (!profile) return;
      const tenantId = (profile as any).tenant_id;

      // Canal para escutar novas mensagens (WhatsApp)
      const channel = supabaseBrowser()
        .channel("notifications-messages")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `tenant_id=eq.${tenantId}`,
          },
          async (payload) => {
            const message = payload.new as any;
            if (message.direction !== "in") return;

            const playNotificationSound = () => {
              try {
                const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3");
                audio.volume = 0.5;
                audio.play().catch(e => console.warn("Som bloqueado pelo navegador até interação do usuário:", e));
              } catch (err) {
                console.error("Erro ao tocar som:", err);
              }
            };

            const shouldNotify = permissionRef.current === "granted";

            // Buscar informações da conversa e contato
            const { data: conversation } = await supabaseBrowser()
              .from("conversations")
              .select("id, assigned_user_id, status_fila, contacts(display_name, phone_e164)")
              .eq("id", message.conversation_id)
              .single();

            if (!conversation) return;

            const isAssignedToMe = (conversation as any).assigned_user_id === session.session.user.id;
            const isInProgress = (conversation as any).status_fila === "em_atendimento";

            if (isAssignedToMe && isInProgress) {
              playNotificationSound();
            }

            if (shouldNotify) {
              const contactName = (conversation as any)?.contacts?.display_name || (conversation as any)?.contacts?.phone_e164 || "Contato";
              let messageText = message.type === "text" ? (message.body_json?.text || message.body_json?.text?.body || "Nova mensagem") : `Mensagem ${message.type}`;
              const preview = messageText.length > 100 ? messageText.substring(0, 100) + "..." : messageText;

              const notification = new Notification(`Nova mensagem de ${contactName}`, {
                body: preview,
                icon: "/logo.png",
                tag: message.conversation_id,
                data: { conversationId: message.conversation_id },
              });

              notification.onclick = () => {
                window.focus();
                notification.close();
                if (options?.onConversationSelect) {
                  options.onConversationSelect(message.conversation_id);
                } else {
                  window.dispatchEvent(new CustomEvent("openConversation", { detail: { conversationId: message.conversation_id } }));
                }
              };
            }
          }
        )
        .subscribe();

      // Canal para escutar novas mensagens do CHAT INTERNO
      const internalChannel = supabaseBrowser()
        .channel("notifications-internal")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "internal_messages",
            filter: `tenant_id=eq.${tenantId}`,
          },
          async (payload) => {
            const msg = payload.new as any;

            // Só notificar se não fui eu que enviei
            if (msg.from_user_id === session.session.user.id) return;

            // Só notificar se for para mim ou para todos
            const isForMe = msg.to_user_id === session.session.user.id;
            const isForEveryone = msg.to_user_id === null;

            if (!isForMe && !isForEveryone) return;

            // Tocar som (sempre que chegar msg interna relevante)
            try {
              const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2857/2857-preview.mp3"); // Som diferente para chat interno
              audio.volume = 0.4;
              audio.play().catch(() => { });
            } catch (e) { }

            if (permissionRef.current === "granted") {
              // Buscar nome de quem enviou
              const { data: sender } = await supabaseBrowser()
                .from("profiles")
                .select("full_name")
                .eq("user_id", msg.from_user_id)
                .single();

              const senderName = (sender as any)?.full_name || "Colega";

              const notification = new Notification(`Chat Interno: ${senderName}`, {
                body: msg.message,
                icon: "/logo.png",
                tag: "internal-chat",
              });

              notification.onclick = () => {
                window.focus();
                notification.close();
                // Opcional: abrir o modal do chat interno
                // Como o Hud controla o estado do chat, precisaria passar um callback ou evento
                window.dispatchEvent(new CustomEvent("openInternalChat"));
              };
            }
          }
        )
        .subscribe();

      channelRef.current = [channel, internalChannel];
    };

    setupRealtime();

    return () => {
      if (channelRef.current) {
        if (Array.isArray(channelRef.current)) {
          channelRef.current.forEach(ch => supabaseBrowser().removeChannel(ch));
        } else {
          supabaseBrowser().removeChannel(channelRef.current);
        }
      }
    };
  }, []);

  // Função para criar notificação manualmente (para lembretes de tarefas)
  const showNotification = (options: NotificationOptions) => {
    if (permissionRef.current !== "granted") {
      console.warn("Permissão de notificação não concedida");
      return null;
    }

    try {
      const notification = new Notification(options.title, {
        body: options.body,
        icon: options.icon || "/logo.png",
        tag: options.tag,
        data: options.data,
      });

      return notification;
    } catch (error) {
      console.error("Erro ao criar notificação:", error);
      return null;
    }
  };

  return {
    permission: permissionRef.current,
    showNotification,
  };
}
