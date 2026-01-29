"use client";

import { useState } from "react";
import { Calendar, Check, RefreshCw, CheckCircle, XCircle, Power } from "lucide-react";
import { apiCreateTask, apiMoveStage, apiSendText, apiListStages, apiCloseConversation } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useToast } from "@/hooks/useToast";
import { ToastContainer } from "@/app/ui/hud/Toast";

type QuickActionsProps = {
  accessToken: string;
  conversationId: string | null;
  contactName: string | null;
  currentStageId: string | null;
  onAction: () => void;
  isAdminHud?: boolean;
  onClose?: () => void; // Callback para limpar seleção após encerrar
};

export default function QuickActions({ accessToken, conversationId, contactName, currentStageId, onAction, isAdminHud = false, onClose }: QuickActionsProps) {
  const { toasts, showToast, removeToast } = useToast();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [closeObservation, setCloseObservation] = useState("");
  const qc = useQueryClient();

  const stagesQ = useQuery({
    queryKey: ["stages"],
    queryFn: () => apiListStages({ accessToken }),
    enabled: !!accessToken
  });

  async function handleScheduleAction() {
    if (!conversationId || !scheduleDate || !scheduleTime) return;
    setActionLoading("agendar");
    try {
      const dateTime = `${scheduleDate}T${scheduleTime}`;
      await apiCreateTask({
        accessToken,
        conversationId,
        title: `Agendar consulta para ${new Date(dateTime).toLocaleString("pt-BR")}`
      });
      await apiSendText({
        accessToken,
        conversationId,
        text: `Olá ${contactName || ""}! Agendamos sua consulta para ${new Date(dateTime).toLocaleString("pt-BR")}. Aguardamos você!`
      });
      setShowScheduleModal(false);
      setScheduleDate("");
      setScheduleTime("");
      await qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      await qc.invalidateQueries({ queryKey: ["tasks", conversationId] });
      await qc.invalidateQueries({ queryKey: ["queue"] });
      showToast("Consulta agendada com sucesso!", "success");
      onAction();
    } catch (err: any) {
      showToast(err.message || "Erro ao agendar consulta", "error");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleAction(action: string, data?: any) {
    if (!conversationId) return;
    setActionLoading(action);
    try {
      switch (action) {
        case "confirmar":
          await apiCreateTask({
            accessToken,
            conversationId,
            title: "Confirmar consulta agendada"
          });
          await apiSendText({
            accessToken,
            conversationId,
            text: `Olá ${contactName || ""}! Confirmamos sua consulta. Te esperamos!`
          });
          break;
        case "remarcar":
          setShowScheduleModal(true);
          setActionLoading(null);
          return; // Não concluir ainda, esperar modal
        case "compareceu":
          await apiCreateTask({
            accessToken,
            conversationId,
            title: "Paciente compareceu à consulta"
          });
          // Mover para etapa "Pós-consulta" se existir (opcional)
          if (stagesQ.data?.items) {
            const postStage = stagesQ.data.items.find((s) => s.name.toLowerCase().includes("pós") || s.name.toLowerCase().includes("pos"));
            if (postStage) {
              await apiMoveStage({ accessToken, conversationId, stageId: postStage.id }).catch(() => {
                // Ignorar erro se não conseguir mover
              });
            }
          }
          break;
        case "faltou":
          await apiCreateTask({
            accessToken,
            conversationId,
            title: "Paciente faltou à consulta"
          });
          await apiSendText({
            accessToken,
            conversationId,
            text: `Olá ${contactName || ""}! Notamos que você não compareceu à consulta agendada. Gostaria de remarcar?`
          });
          break;
        case "encerrar":
          // Abrir modal de encerramento
          setShowCloseModal(true);
          setActionLoading(null);
          return; // Não concluir ainda, esperar modal
      }
      // Invalidar queries gerais (exceto para encerrar que já foi feito acima)
      if (action !== "encerrar") {
        await qc.invalidateQueries({ queryKey: ["messages", conversationId] });
        await qc.invalidateQueries({ queryKey: ["tasks", conversationId] });
        await qc.invalidateQueries({ queryKey: ["queue"] });
      } else {
        // Para encerrar, já invalidamos queue e conversation acima, só falta messages e tasks
        await qc.invalidateQueries({ queryKey: ["messages", conversationId] });
        await qc.invalidateQueries({ queryKey: ["tasks", conversationId] });
      }
      onAction();
    } catch (err: any) {
      showToast(err.message || `Erro ao executar ação ${action}`, "error");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCloseConversation() {
    if (!conversationId) return;
    setActionLoading("encerrar");
    try {
      // Buscar configuração do tenant para mensagem de encerramento
      let closeMessageText: string | null = null;
      let closeMessageEnabled = true;
      
      try {
        const { data: session } = await supabaseBrowser().auth.getSession();
        if (session.session) {
          const { data: profile } = await supabaseBrowser()
            .from("profiles")
            .select("tenant_id, tenants(close_message_template, close_message_enabled)")
            .eq("user_id", session.session.user.id)
            .maybeSingle();
          
          if (profile) {
            const tenant = (profile as any).tenants;
            closeMessageEnabled = tenant?.close_message_enabled ?? true;
            closeMessageText = tenant?.close_message_template || null;
          }
        }
      } catch (err) {
        console.error("Erro ao buscar configuração de mensagem de encerramento:", err);
        // Continuar com valores padrão
      }

      // Enviar mensagem de encerramento apenas se estiver habilitada
      if (closeMessageEnabled) {
        // Substituir {nome} pelo nome do contato
        const finalMessage = (closeMessageText || `Olá {nome}! Obrigado pelo contato. Se precisar de mais alguma coisa, estaremos à disposição!`)
          .replace(/{nome}/g, contactName || "");
        
        await apiSendText({
          accessToken,
          conversationId,
          text: finalMessage
        }).catch((err: any) => {
          // Se estiver fora da janela de 24h, apenas finalizar sem enviar mensagem
          if (err.message === "outside_24h_window" || err.hint === "use_template") {
            console.log("Conversa fora da janela de 24h, finalizando sem enviar mensagem");
          } else {
            console.error("Erro ao enviar mensagem de encerramento:", err);
          }
        });
      }
      
      // Se houver observação, criar uma tarefa com ela
      if (closeObservation.trim()) {
        await apiCreateTask({
          accessToken,
          conversationId,
          title: `Observação de encerramento: ${closeObservation.trim()}`
        }).catch(() => {
          // Ignorar erro se não conseguir criar tarefa
        });
      }
      
      // Finalizar a conversa na fila
      await apiCloseConversation({
        accessToken,
        conversationId
      });
      
      // Invalidar e refazer queries após encerrar para garantir atualização imediata
      await qc.invalidateQueries({ queryKey: ["queue"] });
      await qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
      await qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      await qc.invalidateQueries({ queryKey: ["tasks", conversationId] });
      await qc.invalidateQueries({ queryKey: ["active-conversations"] });
      
      // Forçar refetch imediato
      await qc.refetchQueries({ queryKey: ["queue"] });
      await qc.refetchQueries({ queryKey: ["active-conversations"] });
      
      setShowCloseModal(false);
      setCloseObservation("");
      
      showToast("Conversa encerrada com sucesso!", "success");
      
      // Limpar seleção se callback fornecido
      if (onClose) {
        onClose();
      }
      
      onAction();
    } catch (err: any) {
      console.error("Erro ao encerrar conversa:", err);
      let errorMsg = "Erro desconhecido ao encerrar conversa";
      
      if (err.message) {
        if (err.message.includes("not_authenticated")) {
          errorMsg = "Erro de autenticação. Por favor, faça login novamente.";
        } else if (err.message.includes("forbidden")) {
          errorMsg = "Você não tem permissão para encerrar esta conversa.";
        } else if (err.message.includes("not_found")) {
          errorMsg = "Conversa não encontrada.";
        } else if (err.message.includes("already_closed")) {
          errorMsg = "Esta conversa já está finalizada.";
        } else {
          errorMsg = err.message;
        }
      } else if (err.details) {
        errorMsg = err.details;
      }
      
      showToast(`Erro ao encerrar conversa: ${errorMsg}`, "error", 6000);
    } finally {
      setActionLoading(null);
    }
  }

  if (!conversationId) {
    return (
      <div className={`text-xs font-medium text-center py-4 ${
        isAdminHud
          ? "text-blue-600 dark:text-blue-400"
          : "text-orange-600 dark:text-orange-400"
      }`}>
        Selecione uma conversa para usar ações rápidas
      </div>
    );
  }

  const actions = [
    { key: "agendar", label: "Agendar", icon: Calendar, color: "blue", onClick: () => setShowScheduleModal(true) },
    { key: "confirmar", label: "Confirmar", icon: Check, color: "green", onClick: () => handleAction("confirmar") },
    { key: "remarcar", label: "Remarcar", icon: RefreshCw, color: "yellow", onClick: () => setShowScheduleModal(true) },
    { key: "compareceu", label: "Compareceu", icon: CheckCircle, color: "green", onClick: () => handleAction("compareceu") },
    { key: "faltou", label: "Faltou", icon: XCircle, color: "red", onClick: () => handleAction("faltou") }
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {actions.map((action) => {
          const Icon = action.icon;
          const colorClasses = {
            blue: "bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white",
            green: "bg-green-600 hover:bg-green-700 active:bg-green-800 text-white",
            yellow: "bg-yellow-600 hover:bg-yellow-700 active:bg-yellow-800 text-white",
            red: "bg-red-600 hover:bg-red-700 active:bg-red-800 text-white"
          };
          
          return (
            <button
              key={action.key}
              onClick={action.onClick}
              disabled={actionLoading !== null}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 ${
                actionLoading === action.key
                  ? "opacity-50 cursor-not-allowed"
                  : colorClasses[action.color as keyof typeof colorClasses]
              }`}
            >
              {actionLoading === action.key ? (
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              ) : (
                <>
                  <Icon className="w-3.5 h-3.5" />
                  <span>{action.label}</span>
                </>
              )}
            </button>
          );
        })}
      </div>
      
      {/* Botão de Encerrar */}
      <button
        onClick={() => setShowCloseModal(true)}
        disabled={actionLoading !== null}
        className="w-full px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2"
      >
        <Power className="w-4 h-4" />
        <span>Encerrar Conversa</span>
      </button>

      {/* Modal de Agendamento */}
      {showScheduleModal && (
        <div className={`fixed inset-0 backdrop-blur-md flex items-center justify-center z-50 ${
          isAdminHud
            ? "bg-blue-950/70 dark:bg-blue-950/80"
            : "bg-orange-950/70 dark:bg-orange-950/80"
        }`} onClick={() => setShowScheduleModal(false)}>
          <div
            className={`rounded-2xl border-2 shadow-2xl p-6 max-w-sm w-full mx-4 ${
              isAdminHud
                ? "bg-gradient-to-br from-white via-blue-50/90 to-white dark:from-slate-900 dark:via-blue-950/90 dark:to-slate-900 border-blue-200 dark:border-blue-800"
                : "bg-gradient-to-br from-white via-orange-50/90 to-white dark:from-slate-900 dark:via-orange-950/90 dark:to-slate-900 border-orange-200 dark:border-orange-800"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`text-lg font-extrabold mb-4 ${
              isAdminHud
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent dark:from-blue-400 dark:to-indigo-400"
                : "bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent dark:from-orange-400 dark:to-amber-400"
            }`}>
              📅 Agendar Consulta
            </div>
            <div className="space-y-4">
              <div>
                <label className={`text-xs font-bold uppercase tracking-wider mb-2 block ${
                  isAdminHud
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-orange-600 dark:text-orange-400"
                }`}>
                  Data
                </label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className={`w-full rounded-xl border-2 px-4 py-2.5 text-sm outline-none transition-all duration-200 font-medium shadow-sm ${
                    isAdminHud
                      ? "bg-white dark:bg-gray-900 border-blue-200 dark:border-blue-800 text-gray-900 dark:text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      : "bg-white dark:bg-gray-900 border-orange-200 dark:border-orange-800 text-gray-900 dark:text-white focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                  }`}
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>
              <div>
                <label className={`text-xs font-bold uppercase tracking-wider mb-2 block ${
                  isAdminHud
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-orange-600 dark:text-orange-400"
                }`}>
                  Horário
                </label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className={`w-full rounded-xl border-2 px-4 py-2.5 text-sm outline-none transition-all duration-200 font-medium shadow-sm ${
                    isAdminHud
                      ? "bg-white dark:bg-gray-900 border-blue-200 dark:border-blue-800 text-gray-900 dark:text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      : "bg-white dark:bg-gray-900 border-orange-200 dark:border-orange-800 text-gray-900 dark:text-white focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                  }`}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowScheduleModal(false);
                    setScheduleDate("");
                    setScheduleTime("");
                  }}
                  className={`flex-1 px-4 py-2.5 rounded-xl border-2 text-sm font-extrabold uppercase tracking-wider transition-all duration-200 shadow-lg ${
                    isAdminHud
                      ? "border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-900 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                      : "border-orange-200 dark:border-orange-800 bg-white dark:bg-gray-900 text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950/30"
                  }`}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleScheduleAction}
                  disabled={!scheduleDate || !scheduleTime || actionLoading === "agendar"}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-extrabold uppercase tracking-wider transition-all duration-200 shadow-xl hover:shadow-2xl transform hover:scale-105 disabled:transform-none disabled:opacity-50 ${
                    isAdminHud
                      ? "bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:from-blue-600 hover:to-indigo-600 border-2 border-blue-400/50"
                      : "bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 border-2 border-orange-400/50"
                  }`}
                >
                  {actionLoading === "agendar" ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      AGENDANDO...
                    </span>
                  ) : (
                    "AGENDAR"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Encerrar Conversa */}
      {showCloseModal && (
        <div className={`fixed inset-0 backdrop-blur-md flex items-center justify-center z-50 ${
          isAdminHud
            ? "bg-blue-950/70 dark:bg-blue-950/80"
            : "bg-orange-950/70 dark:bg-orange-950/80"
        }`} onClick={() => setShowCloseModal(false)}>
          <div
            className={`rounded-2xl border-2 shadow-2xl p-6 max-w-lg w-full mx-4 ${
              isAdminHud
                ? "bg-gradient-to-br from-white via-blue-50/90 to-white dark:from-slate-900 dark:via-blue-950/90 dark:to-slate-900 border-blue-200 dark:border-blue-800"
                : "bg-gradient-to-br from-white via-orange-50/90 to-white dark:from-slate-900 dark:via-orange-950/90 dark:to-slate-900 border-orange-200 dark:border-orange-800"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="text-2xl">🔚</div>
              <div className={`text-xl font-extrabold tracking-tight ${
                isAdminHud
                  ? "bg-gradient-to-r from-red-600 to-rose-600 bg-clip-text text-transparent dark:from-red-400 dark:to-rose-400"
                  : "bg-gradient-to-r from-red-600 to-rose-600 bg-clip-text text-transparent dark:from-red-400 dark:to-rose-400"
              }`}>
                ENCERRAR CONVERSA
              </div>
            </div>
            
            <div className={`text-sm font-medium mb-4 ${
              isAdminHud
                ? "text-blue-700 dark:text-blue-300"
                : "text-orange-700 dark:text-orange-300"
            }`}>
              Tem certeza que deseja encerrar esta conversa? Você pode adicionar uma observação (opcional):
            </div>

            <div className="mb-5">
              <label className={`text-xs font-bold uppercase tracking-wider mb-2 block ${
                isAdminHud
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-orange-600 dark:text-orange-400"
              }`}>
                Observação (Opcional)
              </label>
              <textarea
                value={closeObservation}
                onChange={(e) => setCloseObservation(e.target.value)}
                placeholder="Ex: Cliente satisfeito, aguardando retorno, etc."
                rows={3}
                className={`w-full rounded-xl border-2 px-4 py-3 text-sm outline-none transition-all duration-200 font-medium shadow-sm resize-none ${
                  isAdminHud
                    ? "bg-white dark:bg-slate-900 border-blue-200 dark:border-blue-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    : "bg-white dark:bg-slate-900 border-orange-200 dark:border-orange-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                }`}
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowCloseModal(false);
                  setCloseObservation("");
                }}
                disabled={actionLoading === "encerrar"}
                className={`px-5 py-2.5 rounded-xl border-2 text-sm font-extrabold uppercase tracking-wider transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 ${
                  isAdminHud
                    ? "border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                    : "border-orange-200 dark:border-orange-800 bg-white dark:bg-slate-800 text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950/30"
                }`}
              >
                Cancelar
              </button>
              <button
                onClick={handleCloseConversation}
                disabled={actionLoading === "encerrar"}
                className="px-5 py-2.5 rounded-xl text-sm font-extrabold uppercase tracking-wider transition-all duration-200 shadow-xl hover:shadow-2xl transform hover:scale-105 disabled:transform-none disabled:opacity-50 bg-gradient-to-r from-red-600 via-rose-600 to-pink-600 hover:from-red-700 hover:via-rose-700 hover:to-pink-700 text-white border-2 border-red-400/50"
              >
                {actionLoading === "encerrar" ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    ENCERRANDO...
                  </span>
                ) : (
                  "ENCERRAR CONVERSA"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </>
  );
}

