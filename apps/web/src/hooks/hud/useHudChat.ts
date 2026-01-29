import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import { apiSendText } from "@/lib/api";
import { notify } from "@/lib/toastBus";
import { useEffect } from 'react';

function extractText(bodyJson: any): string {
  if (!bodyJson || typeof bodyJson !== "object") return "";
  if (typeof bodyJson.text === "string") return bodyJson.text;
  if (bodyJson.text && typeof bodyJson.text === "object" && typeof bodyJson.text.body === "string") return bodyJson.text.body;
  if (bodyJson.message && typeof bodyJson.message === "object") return extractText(bodyJson.message);
  if (bodyJson.body && typeof bodyJson.body === "string") return bodyJson.body;
  return "";
}

export function useHudChat(conversationId: string | null, accessToken: string | null) {
  const supabase = supabaseBrowser();
  const queryClient = useQueryClient();

  const messagesQuery = useQuery<any[], Error>({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      
      // 1. Descobrir o contact_id da conversa atual
      const { data: convData, error: convError } = await supabase
        .from('conversations')
        .select('contact_id')
        .eq('id', conversationId)
        .single();
        
      if (convError || !convData?.contact_id) {
        // Fallback: se der erro, busca só desta conversa mesmo
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true })
          .limit(200); // Limitar a 200 mensagens mais recentes
          
        if (error) throw new Error(error.message);
        return (data || []).map((msg: any) => ({ ...msg, content: extractText(msg.body_json) }));
      }

      // 2. Buscar TODAS as conversas desse contato
      const { data: allConvs } = await supabase
        .from('conversations')
        .select('id')
        .eq('contact_id', convData.contact_id);
        
      const allConvIds = (allConvs || []).map(c => c.id);

      // 3. Buscar mensagens de TODAS as conversas (limitado)
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .in('conversation_id', allConvIds)
        .order('created_at', { ascending: true })
        .limit(200); // Limitar a 200 mensagens mais recentes

      if (error) {
        const message = String((error as any)?.message ?? '');
        if (/abort|aborted|AbortError/i.test(message)) {
          return (queryClient.getQueryData(['messages', conversationId]) ?? []) as any[];
        }
        throw new Error(message || 'query_failed');
      }
      
      return (data || []).map((msg: any) => ({ ...msg, content: extractText(msg.body_json) }));
    },
    enabled: !!conversationId,
    placeholderData: keepPreviousData,
    staleTime: 30000, // Cache por 30s
    refetchOnWindowFocus: false
  });

  // 🔥 REALTIME: Escutar novas mensagens
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          // Adicionar nova mensagem ao cache
          queryClient.setQueryData(['messages', conversationId], (old: any[] = []) => {
            const newMsg = { ...payload.new as any, content: extractText((payload.new as any).body_json) };
            // Evitar duplicatas
            if (old.some((m: any) => m.id === newMsg.id)) return old;
            return [...old, newMsg];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          // Atualizar mensagem existente (ex: status de entrega)
          queryClient.setQueryData(['messages', conversationId], (old: any[] = []) => {
            return old.map(m => 
              m.id === payload.new.id 
                ? { ...payload.new, content: extractText(payload.new.body_json) }
                : m
            );
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, supabase, queryClient]);

  const sendMessageMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!conversationId) return;
      if (!accessToken) throw new Error("missing_auth");
      const trimmed = String(text || "").trim();
      if (!trimmed) return;

      const nowIso = new Date().toISOString();
      queryClient.setQueryData(['messages', conversationId], (prev: any) => {
        const arr = Array.isArray(prev) ? prev : [];
        return [
          ...arr,
          {
            id: `tmp_${nowIso}`,
            conversation_id: conversationId,
            direction: "out",
            type: "text",
            body_json: { text: trimmed },
            status: "queued",
            created_at: nowIso,
            content: trimmed
          }
        ];
      });

      const res = await apiSendText({ accessToken, conversationId, text: trimmed });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
    onError: (err: any) => {
      if (!conversationId) return;
      queryClient.setQueryData(['messages', conversationId], (prev: any) => {
        const arr = Array.isArray(prev) ? prev : [];
        if (arr.length === 0) return arr;
        const last = arr[arr.length - 1];
        if (!last || typeof last !== "object") return arr;
        if (typeof last.id !== "string" || !last.id.startsWith("tmp_")) return arr;
        const updated = { ...last, status: "failed" };
        return [...arr.slice(0, -1), updated];
      });

      const message = String(err?.message || "");
      const hint = String(err?.hint || "");
      const userMessage = String(err?.userMessage || err?.details || "");

      if (message === "no_active_shift") {
        notify(userMessage || "Você precisa iniciar seu turno para enviar mensagens.", "warning", 7000);
        return;
      }

      if (message === "outside_24h_window" || hint === "use_template") {
        notify("Esta conversa está fora da janela de 24 horas. Use um template do WhatsApp.", "warning", 8000);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("hud:openTemplate", { detail: { conversationId } }));
        }
        return;
      }

      if (userMessage) {
        notify(userMessage, "error", 8000);
      }
    }
  });

  return {
    messages: (messagesQuery.data ?? []) as any[],
    isLoading: messagesQuery.isLoading,
    sendMessage: sendMessageMutation.mutate
  };
}
