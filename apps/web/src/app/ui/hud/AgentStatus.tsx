"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Circle, Pause, Play, Square, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { apiStartShift, apiPause, apiResume, apiEndShift, apiAgentStatus } from "@/lib/api";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { notify } from "@/lib/toastBus";

type AgentStatusProps = {
  accessToken: string;
};

export default function AgentStatus({ accessToken }: AgentStatusProps) {
  const qc = useQueryClient();
  const showToast = (message: string, type: any = "info", duration?: number) => notify(message, type, duration);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [pauseReason, setPauseReason] = useState<"horario_almoco" | "pausa_cafe" | "banheiro" | "outro">("horario_almoco");
  const [pauseDetail, setPauseDetail] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Buscar status atual
  const statusQ = useQuery({
    queryKey: ["agent-status"],
    queryFn: async () => {
      try {
        return await apiAgentStatus({ accessToken });
      } catch (err: any) {
        // Se a API não estiver disponível, buscar diretamente do Supabase
        if (err.message?.includes('ERR_CONNECTION_REFUSED') || err.message?.includes('Failed to fetch')) {
          const { data: session } = await supabaseBrowser().auth.getSession();
          if (!session.session) throw err;
          
          const { data: profile } = await supabaseBrowser()
            .from("profiles")
            .select("tenant_id")
            .eq("user_id", session.session.user.id)
            .maybeSingle();
          
          if (!profile) throw err;
          
          // Buscar turno ativo
          const { data: shift } = await supabaseBrowser()
            .from("agent_shifts")
            .select("id, started_at, ended_at")
            .eq("user_id", session.session.user.id)
            .is("ended_at", null)
            .order("started_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          
          // Buscar pausas ativas
          let pause = null;
          if (shift) {
            const pauseResult = await supabaseBrowser()
              .from("agent_pauses")
              .select("id, reason, started_at, ended_at")
              .eq("shift_id", (shift as any).id)
              .is("ended_at", null)
              .order("started_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            pause = pauseResult?.data || null;
          }
          
          return {
            has_active_shift: !!shift,
            is_paused: !!pause,
            started_at: (shift as any)?.started_at || null,
            total_minutes_paused: 0
          };
        }
        throw err;
      }
    },
    enabled: !!accessToken,
    staleTime: 30000, // Cache por 30s
    refetchOnWindowFocus: false
  });

  // 🔥 REALTIME: Escutar mudanças no turno do agente
  useEffect(() => {
    if (!accessToken) return;

    const channel = supabaseBrowser()
      .channel('agent-status-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_shifts'
        },
        () => {
          // Turno mudou, atualizar status
          qc.invalidateQueries({ queryKey: ['agent-status'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_pauses'
        },
        () => {
          // Pausa mudou, atualizar status
          qc.invalidateQueries({ queryKey: ['agent-status'] });
        }
      )
      .subscribe();

    return () => {
      supabaseBrowser().removeChannel(channel);
    };
  }, [accessToken, qc]);

  const status = statusQ.data;

  // Timer para mostrar tempo trabalhado
  const [currentTime, setCurrentTime] = useState(Date.now());
  useEffect(() => {
    if (status?.has_active_shift && !status.is_paused) {
      const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
      return () => clearInterval(interval);
    }
  }, [status?.has_active_shift, status?.is_paused]);

  function formatMinutes(minutes: number) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  }

  function formatTime(seconds: number) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  // Calcular tempo trabalhado atual
  const currentWorkedSeconds = status?.has_active_shift && status.started_at
    ? Math.floor((currentTime - new Date(status.started_at).getTime()) / 1000) - (status.total_minutes_paused || 0) * 60
    : 0;

  async function handleStartShift() {
    setActionLoading("start");
    try {
      await apiStartShift({ accessToken });
      await qc.invalidateQueries({ queryKey: ["agent-status"] });
    } catch (err: any) {
      console.error("Erro completo ao iniciar turno:", err);
      console.error("Erro detalhado:", {
        message: err.message,
        details: err.details,
        error: err.error,
        code: err.code,
        hint: err.hint,
        status: err.status,
        fullResponse: err.fullResponse,
        rawResponse: err.rawResponse
      });
      
      const errorMessage = err.details || err.error || err.message || "Erro ao iniciar turno";
      
      // Construir mensagem detalhada
      let message = `❌ Erro ao iniciar turno\n\n${errorMessage}`;
      
      if (err.status) {
        message += `\n\nStatus HTTP: ${err.status}`;
      }
      
      if (err.code) {
        message += `\n\nCódigo: ${err.code}`;
      }
      
      if (err.hint) {
        message += `\n\nDica: ${err.hint}`;
      }
      
      if (err.fullResponse && typeof err.fullResponse === 'object') {
        const detailsStr = JSON.stringify(err.fullResponse, null, 2);
        if (detailsStr !== '{}' && detailsStr !== 'null') {
          message += `\n\nDetalhes completos:\n${detailsStr}`;
        }
      }
      
      if (err.rawResponse && err.rawResponse !== JSON.stringify(err.fullResponse)) {
        message += `\n\nResposta bruta:\n${err.rawResponse}`;
      }
      
      showToast(message, "error", 10000);
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePause() {
    if (pauseReason === "outro" && !pauseDetail.trim()) {
      showToast("Por favor, informe o motivo da pausa", "warning");
      return;
    }
    setActionLoading("pause");
    try {
      await apiPause({
        accessToken,
        reason: pauseReason,
        reason_detail: pauseReason === "outro" ? pauseDetail : undefined
      });
      setShowPauseModal(false);
      setPauseDetail("");
      await qc.invalidateQueries({ queryKey: ["agent-status"] });
      showToast("Turno pausado com sucesso", "success");
    } catch (err: any) {
      showToast(err.message || "Erro ao pausar", "error");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleResume() {
    setActionLoading("resume");
    try {
      await apiResume({ accessToken });
      await qc.invalidateQueries({ queryKey: ["agent-status"] });
      showToast("Turno retomado com sucesso", "success");
    } catch (err: any) {
      showToast(err.message || "Erro ao retomar", "error");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleEndShift() {
    setActionLoading("end");
    try {
      const result = await apiEndShift({ accessToken });
      setShowEndModal(false);
      showToast(
        `Turno encerrado! Tempo trabalhado: ${formatMinutes(result.total_minutes_worked)}. Tempo pausado: ${formatMinutes(result.total_minutes_paused)}`,
        "success",
        6000
      );
      await qc.invalidateQueries({ queryKey: ["agent-status"] });
      await qc.invalidateQueries({ queryKey: ["queue"] });
      await qc.invalidateQueries({ queryKey: ["hud-queue"] });
    } catch (err: any) {
      showToast(err.message || "Erro ao encerrar turno", "error");
    } finally {
      setActionLoading(null);
    }
  }

  if (!status) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm">
        <div className="text-sm text-gray-600 dark:text-gray-400">Carregando status...</div>
      </div>
    );
  }

  // Versão colapsada
  if (!isExpanded) {
    return (
      <div className="p-2 border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={() => setIsExpanded(true)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            {status?.has_active_shift ? (
              status.is_paused ? (
                <Pause className="w-4 h-4 text-yellow-500" />
              ) : (
                <Circle className="w-4 h-4 text-green-500 fill-green-500" />
              )
            ) : (
              <Circle className="w-4 h-4 text-gray-400" />
            )}
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {status?.has_active_shift
                ? status.is_paused
                  ? "Pausado"
                  : "Online"
                : "Fora de turno"}
            </span>
          </div>
          <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        </button>
      </div>
    );
  }

  // Versão expandida
  return (
    <>
      <div className="p-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              Meu Turno
            </span>
          </div>
          <button
            onClick={() => setIsExpanded(false)}
            className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
        </div>

        {!status.has_active_shift ? (
          <div className="space-y-3">
            <div className="text-xs text-gray-600 dark:text-gray-400 font-medium text-center py-2">
              Você não está em turno ativo
            </div>
            <button
              onClick={handleStartShift}
              disabled={actionLoading !== null}
              className="w-full px-4 py-2.5 rounded-lg bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2"
            >
              {actionLoading === "start" ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  Iniciando...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Iniciar Turno
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Timer */}
            <div className="text-center p-3 rounded-lg bg-gray-900 dark:bg-gray-900 border border-gray-700 dark:border-gray-800">
              <div className={`text-2xl font-bold font-mono ${
                status.is_paused 
                  ? "text-yellow-400" 
                  : "text-green-400"
              }`}>
                {status.is_paused ? (
                  <div className="flex items-center justify-center gap-2">
                    <Pause className="w-6 h-6" />
                    <span>Pausado</span>
                  </div>
                ) : (
                  formatTime(Math.max(0, currentWorkedSeconds))
                )}
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {status.total_minutes_paused ? `Pausado: ${formatMinutes(status.total_minutes_paused)}` : "Tempo Trabalhado"}
              </div>
            </div>

            {/* Botões de ação */}
            <div className="flex gap-2">
              {status.is_paused ? (
                <button
                  onClick={handleResume}
                  disabled={actionLoading !== null}
                  className="flex-1 px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 active:bg-green-800 text-white text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-1.5"
                >
                  {actionLoading === "resume" ? (
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      Retomar
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={() => setShowPauseModal(true)}
                  disabled={actionLoading !== null}
                  className="flex-1 px-3 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-700 active:bg-yellow-800 text-white text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-1.5"
                >
                  <Pause className="w-3.5 h-3.5" />
                  Pausar
                </button>
              )}
              <button
                onClick={() => setShowEndModal(true)}
                disabled={actionLoading !== null}
                className="flex-1 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-1.5"
              >
                <Square className="w-3.5 h-3.5" />
                Encerrar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Pausa */}
      {showPauseModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowPauseModal(false)}>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold mb-4 text-gray-900 dark:text-white">Pausar Turno</div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mb-4">Selecione o motivo da pausa:</div>
            <div className="space-y-2 mb-4">
              {(["horario_almoco", "pausa_cafe", "banheiro", "outro"] as const).map((reason) => (
                <label key={reason} className="flex items-center gap-2 text-sm cursor-pointer text-gray-900 dark:text-white">
                  <input
                    type="radio"
                    name="pause-reason"
                    checked={pauseReason === reason}
                    onChange={() => setPauseReason(reason)}
                    className="rounded"
                  />
                  <span>
                    {reason === "horario_almoco" && "🍽 Horário de almoço"}
                    {reason === "pausa_cafe" && "☕ Pausa café"}
                    {reason === "banheiro" && "🚻 Banheiro"}
                    {reason === "outro" && "📝 Outro"}
                  </span>
                </label>
              ))}
            </div>
            {pauseReason === "outro" && (
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-4">
                Detalhe o motivo:
                <textarea
                  className="mt-1 w-full rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 px-3 py-2 outline-none focus:border-[#d97757] text-gray-900 dark:text-white text-sm resize-none"
                  rows={3}
                  value={pauseDetail}
                  onChange={(e) => setPauseDetail(e.target.value)}
                  placeholder="Ex: Reunião, atendimento presencial, etc."
                />
              </label>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowPauseModal(false);
                  setPauseDetail("");
                }}
                className="flex-1 px-4 py-2 rounded-md bg-gray-800 text-white text-sm font-semibold hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handlePause}
                disabled={actionLoading === "pause" || (pauseReason === "outro" && !pauseDetail.trim())}
                className="flex-1 px-4 py-2 rounded-md bg-yellow-500 text-white text-sm font-semibold hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {actionLoading === "pause" ? "Pausando..." : "Confirmar Pausa"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Encerrar Dia */}
      {showEndModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowEndModal(false)}>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold mb-2 text-gray-900 dark:text-white">Encerrar Turno</div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mb-4">
              Tem certeza que deseja encerrar seu turno? O tempo trabalhado será calculado e salvo.
            </div>
            {status.has_active_shift && (
              <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 mb-4 text-xs border border-gray-200 dark:border-gray-700">
                <div className="text-gray-600 dark:text-gray-400 mb-1">Resumo do turno:</div>
                <div className="text-gray-900 dark:text-white">Tempo trabalhado: {formatTime(Math.max(0, currentWorkedSeconds))}</div>
                {status.total_minutes_paused ? <div className="text-gray-900 dark:text-white">Tempo pausado: {formatMinutes(status.total_minutes_paused)}</div> : null}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowEndModal(false)}
                className="flex-1 px-4 py-2 rounded-md bg-gray-800 text-white text-sm font-semibold hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleEndShift}
                disabled={actionLoading === "end"}
                className="flex-1 px-4 py-2 rounded-md bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {actionLoading === "end" ? "Encerrando..." : "Encerrar Turno"}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}

