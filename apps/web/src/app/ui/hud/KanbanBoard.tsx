"use client";

import { useEffect, useState } from "react";
import { GripVertical, ChevronRight } from "lucide-react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable
} from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { apiListStages, apiMoveStage } from "@/lib/api";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Stage = { id: string; name: string; sort_order: number };

type KanbanBoardProps = {
  accessToken: string;
  conversationId: string | null;
  currentStageId: string | null;
  onMove: () => void;
  simple?: boolean; // Se true, usa versão simplificada sem drag and drop (para HUD)
};

function DroppableStage({ stage, children, conversationId }: { stage: Stage; children: React.ReactNode; conversationId: string | null }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div ref={setNodeRef} className="flex-shrink-0 w-[140px] flex flex-col">
      <div className={`text-[10px] font-semibold mb-1.5 px-2 truncate ${isOver ? "text-blue-600 dark:text-blue-400" : "text-gray-700 dark:text-gray-300"}`} title={stage.name}>
        {stage.name}
      </div>
      <div
        className={`flex-1 min-h-[70px] border rounded-md p-1.5 transition-colors ${
          isOver ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/50"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function DraggableConversation({ conversationId, isActive }: { conversationId: string; isActive: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: conversationId });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`p-1.5 rounded border cursor-move flex items-center gap-1 ${
        isActive ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
      }`}
    >
      <GripVertical className="w-2.5 h-2.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
      <div className="text-[10px] text-gray-600 dark:text-gray-300 leading-tight truncate">Arraste</div>
    </div>
  );
}

export default function KanbanBoard({ accessToken, conversationId, currentStageId, onMove, simple = false }: KanbanBoardProps) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    })
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await apiListStages({ accessToken });
        if (!alive) return;
        setStages(data.items);
      } catch (err: any) {
        // Se a API não estiver disponível, buscar diretamente do Supabase
        if (err.message?.includes('ERR_CONNECTION_REFUSED') || err.message?.includes('Failed to fetch')) {
          try {
            const { data: session } = await supabaseBrowser().auth.getSession();
            if (!session.session || !alive) return;
            
            const { data: profile } = await supabaseBrowser()
              .from("profiles")
              .select("tenant_id")
              .eq("user_id", session.session.user.id)
              .maybeSingle();
            
            if (!profile || !alive) return;
            
            const { data: stagesData } = await supabaseBrowser()
              .from("funnel_stages")
              .select("id, name, sort_order")
              .eq("tenant_id", (profile as any).tenant_id)
              .order("sort_order", { ascending: true });
            
            if (alive) {
              setStages((stagesData || []).map((s: any) => ({
                id: s.id,
                name: s.name,
                sort_order: s.sort_order
              })));
            }
          } catch (supabaseErr) {
            // Erro ao buscar do Supabase
          }
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [accessToken]);

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    if (!conversationId || !event.over) return;

    const targetStageId = event.over.id as string;
    
    // Verificar se o ID é de um estágio (não da conversa)
    const isStageId = stages.some(s => s.id === targetStageId);
    if (!isStageId) {
      // Se não for um estágio, pode ser que o usuário soltou na conversa mesma
      return;
    }

    if (!targetStageId || targetStageId === currentStageId) return;

    // Validar que é um UUID válido
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(targetStageId)) {
      console.error("ID de estágio inválido:", targetStageId);
      alert("Erro: ID de estágio inválido. Por favor, tente novamente.");
      return;
    }

    setMoving(true);
    try {
      await apiMoveStage({ accessToken, conversationId, stageId: targetStageId });
      onMove();
    } catch (err: any) {
      let errorMsg = "Erro ao mover conversa para esta etapa";
      if (err.details) {
        errorMsg = err.details;
      } else if (err.message) {
        if (err.message === "already_at_stage") {
          errorMsg = "A conversa já está nesta etapa";
        } else if (err.message === "stage_not_found") {
          errorMsg = "Etapa não encontrada";
        } else if (err.message === "conversation_not_found") {
          errorMsg = "Conversa não encontrada";
        } else {
          errorMsg = err.message;
        }
      }
      alert(`Erro: ${errorMsg}`);
      console.error("Erro ao mover conversa:", { err, targetStageId, conversationId, currentStageId });
    } finally {
      setMoving(false);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  if (loading) {
    return <div className="text-xs text-gray-500 dark:text-gray-400">Carregando etapas...</div>;
  }

  if (stages.length === 0) {
    return <div className="text-xs text-gray-500 dark:text-gray-400">Nenhuma etapa configurada</div>;
  }

  if (!conversationId) {
    return <div className="text-xs text-gray-500 dark:text-gray-400">Selecione uma conversa para movimentar</div>;
  }

  // Versão simplificada para HUD (sem drag and drop)
  if (simple) {
    const currentStage = stages.find(s => s.id === currentStageId);
    
    async function handleStageChange(newStageId: string | null) {
      if (!newStageId || newStageId === currentStageId) return;
      
      setMoving(true);
      try {
        await apiMoveStage({ accessToken, conversationId, stageId: newStageId } as { accessToken: string; conversationId: string; stageId: string });
        onMove();
      } catch (err: any) {
        let errorMsg = "Erro ao mover conversa para esta etapa";
        if (err.details) {
          errorMsg = err.details;
        } else if (err.message) {
          if (err.message === "already_at_stage") {
            errorMsg = "A conversa já está nesta etapa";
          } else if (err.message === "stage_not_found") {
            errorMsg = "Etapa não encontrada";
          } else if (err.message === "conversation_not_found") {
            errorMsg = "Conversa não encontrada";
          } else {
            errorMsg = err.message;
          }
        }
        alert(`Erro: ${errorMsg}`);
      } finally {
        setMoving(false);
      }
    }

    return (
      <div className="relative">
        <div className="flex items-center gap-2">
          <div className="text-[10px] text-gray-600 dark:text-gray-400 font-medium">
            Etapa atual:
          </div>
          <select
            value={currentStageId || ""}
            onChange={(e) => {
              if (e.target.value) {
                void handleStageChange(e.target.value);
              }
            }}
            disabled={moving}
            className="flex-1 text-[10px] px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </div>
        {moving && (
          <div className="absolute inset-0 bg-gray-900/50 dark:bg-gray-900/50 flex items-center justify-center z-10 rounded">
            <div className="text-[10px] text-gray-300">Movendo...</div>
          </div>
        )}
      </div>
    );
  }

  // Versão completa com drag and drop (para página dedicada)
  return (
    <div className="relative">
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div 
          className="flex gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgb(209 213 219) transparent'
          }}
        >
          {stages.map((stage) => (
            <DroppableStage key={stage.id} stage={stage} conversationId={conversationId}>
              {currentStageId === stage.id && conversationId ? (
                <DraggableConversation conversationId={conversationId} isActive={true} />
              ) : (
                <div className="text-[10px] text-gray-400 dark:text-gray-500 text-center py-3 flex flex-col items-center justify-center gap-0.5">
                  <ChevronRight className="w-2.5 h-2.5" />
                  <span className="leading-tight">Soltar</span>
                </div>
              )}
            </DroppableStage>
          ))}
        </div>
        <DragOverlay>
          {activeId ? (
            <div className="w-32 h-16 bg-gray-800 dark:bg-gray-900 border border-gray-700 rounded-lg p-2 flex items-center justify-center shadow-lg">
              <div className="text-xs text-gray-300">Movendo...</div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {moving && (
        <div className="absolute inset-0 bg-gray-900/80 dark:bg-gray-900/80 flex items-center justify-center z-20 rounded-lg">
          <div className="text-xs text-gray-300">Movendo conversa...</div>
        </div>
      )}
    </div>
  );
}

