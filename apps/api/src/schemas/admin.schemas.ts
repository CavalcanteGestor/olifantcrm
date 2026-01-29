import { z } from "zod";

export const GoalSchema = z.object({
  month_year: z.string().regex(/^\d{4}-\d{2}$/),
  goal_conversations: z.number().int().positive().optional(),
  goal_avg_rating: z.number().min(1).max(5).optional(),
  goal_avg_response_seconds: z.number().int().positive().optional(),
  goal_sla_compliance_percent: z.number().min(0).max(100).optional()
});

export const NoteSchema = z.object({ note_text: z.string().min(1) });

export const PauseSchema = z.object({
  reason: z.enum(["horario_almoco", "pausa_cafe", "banheiro", "outro"]),
  reason_detail: z.string().optional()
}).refine((data) => data.reason !== "outro" || !!data.reason_detail, {
  message: "reason_detail é obrigatório quando reason é 'outro'"
});
