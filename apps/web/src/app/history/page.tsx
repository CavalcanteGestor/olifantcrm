"use client";

import { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { apiSendText, apiTransferConversation } from "@/lib/api";
import MessageMedia from "@/app/ui/hud/MessageMedia";
import TemplateSelector from "@/app/ui/hud/TemplateSelector";
import TemplateImage from "@/app/ui/hud/TemplateImage";
import { notify } from "@/lib/toastBus";
import { Search, ArrowLeft, Send, Paperclip, Smile } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

function HistoryPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Função para mostrar toast
  const showToast = (message: string, type: any = "info", duration?: number) => notify(message, type, duration);

  const urlConversationId = searchParams.get("conversationId") || searchParams.get("conversation");
  const urlUserId = searchParams.get("userId");
  const filterUserId = useMemo(() => {
    if (!urlUserId) return null;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(urlUserId) ? urlUserId : null;
  }, [urlUserId]);

  useEffect(() => {
    if (!urlConversationId) return;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(urlConversationId)) return;
    setSelectedConversationId(urlConversationId);
  }, [urlConversationId]);

  const selectConversation = (conversationId: string) => {
    setSelectedConversationId(conversationId);
    const params = new URLSearchParams(searchParams.toString());
    params.set("conversationId", conversationId);
    if (filterUserId) params.set("userId", filterUserId);
    else params.delete("userId");
    router.replace(`/history?${params.toString()}`);
  };

  // Buscar sessão e token
  useEffect(() => {
    (async () => {
      const { data: session } = await supabaseBrowser().auth.getSession();
      if (!session.session) {
        router.replace("/login");
        return;
      }
      setAccessToken(session.session.access_token);
      setMeId(session.session.user.id);
    })();
  }, [router]);

  // Buscar todas as conversas do tenant e agrupar por contato
  const conversationsQ = useQuery({
    queryKey: ["all-conversations-history-page", searchQuery, filterUserId],
    queryFn: async () => {
      const { data: session } = await supabaseBrowser().auth.getSession();
      if (!session.session) return [];

      const { data: profile } = await supabaseBrowser()
        .from("profiles")
        .select("tenant_id")
        .eq("user_id", session.session.user.id)
        .maybeSingle();

      if (!profile) return [];

      let query = supabaseBrowser()
        .from("conversations")
        .select(`
          id,
          contact_id,
          status_fila,
          created_at,
          updated_at,
          last_patient_message_at,
          last_outbound_at,
          current_stage_id,
          assigned_user_id,
          contacts(id, display_name, phone_e164, profile_picture_url),
          funnel_stages(name)
        `)
        .eq("tenant_id", (profile as any).tenant_id)
        .order("updated_at", { ascending: false })
        .limit(1000);

      if (filterUserId) {
        query = query.eq("assigned_user_id", filterUserId);
      }

      // Aplicar busca se houver
      if (searchQuery.trim().length >= 2) {
        const { data: contacts } = await supabaseBrowser()
          .from("contacts")
          .select("id")
          .eq("tenant_id", (profile as any).tenant_id)
          .or(`display_name.ilike.%${searchQuery}%,phone_e164.ilike.%${searchQuery}%`);

        if (contacts && contacts.length > 0) {
          query = query.in(
            "contact_id",
            (contacts as any[]).map((c: any) => c.id)
          );
        } else {
          return [];
        }
      }

      const { data: conversations } = await query;

      // Buscar profiles separadamente
      const assignedUserIds = [...new Set((conversations || []).filter((c: any) => c.assigned_user_id).map((c: any) => c.assigned_user_id))];
      let assignedUsersMap = new Map<string, { full_name: string }>();
      if (assignedUserIds.length > 0) {
        const { data: profiles } = await supabaseBrowser()
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", assignedUserIds);
        if (profiles) {
          profiles.forEach((p: any) => {
            assignedUsersMap.set(p.user_id, { full_name: p.full_name || "Sem nome" });
          });
        }
      }

      const computeLastActivityAt = (c: any) => {
        const candidates = [c.last_patient_message_at, c.last_outbound_at, c.updated_at, c.created_at]
          .filter(Boolean)
          .map((iso: string) => new Date(iso).getTime())
          .filter((n: number) => Number.isFinite(n));
        return candidates.length > 0 ? new Date(Math.max(...candidates)).toISOString() : c.created_at;
      };

      const enriched = (conversations || []).map((c: any) => ({
        ...c,
        last_activity_at: computeLastActivityAt(c),
        assigned_profiles: c.assigned_user_id ? assignedUsersMap.get(c.assigned_user_id) || null : null
      }));

      // AGRUPAR POR CONTATO: Manter apenas a conversa mais recente de cada contato
      const contactMap = new Map<string, any>();
      enriched.forEach((conv: any) => {
        const contactId = conv.contact_id;
        if (!contactId) return;
        
        const existing = contactMap.get(contactId);
        if (!existing) {
          contactMap.set(contactId, conv);
        } else {
          // Manter a conversa com atividade mais recente
          const existingTime = new Date(existing.last_activity_at).getTime();
          const currentTime = new Date(conv.last_activity_at).getTime();
          if (currentTime > existingTime) {
            contactMap.set(contactId, conv);
          }
        }
      });

      // Converter de volta para array e ordenar
      const grouped = Array.from(contactMap.values());
      grouped.sort((a: any, b: any) => {
        const ta = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
        const tb = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
        return tb - ta;
      });

      return grouped;
    },
    enabled: !!accessToken
  });

  // Buscar mensagens de TODAS as conversas do contato selecionado
  const messagesQ = useQuery({
    queryKey: ["history-messages", selectedConversationId],
    queryFn: async () => {
      if (!selectedConversationId || !accessToken) return [];

      const { data: session } = await supabaseBrowser().auth.getSession();
      if (!session.session) return [];

      const { data: profile } = await supabaseBrowser()
        .from("profiles")
        .select("tenant_id")
        .eq("user_id", session.session.user.id)
        .maybeSingle();

      if (!profile) return [];

      // 1. Buscar a conversa selecionada para obter o contact_id
      const { data: selectedConv } = await supabaseBrowser()
        .from("conversations")
        .select("contact_id")
        .eq("id", selectedConversationId)
        .eq("tenant_id", (profile as any).tenant_id)
        .maybeSingle();

      if (!selectedConv || !selectedConv.contact_id) return [];

      // 2. Buscar TODAS as conversas deste contato
      const { data: allContactConversations } = await supabaseBrowser()
        .from("conversations")
        .select("id")
        .eq("tenant_id", (profile as any).tenant_id)
        .eq("contact_id", selectedConv.contact_id);

      if (!allContactConversations || allContactConversations.length === 0) return [];

      const conversationIds = allContactConversations.map((c: any) => c.id);

      // 3. Buscar TODAS as mensagens de TODAS as conversas deste contato
      let allMessages: any[] = [];
      let hasMore = true;
      let offset = 0;
      const pageSize = 1000; // Buscar em lotes de 1000

      while (hasMore) {
        const { data: messages, error } = await supabaseBrowser()
          .from("messages")
          .select(`
            id,
            type,
            direction,
            body_json,
            created_at,
            status,
            sent_by_user_id,
            conversation_id
          `)
          .eq("tenant_id", (profile as any).tenant_id)
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;

        if (messages && messages.length > 0) {
          allMessages = [...allMessages, ...messages];
          offset += pageSize;
          hasMore = messages.length === pageSize; // Se retornou menos que pageSize, não há mais
        } else {
          hasMore = false;
        }
      }

      // 4. Buscar profiles separadamente
      const userIds = [...new Set(allMessages.filter((m: any) => m.sent_by_user_id).map((m: any) => m.sent_by_user_id))];
      let profilesMap = new Map<string, { full_name: string }>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabaseBrowser()
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds);
        if (profiles) {
          profiles.forEach((p: any) => {
            profilesMap.set(p.user_id, { full_name: p.full_name || "Sem nome" });
          });
        }
      }

      // 5. Adicionar profiles aos resultados e retornar ordenado por data
      return allMessages.map((m: any) => ({
        ...m,
        profiles: m.sent_by_user_id ? profilesMap.get(m.sent_by_user_id) || null : null
      }));
    },
    enabled: !!accessToken && !!selectedConversationId
  });

  // Buscar dados da conversa selecionada
  const selectedConversation = conversationsQ.data?.find((c: any) => c.id === selectedConversationId) as any;

  // Verificar se está dentro de 24 horas
  const isWithin24Hours = (): boolean => {
    if (!selectedConversation) return true; // Se não tem conversa selecionada, permitir (será validado depois)

    // Se a conversa não está finalizada, sempre permitir
    if (selectedConversation.status_fila !== "finalizado") return true;

    const lastPatientMessage = selectedConversation.last_patient_message_at
      ? new Date(selectedConversation.last_patient_message_at)
      : null;

    if (!lastPatientMessage) return false;

    const hoursSinceLastMessage = (Date.now() - lastPatientMessage.getTime()) / (1000 * 60 * 60);
    return hoursSinceLastMessage <= 24;
  };

  // Função para ativar conversa automaticamente
  const activateConversation = async () => {
    if (!selectedConversationId || !accessToken || !meId) return;

    try {
      // Associar conversa ao usuário atual se não estiver associada
      if (!selectedConversation?.assigned_user_id || selectedConversation.assigned_user_id !== meId) {
        try {
          await apiTransferConversation({
            accessToken,
            conversationId: selectedConversationId,
            userId: meId,
            reason: "Resposta via histórico"
          });
        } catch (transferErr: any) {
          console.error("Erro ao associar conversa:", transferErr);
        }
      }

      // Ativar conversa (mudar status para em_atendimento)
      const { data: session } = await supabaseBrowser().auth.getSession();
      if (session.session) {
        const { data: profile } = await supabaseBrowser()
          .from("profiles")
          .select("tenant_id")
          .eq("user_id", session.session.user.id)
          .maybeSingle();

        if (profile) {
          await (supabaseBrowser() as any)
            .from("conversations")
            .update({
              status_fila: "em_atendimento",
              assigned_user_id: meId,
              updated_at: new Date().toISOString()
            })
            .eq("id", selectedConversationId)
            .eq("tenant_id", (profile as any).tenant_id);
        }
      }
    } catch (err: any) {
      console.error("Erro ao ativar conversa:", err);
    }
  };

  // Função para enviar mensagem
  const handleSend = async () => {
    if (!selectedConversationId || !accessToken || !meId || !composer.trim()) return;

    const text = composer.trim();
    if (!text) return;

    // Verificar se está dentro de 24h
    if (!isWithin24Hours()) {
      showToast("Esta conversa está fora da janela de 24 horas. Use um template do WhatsApp.", "warning");
      setShowTemplateSelector(true);
      return;
    }

    setSending(true);
    try {
      // Ativar conversa antes de enviar
      await activateConversation();

      // Enviar mensagem
      await apiSendText({
        accessToken,
        conversationId: selectedConversationId,
        text
      });

      setComposer("");
      await qc.invalidateQueries({ queryKey: ["history-messages", selectedConversationId] });
      await qc.invalidateQueries({ queryKey: ["all-conversations-history-page"] });
      await qc.invalidateQueries({ queryKey: ["queue"] });

      // Scroll para o final
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err: any) {
      if (err.message === "outside_24h_window" || err.hint === "use_template") {
        showToast("Esta conversa está fora da janela de 24 horas. Use um template do WhatsApp.", "warning");
        setShowTemplateSelector(true);
      } else {
        showToast(err.message || "Erro ao enviar mensagem", "error");
      }
    } finally {
      setSending(false);
    }
  };

  // Scroll para o topo quando uma nova conversa é selecionada (para ver o início do histórico)
  useEffect(() => {
    if (selectedConversationId && messagesEndRef.current) {
      // Scroll para o topo quando uma nova conversa é selecionada
      setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollTop = 0;
        }
      }, 100);
    }
  }, [selectedConversationId]);

  // Scroll automático para o final apenas quando novas mensagens são enviadas (não quando carrega)
  const prevMessagesLength = useRef(0);
  useEffect(() => {
    if (messagesQ.data && messagesQ.data.length > 0) {
      // Só fazer scroll para o final se o número de mensagens aumentou (nova mensagem enviada)
      if (messagesQ.data.length > prevMessagesLength.current) {
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      }
      prevMessagesLength.current = messagesQ.data.length;
    }
  }, [messagesQ.data]);

  // Selecionar primeira conversa por padrão
  useEffect(() => {
    if (urlConversationId) return;
    if (conversationsQ.data && conversationsQ.data.length > 0 && !selectedConversationId) {
      const firstConv = conversationsQ.data[0] as any;
      if (firstConv?.id) {
        selectConversation(firstConv.id);
      }
    }
  }, [conversationsQ.data, selectedConversationId, urlConversationId]);

  // Agrupar mensagens por data
  const messages = messagesQ.data || [];
  const conversations = conversationsQ.data || [];
  const contact = selectedConversation?.contacts;

  const formatConversationListTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();

    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    }

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      d.getFullYear() === yesterday.getFullYear() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getDate() === yesterday.getDate();
    if (isYesterday) return "Ontem";

    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 7) {
      return d
        .toLocaleDateString("pt-BR", { weekday: "short" })
        .replace(".", "")
        .replace(/^\w/, (c) => c.toUpperCase());
    }

    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  };

  const groupedMessages = useMemo(() => {
    if (!messages) return [];

    const groups: { date: string; batches: { key: string; direction: "in" | "out"; messages: any[] }[] }[] = [];
    let currentDate = "";
    let currentBatches: { key: string; direction: "in" | "out"; messages: any[] }[] = [];
    let currentBatch: { key: string; direction: "in" | "out"; messages: any[] } | null = null;

    const senderKeyFor = (m: any) => {
      const dir = m.direction as "in" | "out";
      if (dir === "in") return "in";
      return m.sent_by_user_id ? `out:${m.sent_by_user_id}` : "out";
    };

    for (const m of messages) {
      const date = new Date(m.created_at).toDateString();
      if (date !== currentDate) {
        if (currentBatch) currentBatches.push(currentBatch);
        if (currentBatches.length > 0) groups.push({ date: currentDate, batches: currentBatches });
        currentDate = date;
        currentBatches = [];
        currentBatch = null;
      }

      const dir = m.direction as "in" | "out";
      const key = senderKeyFor(m);

      if (!currentBatch) {
        currentBatch = { key, direction: dir, messages: [m] };
        continue;
      }

      if (currentBatch.direction === dir && currentBatch.key === key) {
        currentBatch.messages.push(m);
      } else {
        currentBatches.push(currentBatch);
        currentBatch = { key, direction: dir, messages: [m] };
      }
    }

    if (currentBatch) currentBatches.push(currentBatch);
    if (currentBatches.length > 0) groups.push({ date: currentDate, batches: currentBatches });

    return groups.filter((g) => g.date);
  }, [messages]);

  const formatFriendlyDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();

    const isToday = d.toDateString() === now.toDateString();

    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    if (isToday) return "Hoje";
    if (isYesterday) return "Ontem";

    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days < 7) {
      return d.toLocaleDateString("pt-BR", { weekday: "long" }).replace(/^\w/, (c) => c.toUpperCase());
    }

    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  };

  if (!accessToken) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Carregando...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="h-16 shrink-0 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Voltar para HUD"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center">
              <Image
                src="/logo.png"
                alt="Logo"
                fill
                sizes="40px"
                className="object-contain p-2"
              />
            </div>
            <div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">Histórico WhatsApp</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Todas as conversas</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* Lista de conversas - estilo WhatsApp */}
        <div className="w-1/3 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col">
          {/* Busca */}
          <div className="p-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar conversas..."
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto">
            {conversationsQ.isLoading ? (
              <div className="text-sm text-center py-8 text-gray-500 dark:text-gray-400">Carregando...</div>
            ) : conversations.length === 0 ? (
              <div className="text-sm text-center py-8 text-gray-500 dark:text-gray-400">
                {searchQuery ? "Nenhuma conversa encontrada" : "Nenhuma conversa"}
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-800">
                {conversations.map((conv: any) => {
                  const isSelected = conv.id === selectedConversationId;
                  const contact = conv.contacts;
                  const name = contact?.display_name ?? contact?.phone_e164 ?? "Sem nome";
                  const lastMsg = conv.last_activity_at || conv.last_patient_message_at || conv.last_outbound_at || conv.updated_at || conv.created_at;
                  const lastMsgDate = lastMsg ? new Date(lastMsg) : new Date(conv.created_at);
                  const time = formatConversationListTime(lastMsgDate.toISOString());

                  return (
                    <button
                      key={conv.id}
                      onClick={() => selectConversation(conv.id)}
                      className={`w-full text-left p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${isSelected ? "bg-indigo-50 dark:bg-indigo-900/20" : ""
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        {contact?.profile_picture_url ? (
                          <img
                            src={contact.profile_picture_url}
                            alt={name}
                            className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white font-semibold text-lg flex-shrink-0">
                            {name[0].toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">{name}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 ml-2">{time}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            {conv.funnel_stages?.name && (
                              <div className="text-[10px] px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 truncate max-w-[100px]">
                                {conv.funnel_stages.name}
                              </div>
                            )}
                            <div className={`text-[10px] ${conv.status_fila === "finalizado"
                              ? "text-gray-500 dark:text-gray-400"
                              : "text-indigo-600 dark:text-indigo-400 font-medium"
                              }`}>
                              {conv.status_fila === "finalizado" ? "Finalizada" : "Ativa"}
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Área de mensagens - estilo WhatsApp */}
        <div className="flex-1 flex flex-col bg-gray-100 dark:bg-gray-900">
          {selectedConversationId ? (
            <>
              {/* Header da conversa */}
              <div className="h-16 shrink-0 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex items-center justify-between px-4">
                <div className="flex items-center gap-3">
                  {contact?.profile_picture_url ? (
                    <img
                      src={contact.profile_picture_url}
                      alt={contact?.display_name ?? contact?.phone_e164 ?? "Contato"}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white font-semibold">
                      {(contact?.display_name ?? contact?.phone_e164 ?? "?")[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">
                      {contact?.display_name ?? contact?.phone_e164 ?? "Sem nome"}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {contact?.phone_e164 ?? "-"}
                    </div>
                  </div>
                </div>
                {selectedConversation?.assigned_profiles && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Atendido por: {selectedConversation.assigned_profiles.full_name}
                  </div>
                )}
              </div>

              {/* Mensagens */}
              <div className="flex-1 overflow-y-auto p-4 bg-gray-100 dark:bg-gray-900" ref={messagesEndRef}>
                {messagesQ.isLoading ? (
                  <div className="text-sm text-center py-8 text-gray-500 dark:text-gray-400">Carregando mensagens...</div>
                ) : messages.length === 0 ? (
                  <div className="text-sm text-center py-8 text-gray-500 dark:text-gray-400">Nenhuma mensagem nesta conversa</div>
                ) : (
                  <div className="space-y-6">
                    {groupedMessages.map((group) => (
                      <div key={group.date}>
                        {/* Separador de Data */}
                        <div className="flex items-center justify-center my-6">
                          <div className="px-4 py-1.5 rounded-full bg-gray-200 dark:bg-gray-800 text-[10px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider shadow-sm border border-gray-300 dark:border-gray-700">
                            {formatFriendlyDate(group.date)}
                          </div>
                        </div>

                        <div className="space-y-3">
                          {group.batches.map((batch) => {
                            const isOut = batch.direction === "out";
                            const firstMsg = batch.messages[0] as any;
                            const lastMsg = batch.messages[batch.messages.length - 1] as any;
                            const senderName = isOut ? (firstMsg?.profiles?.full_name || "Você") : null;
                            const contactInitial = contact?.display_name
                              ? contact.display_name[0].toUpperCase()
                              : contact?.phone_e164
                                ? contact.phone_e164.slice(-1)
                                : "?";

                            const extractText = (m: any) => {
                              const msgType = m?.body_json?.message?.type ?? m.type;
                              if (msgType !== "text") return null;
                              let body = m.body_json;
                              if (!body) return "";
                              if (typeof body === "string") {
                                try {
                                  body = JSON.parse(body);
                                } catch {
                                  return body;
                                }
                              }
                              const text =
                                (typeof body.text === "string" ? body.text : null) ??
                                body.text?.body ??
                                body.message?.text?.body ??
                                body.body ??
                                (typeof body === "string" ? body : "");
                              return String(text);
                            };

                            return (
                              <div key={`${group.date}:${batch.key}:${firstMsg.id}`} className={`flex gap-3 ${isOut ? "justify-end" : "justify-start"}`}>
                                {!isOut && (
                                  <div className="flex-shrink-0 mt-1">
                                    {contact?.profile_picture_url ? (
                                      <img
                                        src={contact.profile_picture_url}
                                        alt={contact?.display_name ?? "Contato"}
                                        className="w-10 h-10 rounded-full object-cover shadow-sm border border-gray-200 dark:border-gray-800"
                                      />
                                    ) : (
                                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-sm border border-indigo-400">
                                        {contactInitial}
                                      </div>
                                    )}
                                  </div>
                                )}

                                <div
                                  className={`max-w-[75%] rounded-2xl px-4 py-3 shadow-md transition-all ease-in-out duration-200 hover:shadow-lg ${isOut
                                    ? "bg-indigo-600 text-white rounded-tr-sm"
                                    : "bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-800 rounded-tl-sm"
                                    }`}
                                >
                                  {senderName && (
                                    <div className={`text-[11px] font-bold mb-1 uppercase tracking-tight ${isOut ? "text-indigo-200" : "text-indigo-600 dark:text-indigo-400"}`}>
                                      {senderName}
                                    </div>
                                  )}

                                  <div className="space-y-2">
                                    {batch.messages.map((msg: any) => {
                                      const effectiveType = msg?.body_json?.message?.type ?? msg.type;
                                      const isMedia = ["image", "audio", "document", "video"].includes(effectiveType);
                                      const text = extractText(msg);
                                      const hasContext = !!(msg.body_json?.context || msg.body_json?.message?.referral || msg.body_json?.referral);

                                      return (
                                        <div key={msg.id}>
                                          {isMedia && accessToken ? (
                                            <MessageMedia accessToken={accessToken} messageId={msg.id} messageType={effectiveType} bodyJson={msg.body_json} />
                                          ) : (text || hasContext) ? (
                                            <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                                              {!isOut && hasContext && accessToken && (
                                                <TemplateImage
                                                  context={msg.body_json.context?.referral ? msg.body_json.context : { ...msg.body_json.context, referral: msg.body_json.message?.referral || msg.body_json.referral }}
                                                  accessToken={accessToken}
                                                  messageId={msg.id}
                                                />
                                              )}
                                              {text ? String(text) : null}
                                            </div>
                                          ) : (
                                            <div className="text-xs opacity-70 italic">
                                              {effectiveType === "unsupported"
                                                ? "Mensagem não suportada pelo WhatsApp"
                                                : `Mensagem do tipo ${String(effectiveType)} - Conteúdo não suportado no histórico web`}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>

                                  <div className={`text-[10px] mt-2 flex items-center justify-end gap-2 font-medium ${isOut ? "text-indigo-200" : "text-gray-400 dark:text-gray-500"}`}>
                                    <span>{new Date(lastMsg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                                    {isOut && (
                                      <span className="font-bold">
                                        {lastMsg.status === "sent" ? "✓" : lastMsg.status === "delivered" ? "✓✓" : lastMsg.status === "read" ? "✓✓" : ""}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {isOut && (
                                  <div className="flex-shrink-0 mt-1">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-500 flex items-center justify-center text-white font-bold text-sm shadow-sm border border-indigo-300">
                                      {meId && lastMsg.sent_by_user_id === meId ? "Eu" : (lastMsg.profiles?.full_name || "A")[0].toUpperCase()}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Input de mensagem */}
              <div className="h-20 shrink-0 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
                {!isWithin24Hours() && (
                  <div className="mb-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <div className="text-xs text-amber-800 dark:text-amber-200 font-medium">
                      ⚠️ Fora da janela de 24 horas - Use um template do WhatsApp
                    </div>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <div className="flex-1 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-2">
                    <textarea
                      value={composer}
                      onChange={(e) => setComposer(e.target.value)}
                      placeholder={isWithin24Hours()
                        ? "Digite sua mensagem… (Enter para enviar, Ctrl+Enter para quebrar linha)"
                        : "Use um template do WhatsApp (fora da janela de 24h)"
                      }
                      className="w-full bg-transparent border-none outline-none text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-400 resize-none min-h-[40px] max-h-[120px] overflow-y-auto"
                      disabled={!selectedConversationId || sending || !isWithin24Hours()}
                      rows={1}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && isWithin24Hours()) {
                          e.preventDefault();
                          void handleSend();
                        }
                      }}
                      onInput={(e) => {
                        const target = e.target as HTMLTextAreaElement;
                        target.style.height = "auto";
                        target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
                      }}
                    />
                  </div>
                  {isWithin24Hours() ? (
                    <button
                      onClick={() => void handleSend()}
                      disabled={!selectedConversationId || sending || !composer.trim()}
                      className="p-3 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
                    >
                      {sending ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <Send className="w-5 h-5" />
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowTemplateSelector(true)}
                      className="p-3 rounded-full bg-amber-600 hover:bg-amber-700 text-white transition-all shadow-lg hover:shadow-xl"
                    >
                      <Paperclip className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
                  <Search className="w-8 h-8 text-gray-400 dark:text-gray-600" />
                </div>
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Selecione uma conversa</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Escolha uma conversa para ver o histórico</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Template Selector Modal */}
      {showTemplateSelector && selectedConversationId && accessToken && (
        <TemplateSelector
          accessToken={accessToken}
          conversationId={selectedConversationId}
          onSend={async () => {
            await activateConversation();
            await qc.invalidateQueries({ queryKey: ["history-messages", selectedConversationId] });
            await qc.invalidateQueries({ queryKey: ["all-conversations-history-page"] });
            await qc.invalidateQueries({ queryKey: ["queue"] });
            setShowTemplateSelector(false);
          }}
          onClose={() => setShowTemplateSelector(false)}
        />
      )}
    </div>
  );
}

export default function HistoryPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center" />}>
      <HistoryPageClient />
    </Suspense>
  );
}
