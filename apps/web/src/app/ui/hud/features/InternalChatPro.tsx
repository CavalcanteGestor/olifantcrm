"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { notify } from "@/lib/toastBus";

type InternalMessage = {
  id: string;
  from_user_id: string;
  to_user_id: string | null;
  conversation_id: string | null;
  message: string;
  read_at: string | null;
  created_at: string;
};

export function InternalChatPro({ conversationId }: { conversationId: string }) {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = supabaseBrowser();
      const { data: session } = await sb.auth.getSession();
      const user = session.session?.user;
      if (!user) return;
      if (!cancelled) setCurrentUserId(user.id);
      const { data: profile } = await sb.from("profiles").select("tenant_id").eq("user_id", user.id).maybeSingle();
      const tid = (profile as any)?.tenant_id as string | undefined;
      if (!cancelled) setTenantId(tid ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const messagesQ = useQuery<InternalMessage[], Error>({
    queryKey: ["hud-internal", conversationId],
    queryFn: async () => {
      const sb = supabaseBrowser();
      const { data, error } = await sb
        .from("internal_messages")
        .select("id,from_user_id,to_user_id,conversation_id,message,read_at,created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []) as any;
    },
    enabled: !!conversationId,
    staleTime: 30000, // Cache por 30s
    refetchOnWindowFocus: false
  });

  // 🔥 REALTIME: Escutar novas mensagens internas
  useEffect(() => {
    if (!conversationId || !tenantId) return;

    const sb = supabaseBrowser();
    const channel = sb
      .channel(`internal-chat-pro-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'internal_messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        () => {
          // Nova mensagem, atualizar
          qc.invalidateQueries({ queryKey: ['internal-messages-pro', conversationId] });
        }
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [conversationId, tenantId, qc]);

  const grouped = useMemo(() => messagesQ.data ?? [], [messagesQ.data]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [grouped.length]);

  async function send() {
    if (!tenantId || !currentUserId) {
      notify("Sessão não carregada para enviar mensagem interna.", "warning");
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      const sb = supabaseBrowser();
      const { error } = await sb.from("internal_messages").insert({
        tenant_id: tenantId,
        from_user_id: currentUserId,
        to_user_id: null,
        conversation_id: conversationId,
        message: trimmed
      } as any);
      if (error) throw new Error(error.message);
      setText("");
      await qc.invalidateQueries({ queryKey: ["hud-internal", conversationId] });
    } catch (e: any) {
      notify(String(e?.message || "Falha ao enviar mensagem interna."), "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800">
        <div className="text-sm font-semibold text-gray-900 dark:text-white">Chat Interno</div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Anotações internas desta conversa</div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {grouped.length === 0 && (
          <div className="text-sm text-gray-500 dark:text-gray-400">Nenhuma mensagem interna ainda.</div>
        )}
        {grouped.map((m) => {
          const isMe = currentUserId && m.from_user_id === currentUserId;
          return (
            <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${
                  isMe
                    ? "bg-indigo-600 text-white rounded-tr-sm"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-tl-sm"
                }`}
              >
                <div>{m.message}</div>
                <div className={`text-[10px] mt-1 ${isMe ? "text-indigo-200" : "text-gray-500 dark:text-gray-400"}`}>
                  {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-gray-200 dark:border-gray-800">
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escreva uma nota interna..."
            className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={sending}
          />
          <button
            onClick={send}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={sending}
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
