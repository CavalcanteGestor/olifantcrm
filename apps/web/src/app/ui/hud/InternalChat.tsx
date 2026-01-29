"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { notify } from "@/lib/toastBus";
import { MessageSquare, Users, User, Search, Paperclip, Send, Check, CheckCheck } from "lucide-react";
import MessageMedia from "./MessageMedia";

type InternalMessage = {
  id: string;
  from_user_id: string;
  to_user_id: string | null;
  conversation_id: string | null;
  message: string;
  read_at: string | null;
  created_at: string;
  from_profile?: { full_name: string; avatar_url?: string };
  to_profile?: { full_name: string };
};

type ChatUser = {
  user_id: string;
  full_name: string;
  avatar_url?: string;
  unread_count?: number;
  last_message_at?: string;
};

export default function InternalChat({ 
  conversationId, 
  onClose 
}: { 
  conversationId?: string | null;
  onClose?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"notes" | "team">(conversationId ? "notes" : "team");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  // 1. Init Session
  useEffect(() => {
    supabaseBrowser().auth.getSession().then(({ data }) => {
      const session = data.session;
      if (session) {
        setAccessToken(session.access_token);
        const user = session.user;
        setCurrentUserId(user.id);
        supabaseBrowser()
          .from("profiles")
          .select("tenant_id")
          .eq("user_id", user.id)
          .single()
          .then(({ data: p }) => {
            if (p) setTenantId((p as any).tenant_id);
          });
      }
    });
  }, []);

  // 2. Fetch Users (Team)
  const usersQ = useQuery({
    queryKey: ["internal-users", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabaseBrowser()
        .from("profiles")
        .select("user_id, full_name")
        .eq("tenant_id", tenantId)
        .neq("user_id", currentUserId) // Don't list myself
        .order("full_name");
      
      if (error) throw error;
      return data as ChatUser[];
    },
    enabled: !!tenantId && !!currentUserId
  });

  // 3. Fetch Messages
  // If Tab = notes -> fetch by conversation_id
  // If Tab = team -> fetch by (from=me & to=selected) OR (from=selected & to=me)
  const messagesQ = useQuery({
    queryKey: ["internal-messages", activeTab, conversationId, selectedUserId],
    queryFn: async () => {
      if (!tenantId) return [];
      
      let query = supabaseBrowser()
        .from("internal_messages")
        .select('*')
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true });

      if (activeTab === "notes") {
        if (!conversationId) return [];
        query = query.eq("conversation_id", conversationId);
      } else {
        if (!selectedUserId || !currentUserId) return [];
        // DM Logic
        query = query.or(`and(from_user_id.eq.${currentUserId},to_user_id.eq.${selectedUserId}),and(from_user_id.eq.${selectedUserId},to_user_id.eq.${currentUserId})`);
      }

      const { data: messages, error } = await query.limit(100);
      if (error) throw error;

      // Manual join for profiles to avoid FK constraint naming issues
      if (messages && messages.length > 0) {
        const userIds = new Set<string>();
        messages.forEach((m: any) => {
          if (m.from_user_id) userIds.add(m.from_user_id);
          if (m.to_user_id) userIds.add(m.to_user_id);
        });

        if (userIds.size > 0) {
          const { data: profiles } = await supabaseBrowser()
            .from("profiles")
            .select("user_id, full_name")
            .in("user_id", Array.from(userIds));
          
          const profileMap = new Map();
          profiles?.forEach((p: any) => profileMap.set(p.user_id, p));

          return messages.map((m: any) => ({
            ...m,
            from_profile: profileMap.get(m.from_user_id) || { full_name: "Desconhecido" },
            to_profile: profileMap.get(m.to_user_id) || { full_name: "Desconhecido" }
          })) as InternalMessage[];
        }
      }

      return messages as InternalMessage[];
    },
    enabled: !!tenantId && (activeTab === "notes" ? !!conversationId : !!selectedUserId),
    staleTime: 30000, // Cache por 30s
    refetchOnWindowFocus: false
  });

  // 🔥 REALTIME: Escutar novas mensagens internas
  useEffect(() => {
    if (!tenantId) return;

    const channel = supabaseBrowser()
      .channel('internal-chat-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'internal_messages',
          filter: `tenant_id=eq.${tenantId}`
        },
        () => {
          // Nova mensagem interna, atualizar
          qc.invalidateQueries({ queryKey: ['internal-messages'] });
        }
      )
      .subscribe();

    return () => {
      supabaseBrowser().removeChannel(channel);
    };
  }, [tenantId, qc]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messagesQ.data) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messagesQ.data, activeTab, selectedUserId]);

  // Mark as read
  useEffect(() => {
    if (!messagesQ.data || !currentUserId) return;
    const unread = messagesQ.data
      .filter(m => m.to_user_id === currentUserId && !m.read_at)
      .map(m => m.id);
      
    if (unread.length > 0) {
      supabaseBrowser()
        .from("internal_messages")
        .update({ read_at: new Date().toISOString() })
        .in("id", unread)
        .then(() => qc.invalidateQueries({ queryKey: ["internal-messages"] }));
    }
  }, [messagesQ.data, currentUserId]);

  const handleSend = async () => {
    if (!message.trim() || !tenantId || !currentUserId) return;
    
    setSending(true);
    try {
      const payload: any = {
        tenant_id: tenantId,
        from_user_id: currentUserId,
        message: message.trim()
      };

      if (activeTab === "notes") {
        if (!conversationId) throw new Error("Sem contexto de conversa");
        payload.conversation_id = conversationId;
        payload.to_user_id = null; // Broadcast in notes? Or null? Usually null for notes.
      } else {
        if (!selectedUserId) throw new Error("Selecione um usuário");
        payload.to_user_id = selectedUserId;
        payload.conversation_id = null;
      }

      const { error } = await supabaseBrowser().from("internal_messages").insert(payload);
      if (error) throw error;

      setMessage("");
      await qc.invalidateQueries({ queryKey: ["internal-messages"] });
    } catch (err: any) {
      notify(err.message || "Erro ao enviar", "error");
    } finally {
      setSending(false);
    }
  };

  // Group messages by Date
  const groupedMessages = useMemo(() => {
    const msgs = messagesQ.data || [];
    const groups: { date: string; msgs: InternalMessage[] }[] = [];
    
    msgs.forEach(m => {
      const date = new Date(m.created_at).toLocaleDateString("pt-BR", {
        day: "2-digit", month: "long"
      });
      if (groups.length === 0 || groups[groups.length - 1].date !== date) {
        groups.push({ date, msgs: [] });
      }
      groups[groups.length - 1].msgs.push(m);
    });
    return groups;
  }, [messagesQ.data]);

  const filteredUsers = (usersQ.data || []).filter(u => 
    u.full_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
        <h2 className="font-bold text-lg">Chat Interno</h2>
        {onClose && (
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            ✕
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-800">
        {conversationId && (
          <button
            onClick={() => setActiveTab("notes")}
            className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
              activeTab === "notes" 
                ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/10" 
                : "text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <MessageSquare className="w-4 h-4" />
              <span>Notas do Ticket</span>
            </div>
            {activeTab === "notes" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400" />
            )}
          </button>
        )}
        <button
          onClick={() => setActiveTab("team")}
          className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
            activeTab === "team" 
              ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/10" 
              : "text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800"
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Users className="w-4 h-4" />
            <span>Equipe</span>
          </div>
          {activeTab === "team" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400" />
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
        {activeTab === "team" && !selectedUserId ? (
          // User List View
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-gray-100 dark:border-gray-800">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar colega..."
                  className="w-full pl-9 pr-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {usersQ.isLoading ? (
                <div className="p-4 text-center text-gray-500 text-sm">Carregando equipe...</div>
              ) : filteredUsers.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-sm">Ninguém encontrado.</div>
              ) : (
                filteredUsers.map(u => (
                  <button
                    key={u.user_id}
                    onClick={() => setSelectedUserId(u.user_id)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-all text-left group"
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                      {u.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-white group-hover:text-indigo-600 transition-colors">
                        {u.full_name}
                      </div>
                      <div className="text-xs text-gray-500">Toque para conversar</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          // Chat View (Notes or DM)
          <div className="flex-1 flex flex-col h-full">
            {activeTab === "team" && (
              <div className="flex items-center gap-2 p-3 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm z-10">
                <button 
                  onClick={() => setSelectedUserId(null)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
                >
                  ←
                </button>
                <div className="font-semibold text-sm">
                  {usersQ.data?.find(u => u.user_id === selectedUserId)?.full_name || "Chat"}
                </div>
              </div>
            )}
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-gray-50/50 dark:bg-gray-950">
              {messagesQ.isLoading ? (
                <div className="flex justify-center p-4"><div className="animate-spin w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full"/></div>
              ) : groupedMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-2 opacity-60">
                  <MessageSquare className="w-12 h-12" />
                  <p className="text-sm font-medium">Nenhuma mensagem ainda</p>
                  <p className="text-xs">Comece a conversa agora mesmo</p>
                </div>
              ) : (
                groupedMessages.map((group) => (
                  <div key={group.date} className="space-y-4">
                    <div className="flex items-center justify-center">
                      <div className="bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[10px] px-2 py-1 rounded-full font-medium">
                        {group.date}
                      </div>
                    </div>
                    <div className="space-y-2">
                      {group.msgs.map((msg) => {
                        const isMe = msg.from_user_id === currentUserId;
                        return (
                          <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"} group/msg`}>
                            {!isMe && (
                              <div className="w-6 h-6 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center text-[10px] text-white font-bold mr-2 mt-1 shrink-0">
                                {msg.from_profile?.full_name?.[0] || "?"}
                              </div>
                            )}
                            <div className={`max-w-[85%] flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                              {!isMe && activeTab === "notes" && (
                                <span className="text-[10px] text-gray-500 ml-1 mb-0.5">{msg.from_profile?.full_name}</span>
                              )}
                              <div className={`
                                px-4 py-2.5 rounded-2xl text-sm shadow-sm relative transition-all
                                ${isMe 
                                  ? "bg-indigo-600 text-white rounded-tr-sm hover:bg-indigo-700" 
                                  : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-tl-sm border border-gray-100 dark:border-gray-700 hover:shadow-md"
                                }
                              `}>
                                <div className="whitespace-pre-wrap leading-relaxed">
                                  {(() => {
                                    const mediaMatch = msg.message.match(/\[media_asset:([a-f0-9-]+)\]/i);
                                    const mediaId = mediaMatch ? mediaMatch[1] : null;
                                    const typeMatch = msg.message.match(/\[Encaminhado - (\w+)\]/i);
                                    const inferredType = typeMatch ? typeMatch[1] : "image";

                                    if (mediaId && accessToken) {
                                       const cleanText = msg.message
                                         .replace(/\[media_asset:[a-f0-9-]+\]/i, "")
                                         .trim();
                                       return (
                                         <div className="flex flex-col gap-2">
                                           {cleanText && <div>{cleanText}</div>}
                                           <MessageMedia 
                                             accessToken={accessToken}
                                             messageId={msg.id}
                                             messageType={inferredType}
                                             bodyJson={{ media_asset_id: mediaId }}
                                           />
                                         </div>
                                       );
                                    }
                                    return msg.message;
                                  })()}
                                </div>
                                <div className={`text-[9px] mt-1 flex items-center gap-1 ${isMe ? "text-indigo-200 justify-end" : "text-gray-400 justify-start"}`}>
                                  {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                  {isMe && (
                                    msg.read_at ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
              <div className="flex items-end gap-2 bg-gray-100 dark:bg-gray-800 p-2 rounded-xl border border-transparent focus-within:border-indigo-500 transition-colors">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Digite sua mensagem..."
                  className="flex-1 bg-transparent border-none focus:ring-0 resize-none text-sm max-h-32 min-h-[24px] py-1 px-2 text-gray-900 dark:text-gray-100 placeholder-gray-500"
                  rows={1}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = "auto";
                    target.style.height = Math.min(target.scrollHeight, 128) + "px";
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={!message.trim() || sending}
                  className={`
                    p-2 rounded-lg transition-all flex-shrink-0
                    ${!message.trim() || sending 
                      ? "text-gray-400 bg-transparent" 
                      : "text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm hover:scale-105 active:scale-95"
                    }
                  `}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <div className="text-[10px] text-center text-gray-400 mt-2">
                Shift + Enter para pular linha
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
