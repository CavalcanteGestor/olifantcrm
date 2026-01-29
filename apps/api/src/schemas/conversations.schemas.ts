import { z } from "zod";

export const SendTextSchema = z.object({
  conversation_id: z.string().uuid(),
  text: z.string().min(1).max(2000),
  client_timestamp: z.string().datetime().optional() // Timestamp do cliente (quando clicou enviar)
});

export const ScheduleTextSchema = z.object({
  conversation_id: z.string().uuid(),
  text: z.string().min(1).max(2000),
  run_at: z.string().datetime()
});

export const SendMediaSchema = z.object({
  conversation_id: z.string().uuid(),
  media_type: z.enum(["image", "audio", "video", "document"]),
  mime_type: z.string().optional(),
  file_data: z.string(), // base64
  file_name: z.string().optional(),
  caption: z.string().optional(),
  client_timestamp: z.string().datetime().optional() // Timestamp do cliente (quando clicou enviar)
});

export const MessageReactSchema = z.object({
  emoji: z.string().min(1)
});

export const SendTemplateSchema = z.object({
  template_name: z.string().min(1),
  language: z.string().min(1),
  components: z.array(z.any()).optional()
});

export const TaskCreateSchema = z.object({
  title: z.string().min(1).max(200),
  due_at: z.string().datetime().optional(),
  reminder_enabled: z.boolean().optional().default(false)
});

export const TaskStatusSchema = z.object({ status: z.enum(["open", "done", "cancelled"]) });

export const TransferSchema = z.object({
  user_id: z.string().uuid(),
  reason: z.string().optional()
});

export const MoveStageSchema = z.object({ stage_id: z.string().uuid() });

export const RateConversationSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
  contact_phone: z.string().optional()
});
