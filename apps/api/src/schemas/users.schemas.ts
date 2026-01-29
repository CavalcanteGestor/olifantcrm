import { z } from "zod";

export const InviteUserSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1),
  password: z.string().min(8).optional(),
  role: z.enum(["admin", "secretaria"]).default("secretaria"),
  send_invite: z.boolean().default(true)
});
