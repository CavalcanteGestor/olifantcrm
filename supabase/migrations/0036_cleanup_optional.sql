-- ============================================================================
-- Migration 0036: Cleanup Optional (Não Urgente)
-- Data: 2026-01-28
-- Descrição: Limpeza de índices duplicados e políticas RLS antigas
-- Status: OPCIONAL - Pode ser aplicada depois se necessário
-- ============================================================================

-- ============================================================================
-- PARTE 1: REMOVER ÍNDICES DUPLICADOS
-- ============================================================================

-- Manter os índices mais antigos, remover os novos duplicados
DROP INDEX IF EXISTS public.idx_conversations_contact_id;
DROP INDEX IF EXISTS public.idx_internal_messages_conversation_id;
DROP INDEX IF EXISTS public.idx_sla_policies_tenant_id;
DROP INDEX IF EXISTS public.idx_user_roles_user_id;

-- ============================================================================
-- PARTE 2: ADICIONAR ÍNDICE FALTANTE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_conversation_tasks_conversation_id 
ON public.conversation_tasks(conversation_id);

-- ============================================================================
-- PARTE 3: REMOVER POLÍTICAS RLS ANTIGAS (Manter apenas _optimized)
-- ============================================================================

-- agent_pauses: Remover políticas antigas
DROP POLICY IF EXISTS agent_pauses_select_shift ON public.agent_pauses;
DROP POLICY IF EXISTS agent_pauses_insert_own ON public.agent_pauses;
DROP POLICY IF EXISTS agent_pauses_update_own ON public.agent_pauses;

-- agent_goals: Remover políticas antigas
DROP POLICY IF EXISTS agent_goals_select ON public.agent_goals;
DROP POLICY IF EXISTS agent_goals_insert ON public.agent_goals;
DROP POLICY IF EXISTS agent_goals_update ON public.agent_goals;

-- agent_badges: Remover política antiga
DROP POLICY IF EXISTS agent_badges_select ON public.agent_badges;

-- agent_notes: Remover políticas antigas
DROP POLICY IF EXISTS agent_notes_select ON public.agent_notes;
DROP POLICY IF EXISTS agent_notes_insert ON public.agent_notes;
DROP POLICY IF EXISTS agent_notes_update ON public.agent_notes;
DROP POLICY IF EXISTS agent_notes_delete ON public.agent_notes;

-- internal_messages: Remover políticas antigas
DROP POLICY IF EXISTS internal_messages_select ON public.internal_messages;
DROP POLICY IF EXISTS internal_messages_insert ON public.internal_messages;
DROP POLICY IF EXISTS internal_messages_update ON public.internal_messages;

-- tags: Remover política antiga com nome em português
DROP POLICY IF EXISTS "Tags visíveis por tenant" ON public.tags;

-- conversation_tags: Remover política antiga com nome em português
DROP POLICY IF EXISTS "Conv Tags visíveis por tenant" ON public.conversation_tags;

-- ============================================================================
-- COMENTÁRIOS
-- ============================================================================

COMMENT ON INDEX idx_conversation_tasks_conversation_id IS 'Índice para melhorar performance de queries de tarefas por conversa';

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- Verificar índices duplicados (deve retornar 0)
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT tablename, indexdef, COUNT(*) as cnt
    FROM pg_indexes
    WHERE schemaname = 'public'
    GROUP BY tablename, indexdef
    HAVING COUNT(*) > 1
  ) duplicates;
  
  IF duplicate_count > 0 THEN
    RAISE WARNING 'Ainda existem % índices duplicados', duplicate_count;
  ELSE
    RAISE NOTICE 'Nenhum índice duplicado encontrado!';
  END IF;
END $$;

-- Verificar políticas antigas (deve retornar apenas _optimized)
DO $$
DECLARE
  old_policies INTEGER;
BEGIN
  SELECT COUNT(*) INTO old_policies
  FROM pg_policies
  WHERE schemaname = 'public'
  AND policyname NOT LIKE '%_optimized'
  AND tablename IN ('agent_pauses', 'agent_goals', 'agent_badges', 'agent_notes', 'internal_messages', 'tags', 'conversation_tags');
  
  IF old_policies > 0 THEN
    RAISE WARNING 'Ainda existem % políticas antigas', old_policies;
  ELSE
    RAISE NOTICE 'Todas as políticas antigas foram removidas!';
  END IF;
END $$;

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
