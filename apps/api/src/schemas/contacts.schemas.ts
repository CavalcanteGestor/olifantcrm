import { z } from "zod";
import { ContactStatusSchema } from "@crmolifant/shared";

export const ContactUpdateSchema = z.object({
  display_name: z.string().max(200).optional(),
  status: ContactStatusSchema.optional(),
  tags: z.array(z.string()).optional(),
  internal_notes: z.string().max(5000).optional()
});

export const MergeSchema = z.object({
  keep_contact_id: z.string().uuid(),
  merge_contact_id: z.string().uuid()
});
