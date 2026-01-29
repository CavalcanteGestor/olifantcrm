"use client";

import { useEffect, useState } from "react";
import { apiListUsers, apiTransferConversation } from "@/lib/api";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useToast } from "@/hooks/useToast";
import { ToastContainer } from "@/app/ui/hud/Toast";

type User = { user_id: string; full_name: string; is_online?: boolean };

type TransferModalProps = {
  accessToken: string;
  conversationId: string;
  currentUserId: string | null;
  onClose: () => void;
  onSuccess: () => void;
  isAdminHud?: boolean;
};

export default function TransferModal({
  accessToken,
  conversationId,
  currentUserId,
  onClose,
  onSuccess,
  isAdminHud = false
}: TransferModalProps) {
  const { toasts, showToast, removeToast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [transferReason, setTransferReason] = useState<string>("");
  const [transferring, setTransferring] = useState(false);

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const [usersData, shiftsData] = await Promise.all([
          apiListUsers({ accessToken }),
          supabaseBrowser().from("agent_shifts").select("user_id").is("ended_at", null)
        ]);

        if (!alive) return;
        
        const onlineUserIds = new Set(shiftsData.data?.map(s => s.user_id) || []);
        
        // Filtrar o usuário atual
        const filteredUsers = usersData.items
          .filter((u) => u.user_id !== currentUserId)
          .map(u => ({
            ...u,
            is_online: onlineUserIds.has(u.user_id)
          }))
          .sort((a, b) => {
            // Online primeiro
            if (a.is_online && !b.is_online) return -1;
            if (!a.is_online && b.is_online) return 1;
            return a.full_name.localeCompare(b.full_name);
          });
        
        setUsers(filteredUsers);
      } catch (err: any) {
        console.error("Erro ao carregar usuários:", err);
        // Se for erro 401, tentar atualizar o token
        if (err.message?.includes("401") || err.message?.includes("unauthorized")) {
          try {
            const { data: session } = await supabaseBrowser().auth.getSession();
            if (session.session && alive) {
              // Tentar novamente com o novo token
              const data = await apiListUsers({ accessToken: session.session.access_token });
              if (!alive) return;
              setUsers(data.items.filter((u) => u.user_id !== currentUserId));
            }
          } catch (retryErr) {
            console.error("Erro ao tentar novamente:", retryErr);
          }
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [accessToken, currentUserId]);

  async function handleTransfer() {
    if (!selectedUserId) {
      showToast("Por favor, selecione um atendente para transferir a conversa.", "warning");
      return;
    }
    if (!transferReason.trim()) {
      showToast("Por favor, informe o motivo da transferência.", "warning");
      return;
    }
    setTransferring(true);
    try {
      await apiTransferConversation({ 
        accessToken, 
        conversationId, 
        userId: selectedUserId,
        reason: transferReason.trim()
      });
      showToast("Conversa transferida com sucesso!", "success");
      onSuccess();
      onClose();
    } catch (err: any) {
      const errorMsg = err.message || err.error || "Erro desconhecido";
      const errorDetails = err.details || err.message || "";
      const errorCode = err.error || err.message || "";
      
      // Tratar erros específicos
      if (errorCode === "forbidden" || errorMsg.includes("forbidden")) {
        showToast("Você não tem permissão para transferir conversas. Apenas coordenadores e administradores podem transferir.", "error", 6000);
      } else if (errorCode === "user_not_found" || errorMsg.includes("user_not_found")) {
        showToast("Erro: O atendente selecionado não foi encontrado ou não pertence ao seu tenant.", "error");
      } else if (errorCode === "invalid_body" || errorMsg.includes("invalid_body") || errorMsg.includes("UUID")) {
        showToast("Erro: O atendente selecionado não é válido. Por favor, selecione outro atendente.", "error");
      } else if (errorCode === "transfer_failed" || errorMsg.includes("transfer_failed")) {
        const specificMsg = errorDetails || errorMsg;
        if (specificMsg.includes("already_assigned")) {
          showToast("Esta conversa já está atribuída a outro atendente. A transferência não foi realizada.", "warning", 6000);
        } else if (specificMsg.includes("not_found") || specificMsg.includes("conversation")) {
          showToast("Erro: A conversa não foi encontrada. A conversa pode ter sido removida ou não existe mais.", "error");
        } else if (specificMsg.includes("forbidden")) {
          showToast("Você não tem permissão para transferir esta conversa. Apenas coordenadores e administradores podem transferir conversas.", "error", 6000);
        } else {
          showToast(`Erro ao transferir conversa: ${specificMsg || "Erro desconhecido"}. Verifique se a conversa existe e se o atendente é válido.`, "error", 6000);
        }
      } else if (err.status === 400 || errorMsg.includes("400") || errorMsg.includes("Bad Request")) {
        // Para erros 400 genéricos, verificar se há mensagem específica
        if (errorDetails && (errorDetails.includes("turno") || errorDetails.includes("shift"))) {
          const selectedUser = users.find(u => u.user_id === selectedUserId);
          const userName = selectedUser?.full_name || "o atendente selecionado";
          showToast(`Aviso: ${userName} não possui um turno ativo no momento. A transferência será realizada, mas o atendente precisará iniciar o turno para receber a conversa.`, "warning", 6000);
        } else if (errorDetails && errorDetails.includes("UUID")) {
          showToast("Erro: O ID do atendente selecionado não é válido. Por favor, selecione outro atendente ou recarregue a página.", "error");
        } else {
          showToast(`Erro ao transferir: ${errorDetails || errorMsg || "Erro desconhecido"}. Verifique se o atendente selecionado é válido.`, "error");
        }
      } else {
        showToast(`Erro ao transferir conversa: ${errorMsg}${errorDetails && errorDetails !== errorMsg ? `. Detalhes: ${errorDetails}` : ""}`, "error", 6000);
      }
    } finally {
      setTransferring(false);
    }
  }

  return (
    <div className={`fixed inset-0 backdrop-blur-md flex items-center justify-center z-50 ${
      isAdminHud
        ? "bg-blue-950/70 dark:bg-blue-950/80"
        : "bg-orange-950/70 dark:bg-orange-950/80"
    }`} onClick={onClose}>
      <div
        className={`rounded-2xl border-2 shadow-2xl p-6 max-w-lg w-full mx-4 ${
          isAdminHud
            ? "bg-linear-to-br from-white via-blue-50/90 to-white dark:from-slate-900 dark:via-blue-950/90 dark:to-slate-900 border-blue-200 dark:border-blue-800"
            : "bg-linear-to-br from-white via-orange-50/90 to-white dark:from-slate-900 dark:via-orange-950/90 dark:to-slate-900 border-orange-200 dark:border-orange-800"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="text-2xl">🔄</div>
          <div className={`text-xl font-extrabold tracking-tight ${
            isAdminHud
              ? "bg-linear-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent dark:from-blue-400 dark:to-indigo-400"
              : "bg-linear-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent dark:from-orange-400 dark:to-amber-400"
          }`}>
            TRANSFERIR CONVERSA
          </div>
        </div>
        
        <div className={`text-sm font-medium mb-4 ${
          isAdminHud
            ? "text-blue-700 dark:text-blue-300"
            : "text-orange-700 dark:text-orange-300"
        }`}>
          Selecione o atendente e informe o motivo da transferência:
        </div>

        {loading ? (
          <div className={`text-sm font-medium text-center py-8 ${
            isAdminHud
              ? "text-blue-600 dark:text-blue-400"
              : "text-orange-600 dark:text-orange-400"
          }`}>
            Carregando usuários...
          </div>
        ) : users.length === 0 ? (
          <div className={`text-sm font-medium text-center py-8 ${
            isAdminHud
              ? "text-blue-600 dark:text-blue-400"
              : "text-orange-600 dark:text-orange-400"
          }`}>
            Nenhum usuário disponível
          </div>
        ) : (
          <>
            <div className="mb-4">
              <label className={`text-xs font-bold uppercase tracking-wider mb-2 block ${
                isAdminHud
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-orange-600 dark:text-orange-400"
              }`}>
                Atendente
              </label>
              <div className="space-y-2 max-h-48 overflow-auto">
                {users.map((user) => (
                  <button
                    key={user.user_id}
                    onClick={() => user.is_online && setSelectedUserId(user.user_id)}
                    disabled={!user.is_online}
                    className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all duration-200 flex justify-between items-center ${
                      selectedUserId === user.user_id
                        ? isAdminHud
                          ? "border-blue-500 bg-linear-to-r from-blue-50 to-indigo-50 dark:from-blue-950/50 dark:to-indigo-950/50 shadow-lg"
                          : "border-orange-500 bg-linear-to-r from-orange-50 to-amber-50 dark:from-orange-950/50 dark:to-amber-950/50 shadow-lg"
                        : !user.is_online
                          ? "border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 opacity-60 cursor-not-allowed"
                          : "border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md"
                    }`}
                  >
                    <div className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                      {user.full_name}
                      {!user.is_online && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                          Offline
                        </span>
                      )}
                    </div>
                    {user.is_online && (
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <label className={`text-xs font-bold uppercase tracking-wider mb-2 block ${
                isAdminHud
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-orange-600 dark:text-orange-400"
              }`}>
                Motivo da Transferência <span className="text-red-500">*</span>
              </label>
              <textarea
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="Ex: Especialização necessária, sobrecarga de trabalho, etc."
                rows={3}
                className={`w-full rounded-xl border-2 px-4 py-3 text-sm outline-none transition-all duration-200 font-medium shadow-sm resize-none ${
                  isAdminHud
                    ? "bg-white dark:bg-slate-900 border-blue-200 dark:border-blue-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-400/20"
                    : "bg-white dark:bg-slate-900 border-orange-200 dark:border-orange-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:focus:ring-orange-400/20"
                }`}
              />
            </div>
          </>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={transferring}
            className={`px-5 py-2.5 rounded-xl border-2 text-sm font-extrabold uppercase tracking-wider transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 ${
              isAdminHud
                ? "border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                : "border-orange-200 dark:border-orange-800 bg-white dark:bg-slate-800 text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950/30"
            }`}
          >
            Cancelar
          </button>
          <button
            onClick={handleTransfer}
            disabled={!selectedUserId || !transferReason.trim() || transferring || users.length === 0}
            className={`px-5 py-2.5 rounded-xl text-sm font-extrabold uppercase tracking-wider transition-all duration-200 shadow-xl hover:shadow-2xl transform hover:scale-105 disabled:transform-none disabled:opacity-50 ${
              isAdminHud
                ? "bg-linear-to-r from-blue-500 to-indigo-500 text-white hover:from-blue-600 hover:to-indigo-600 border-2 border-blue-400/50"
                : "bg-linear-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 border-2 border-orange-400/50"
            }`}
          >
            {transferring ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                TRANSFERINDO...
              </span>
            ) : (
              "TRANSFERIR"
            )}
          </button>
        </div>
      </div>

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}

