import { z } from "zod";

export const AccessLogSchema = z.object({
  resource_type: z.enum(["conversation", "contact"]),
  resource_id: z.string().min(1)
});
