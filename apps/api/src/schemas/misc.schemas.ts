import { z } from "zod";

export const CannedUpsertSchema = z.object({
  title: z.string().min(1).max(80),
  shortcut: z.string().min(1).max(40),
  body_template: z.string().min(1).max(5000)
});

export const FunnelStageUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(80),
  sort_order: z.number().int().min(0).max(9999)
});

export const SlaPolicyUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  stage_id: z.string().uuid().nullable().optional(),
  contact_status: z.enum(["lead", "paciente", "paciente_recorrente"]).nullable().optional(),
  response_seconds: z.number().int().min(30).max(86_400),
  warning_threshold_percent: z.number().int().min(1).max(99).default(80)
});
