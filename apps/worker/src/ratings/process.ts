import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Processa mensagens recebidas para detectar avaliações (1-5 estrelas ou números)
 */
export async function processRatingResponse(opts: {
  supabase: SupabaseClient;
  conversationId: string;
  contactPhone: string;
  messageText: string;
  log: { info: (o: any, m?: string) => void; warn: (o: any, m?: string) => void; error: (o: any, m?: string) => void };
}) {
  const { supabase, conversationId, contactPhone, messageText, log } = opts;

  // Normalizar texto para busca
  const normalized = messageText.trim().toLowerCase();

  // Detectar número de 1 a 5 (pode estar escrito como número ou estrelas)
  let rating: number | null = null;

  // Padrão 1: número direto (1, 2, 3, 4, 5)
  const numberMatch = normalized.match(/\b([1-5])\b/);
  if (numberMatch) {
    rating = parseInt(numberMatch[1], 10);
  } else {
    // Padrão 2: estrelas (⭐, *, ★)
    const starCount = (normalized.match(/[⭐*★]/g) || []).length;
    if (starCount >= 1 && starCount <= 5) {
      rating = starCount;
    } else {
      // Padrão 3: palavras (um, dois, três, quatro, cinco)
      const wordMap: Record<string, number> = {
        um: 1,
        dois: 2,
        três: 3,
        quatro: 4,
        cinco: 5,
        one: 1,
        two: 2,
        three: 3,
        four: 4,
        five: 5
      };
      for (const [word, num] of Object.entries(wordMap)) {
        if (normalized.includes(word)) {
          rating = num;
          break;
        }
      }
    }
  }

  if (!rating) {
    return false; // Não é uma avaliação
  }

  // Verificar se a conversa foi finalizada recentemente (últimas 24 horas)
  const { data: conversation, error: convErr } = await supabase
    .from("conversations")
    .select("id, tenant_id, status_fila, updated_at")
    .eq("id", conversationId)
    .single();

  if (convErr || !conversation) {
    log.warn({ conversationId, error: convErr }, "conversation_not_found_for_rating");
    return false;
  }

  // Verificar se a conversa está finalizada
  if (conversation.status_fila !== "finalizado") {
    return false; // Não é uma avaliação válida se a conversa não está finalizada
  }

  // Verificar se foi finalizada recentemente (últimas 24 horas)
  const finalizedAt = new Date(conversation.updated_at).getTime();
  const now = Date.now();
  const hoursSinceFinalized = (now - finalizedAt) / (1000 * 60 * 60);
  if (hoursSinceFinalized > 24) {
    log.info({ conversationId, hoursSinceFinalized }, "rating_too_old");
    return false;
  }

  // Verificar se já existe avaliação para esta conversa
  const { data: existingRating, error: ratingCheckErr } = await supabase
    .from("conversation_ratings")
    .select("id")
    .eq("conversation_id", conversationId)
    .single();

  if (ratingCheckErr && ratingCheckErr.code !== "PGRST116") {
    log.error({ error: ratingCheckErr }, "failed_to_check_existing_rating");
    return false;
  }

  if (existingRating) {
    log.info({ conversationId }, "rating_already_exists");
    return false; // Já tem avaliação, não sobrescrever
  }

  // Extrair comentário (tudo após o número/estrelas)
  let comment: string | null = null;
  const ratingMatch = normalized.match(/\b([1-5])\b|[⭐*★]{1,5}/);
  if (ratingMatch && ratingMatch.index !== undefined) {
    const afterRating = messageText.slice(ratingMatch.index + ratingMatch[0].length).trim();
    if (afterRating.length > 0) {
      comment = afterRating;
    }
  }

  // Salvar avaliação
  const { error: insertErr } = await supabase.from("conversation_ratings").insert({
    tenant_id: conversation.tenant_id,
    conversation_id: conversationId,
    rating,
    comment: comment || null,
    contact_phone: contactPhone
  });

  if (insertErr) {
    log.error({ error: insertErr, conversationId }, "failed_to_save_rating");
    return false;
  }

  log.info({ conversationId, rating, hasComment: !!comment }, "rating_saved");
  return true;
}

