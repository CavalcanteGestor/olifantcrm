import { FastifyInstance } from "fastify";
import { requireAuth, getTenantIdForUser } from "../lib/auth.js";
import { supabase } from "../lib/supabase.js";
import { z } from "zod";

export async function reactionsRoutes(app: FastifyInstance) {
  app.post("/api/messages/:messageId/reactions", async (req, reply) => {
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const tenantId = await getTenantIdForUser(userId);

    const { messageId } = req.params as { messageId: string };
    const schema = z.object({ emoji: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });

    // Check if table exists implicitly by catching error
    try {
      const { data: existing, error: findError } = await supabase
        .from("message_reactions")
        .select("id")
        .eq("message_id", messageId)
        .eq("user_id", userId)
        .eq("emoji", parsed.data.emoji)
        .single();

      if (findError && findError.code !== 'PGRST116') { // PGRST116 is 'not found'
         // If error is 404 table not found (Postgres 42P01), we can't do anything.
         throw findError;
      }

      if (existing) {
        await supabase.from("message_reactions").delete().eq("id", existing.id);
        return reply.send({ action: "removed" });
      } else {
        const { error } = await supabase.from("message_reactions").insert({
          tenant_id: tenantId,
          message_id: messageId,
          user_id: userId,
          emoji: parsed.data.emoji
        });
        if (error) throw error;
        return reply.send({ action: "added" });
      }
    } catch (e: any) {
      req.log.error(e);
      return reply.code(500).send({ error: "reaction_failed", details: e.message });
    }
  });
}
