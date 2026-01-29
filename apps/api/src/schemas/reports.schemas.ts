import { z } from "zod";

export const RangeSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime()
});
