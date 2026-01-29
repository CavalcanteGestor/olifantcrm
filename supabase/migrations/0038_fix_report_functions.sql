-- ============================================================================
-- Migration 0038: Fix Report Functions Parameters
-- Data: 2026-01-28
-- Descrição: Corrige parâmetros das funções de relatório
-- Status: CRÍTICO - Aplicado imediatamente
-- ============================================================================

-- PROBLEMA:
-- A migration 0035 alterou os nomes dos parâmetros das funções de relatório
-- de p_from/p_to para p_start_date/p_end_date, mas a API ainda usa p_from/p_to

-- SOLUÇÃO:
-- Reverter para os nomes originais (p_from/p_to) para manter compatibilidade

-- ============================================================================
-- 1. REPORT_AGENTS
-- ============================================================================

DROP FUNCTION IF EXISTS public.report_agents(uuid, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.report_agents(
  p_tenant_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE(
  user_id uuid,
  full_name text,
  conversations_handled bigint,
  avg_response_time_seconds numeric,
  total_messages_sent bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.user_id,
    p.full_name,
    COUNT(DISTINCT c.id) as conversations_handled,
    AVG(EXTRACT(EPOCH FROM (m.created_at - c.created_at)))::numeric as avg_response_time_seconds,
    COUNT(m.id) as total_messages_sent
  FROM public.profiles p
  LEFT JOIN public.conversations c ON c.assigned_user_id = p.user_id
    AND c.tenant_id = p_tenant_id
    AND c.created_at BETWEEN p_from AND p_to
  LEFT JOIN public.messages m ON m.conversation_id = c.id
    AND m.direction = 'out'
    AND m.sent_by_user_id = p.user_id
  WHERE p.tenant_id = p_tenant_id
  GROUP BY p.user_id, p.full_name
  ORDER BY conversations_handled DESC;
END;
$$;

COMMENT ON FUNCTION public.report_agents IS 
  'Relatório de performance por atendente';

-- ============================================================================
-- 2. REPORT_FUNNEL_MOVES
-- ============================================================================

DROP FUNCTION IF EXISTS public.report_funnel_moves(uuid, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.report_funnel_moves(
  p_tenant_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE(
  from_stage_name text,
  to_stage_name text,
  move_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fs_from.name as from_stage_name,
    fs_to.name as to_stage_name,
    COUNT(*) as move_count
  FROM public.funnel_stage_moves fm
  JOIN public.funnel_stages fs_from ON fm.from_stage_id = fs_from.id
  JOIN public.funnel_stages fs_to ON fm.to_stage_id = fs_to.id
  WHERE fm.tenant_id = p_tenant_id
    AND fm.moved_at BETWEEN p_from AND p_to
  GROUP BY fs_from.name, fs_to.name
  ORDER BY move_count DESC;
END;
$$;

COMMENT ON FUNCTION public.report_funnel_moves IS 
  'Relatório de movimentações no funil de vendas';

-- ============================================================================
-- RECARREGAR POSTGREST
-- ============================================================================

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
