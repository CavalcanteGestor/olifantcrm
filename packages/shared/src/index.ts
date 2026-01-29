import { z } from "zod";

export const ContactStatusSchema = z.enum(["lead", "paciente", "paciente_recorrente"]);
export type ContactStatus = z.infer<typeof ContactStatusSchema>;

export const ConversationQueueStatusSchema = z.enum([
  "aguardando_atendimento",
  "em_atendimento",
  "aguardando_paciente",
  "finalizado"
]);
export type ConversationQueueStatus = z.infer<typeof ConversationQueueStatusSchema>;


