import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Search, Send, User, X, CheckCheck } from "lucide-react";
import { notify } from "@/lib/toastBus";

type ChatUser = {
  user_id: string;
  full_name: string;
  avatar_url?: string;
};

export function ForwardToInternalChatModal({
  isOpen,
  onClose,
  messageToForward,
  currentUserId,
  tenantId
}: {
  isOpen: boolean;
  onClose: () => void;
  messageToForward: any;
  currentUserId: string;
  tenantId: string;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [additionalComment, setAdditionalComment] = useState("");

  const qc = useQueryClient();

  const usersQ = useQuery({
    queryKey: ["internal-users", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabaseBrowser()
        .from("profiles")
        .select("user_id, full_name")
        .eq("tenant_id", tenantId)
        .neq("user_id", currentUserId)
        .order("full_name");
      
      if (error) throw error;
      return data as ChatUser[];
    },
    enabled: !!tenantId && isOpen
  });

  // Fetch media ID if missing in body (for inbound messages)
  const mediaAssetQ = useQuery({
    queryKey: ["media-asset-lookup", messageToForward?.id],
    queryFn: async () => {
      if (!messageToForward?.id) return null;
      const { data } = await supabaseBrowser()
        .from("media_assets")
        .select("id")
        .eq("message_id", messageToForward.id)
        .maybeSingle();
      return data?.id || null;
    },
    enabled: !!messageToForward?.id && 
             ["image", "audio", "video", "document"].includes(messageToForward.type || "") && 
             !messageToForward.body_json?.media_asset_id
  });

  const filteredUsers = (usersQ.data || []).filter(u => 
    u.full_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSend = async () => {
    if (selectedUsers.size === 0) return;
    setSending(true);

    try {
      const mediaId = messageToForward.body_json?.media_asset_id || mediaAssetQ.data;
      const contentUrl = messageToForward.body_json?.url || "";
      const contentType = messageToForward.type || "text";
      
      let forwardText = `[Encaminhado - ${contentType}]\n`;
      
      if (mediaId) {
          forwardText += `[media_asset:${mediaId}]\n`;
      } else if (contentUrl) {
          forwardText += `${contentUrl}\n`;
      } else {
          forwardText += `${messageToForward.content || ""}\n`;
      }
      
      if (additionalComment) {
          forwardText += `\n${additionalComment}`;
      }
      
      forwardText = forwardText.trim();

      const promises = Array.from(selectedUsers).map(userId => 
        supabaseBrowser().from("internal_messages").insert({
          tenant_id: tenantId,
          from_user_id: currentUserId,
          to_user_id: userId,
          message: forwardText
        })
      );

      await Promise.all(promises);
      
      notify("Mensagem encaminhada com sucesso!", "success");
      await qc.invalidateQueries({ queryKey: ["internal-messages"] });
      onClose();
      setSelectedUsers(new Set());
      setAdditionalComment("");
    } catch (error: any) {
      notify(error.message || "Erro ao encaminhar", "error");
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md border border-gray-200 dark:border-gray-800 flex flex-col max-h-[80vh]">
        
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="font-semibold text-lg">Encaminhar para...</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
           <div className="text-sm text-gray-500 mb-2">Mensagem original:</div>
           <div className="bg-white dark:bg-gray-900 p-3 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300 truncate">
             {messageToForward.type === 'audio' ? '🎵 Áudio' : messageToForward.content}
           </div>
           <textarea
             className="w-full mt-3 p-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
             placeholder="Adicionar comentário..."
             rows={2}
             value={additionalComment}
             onChange={e => setAdditionalComment(e.target.value)}
           />
        </div>

        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar pessoa..."
              className="w-full pl-9 pr-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {usersQ.isLoading ? (
            <div className="p-4 text-center text-gray-500 text-sm">Carregando...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">Ninguém encontrado.</div>
          ) : (
            filteredUsers.map(u => {
              const isSelected = selectedUsers.has(u.user_id);
              return (
                <button
                  key={u.user_id}
                  onClick={() => {
                    const newSet = new Set(selectedUsers);
                    if (isSelected) newSet.delete(u.user_id);
                    else newSet.add(u.user_id);
                    setSelectedUsers(newSet);
                  }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left ${
                    isSelected 
                      ? "bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-500" 
                      : "hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm transition-colors ${
                    isSelected ? "bg-indigo-600" : "bg-gray-400"
                  }`}>
                    {isSelected ? <CheckCheck className="w-5 h-5" /> : u.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className={`font-medium transition-colors ${isSelected ? "text-indigo-700 dark:text-indigo-300" : "text-gray-900 dark:text-white"}`}>
                      {u.full_name}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex justify-end">
          <button
            onClick={handleSend}
            disabled={selectedUsers.size === 0 || sending}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
              ${selectedUsers.size === 0 || sending
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
              }
            `}
          >
            <Send className="w-4 h-4" />
            {sending ? "Enviando..." : `Encaminhar (${selectedUsers.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}
