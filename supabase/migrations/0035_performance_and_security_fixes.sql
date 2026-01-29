-- ============================================================================
-- Migration 0035: Performance and Security Fixes
-- Data: 2026-01-28
-- Descrição: Corrige todos os problemas identificados pelo Supabase Advisor
-- ============================================================================

-- ============================================================================
-- PARTE 1: CRIAR ÍNDICES NAS FOREIGN KEYS (Performance)
-- ============================================================================

-- access_logs
CREATE INDEX IF NOT EXISTS idx_access_logs_actor_user_id ON public.access_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_tenant_id ON public.access_logs(tenant_id);

-- agent_badges
CREATE INDEX IF NOT EXISTS idx_agent_badges_user_id ON public.agent_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_badges_tenant_id ON public.agent_badges(tenant_id);

-- agent_goals
CREATE INDEX IF NOT EXISTS idx_agent_goals_user_id ON public.agent_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_goals_tenant_id ON public.agent_goals(tenant_id);

-- agent_notes
CREATE INDEX IF NOT EXISTS idx_agent_notes_created_by_user_id ON public.agent_notes(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_agent_notes_user_id ON public.agent_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_notes_tenant_id ON public.agent_notes(tenant_id);

-- agent_shifts
CREATE INDEX IF NOT EXISTS idx_agent_shifts_user_id ON public.agent_shifts(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_shifts_tenant_id ON public.agent_shifts(tenant_id);

-- audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON public.audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON public.audit_logs(tenant_id);

-- canned_responses
CREATE INDEX IF NOT EXISTS idx_canned_responses_created_by ON public.canned_responses(created_by);
CREATE INDEX IF NOT EXISTS idx_canned_responses_tenant_id ON public.canned_responses(tenant_id);

-- conversation_tags
CREATE INDEX IF NOT EXISTS idx_conversation_tags_tag_id ON public.conversation_tags(tag_id);

-- conversation_tasks
CREATE INDEX IF NOT EXISTS idx_conversation_tasks_assigned_to ON public.conversation_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_conversation_tasks_created_by ON public.conversation_tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_conversation_tasks_tenant_id ON public.conversation_tasks(tenant_id);

-- conversations (CRÍTICO - muito usado)
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_user_id ON public.conversations(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_current_stage_id ON public.conversations(current_stage_id);
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_id ON public.conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_contact_id ON public.conversations(contact_id);

-- funnel_moves
CREATE INDEX IF NOT EXISTS idx_funnel_moves_from_stage_id ON public.funnel_moves(from_stage_id);
CREATE INDEX IF NOT EXISTS idx_funnel_moves_moved_by_user_id ON public.funnel_moves(moved_by_user_id);
CREATE INDEX IF NOT EXISTS idx_funnel_moves_tenant_id ON public.funnel_moves(tenant_id);
CREATE INDEX IF NOT EXISTS idx_funnel_moves_to_stage_id ON public.funnel_moves(to_stage_id);

-- internal_messages (CRÍTICO - muito usado)
CREATE INDEX IF NOT EXISTS idx_internal_messages_from_user_id ON public.internal_messages(from_user_id);
CREATE INDEX IF NOT EXISTS idx_internal_messages_to_user_id ON public.internal_messages(to_user_id);
CREATE INDEX IF NOT EXISTS idx_internal_messages_tenant_id ON public.internal_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_internal_messages_conversation_id ON public.internal_messages(conversation_id);

-- jobs
CREATE INDEX IF NOT EXISTS idx_jobs_tenant_id ON public.jobs(tenant_id);

-- media_assets
CREATE INDEX IF NOT EXISTS idx_media_assets_conversation_id ON public.media_assets(conversation_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_message_id ON public.media_assets(message_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_tenant_id ON public.media_assets(tenant_id);

-- messages (CRÍTICO - muito usado)
CREATE INDEX IF NOT EXISTS idx_messages_sent_by_user_id ON public.messages(sent_by_user_id);
CREATE INDEX IF NOT EXISTS idx_messages_tenant_id ON public.messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);

-- outbox_events
CREATE INDEX IF NOT EXISTS idx_outbox_events_tenant_id ON public.outbox_events(tenant_id);

-- sla_events (CRÍTICO - muito usado)
CREATE INDEX IF NOT EXISTS idx_sla_events_assigned_user_id ON public.sla_events(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_sla_events_conversation_id ON public.sla_events(conversation_id);
CREATE INDEX IF NOT EXISTS idx_sla_events_policy_id ON public.sla_events(policy_id);
CREATE INDEX IF NOT EXISTS idx_sla_events_tenant_id ON public.sla_events(tenant_id);

-- sla_policies
CREATE INDEX IF NOT EXISTS idx_sla_policies_stage_id ON public.sla_policies(stage_id);
CREATE INDEX IF NOT EXISTS idx_sla_policies_tenant_id ON public.sla_policies(tenant_id);

-- sla_timers
CREATE INDEX IF NOT EXISTS idx_sla_timers_current_policy_id ON public.sla_timers(current_policy_id);
CREATE INDEX IF NOT EXISTS idx_sla_timers_tenant_id ON public.sla_timers(tenant_id);

-- user_roles
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON public.user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_tenant_id ON public.user_roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);

-- ============================================================================
-- PARTE 2: REMOVER ÍNDICES NÃO UTILIZADOS (Limpeza)
-- ============================================================================

DROP INDEX IF EXISTS public.conversation_tasks_conv_idx;
DROP INDEX IF EXISTS public.agent_badges_key_idx;
DROP INDEX IF EXISTS public.internal_messages_unread_idx;
DROP INDEX IF EXISTS public.idx_tags_tenant;
DROP INDEX IF EXISTS public.idx_conv_tags_conv;

-- ============================================================================
-- PARTE 3: CORRIGIR FUNÇÕES COM SEARCH_PATH MUTÁVEL (Segurança)
-- ============================================================================

-- Função: prevent_message_mutation
CREATE OR REPLACE FUNCTION public.prevent_message_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Messages cannot be updated or deleted';
END;
$$;

-- Função: current_user_id
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid();
$$;

-- Função: prevent_update_delete
CREATE OR REPLACE FUNCTION public.prevent_update_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'This record cannot be updated or deleted';
END;
$$;

-- Função: row_belongs_to_tenant
CREATE OR REPLACE FUNCTION public.row_belongs_to_tenant(row_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  user_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO user_tenant_id
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  RETURN row_tenant_id = user_tenant_id;
END;
$$;

-- Função: report_message_volume_daily
CREATE OR REPLACE FUNCTION public.report_message_volume_daily(
  p_tenant_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE(
  date date,
  inbound_count bigint,
  outbound_count bigint,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(m.created_at) as date,
    COUNT(*) FILTER (WHERE m.direction = 'in') as inbound_count,
    COUNT(*) FILTER (WHERE m.direction = 'out') as outbound_count,
    COUNT(*) as total_count
  FROM public.messages m
  WHERE m.tenant_id = p_tenant_id
    AND DATE(m.created_at) BETWEEN p_start_date AND p_end_date
  GROUP BY DATE(m.created_at)
  ORDER BY date;
END;
$$;

-- Função: report_agents
CREATE OR REPLACE FUNCTION public.report_agents(
  p_tenant_id uuid,
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone
)
RETURNS TABLE(
  user_id uuid,
  full_name text,
  conversations_handled bigint,
  avg_response_time_seconds numeric,
  total_messages_sent bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
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
    AND c.created_at BETWEEN p_start_date AND p_end_date
  LEFT JOIN public.messages m ON m.conversation_id = c.id
    AND m.direction = 'out'
    AND m.sent_by_user_id = p.user_id
  WHERE p.tenant_id = p_tenant_id
  GROUP BY p.user_id, p.full_name
  ORDER BY conversations_handled DESC;
END;
$$;

-- Função: report_funnel_moves
CREATE OR REPLACE FUNCTION public.report_funnel_moves(
  p_tenant_id uuid,
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone
)
RETURNS TABLE(
  from_stage_name text,
  to_stage_name text,
  move_count bigint,
  avg_time_in_stage_hours numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fs_from.name as from_stage_name,
    fs_to.name as to_stage_name,
    COUNT(*) as move_count,
    AVG(EXTRACT(EPOCH FROM (fm.moved_at - c.last_stage_moved_at)) / 3600)::numeric as avg_time_in_stage_hours
  FROM public.funnel_moves fm
  LEFT JOIN public.funnel_stages fs_from ON fs_from.id = fm.from_stage_id
  LEFT JOIN public.funnel_stages fs_to ON fs_to.id = fm.to_stage_id
  LEFT JOIN public.conversations c ON c.id = fm.conversation_id
  WHERE fm.tenant_id = p_tenant_id
    AND fm.moved_at BETWEEN p_start_date AND p_end_date
  GROUP BY fs_from.name, fs_to.name
  ORDER BY move_count DESC;
END;
$$;

-- ============================================================================
-- PARTE 4: OTIMIZAR POLÍTICAS RLS (Performance)
-- ============================================================================

-- profiles: Combinar políticas SELECT e otimizar
DROP POLICY IF EXISTS profiles_select_self ON public.profiles;
DROP POLICY IF EXISTS profiles_select_tenant ON public.profiles;

CREATE POLICY profiles_select_optimized ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE user_id = (SELECT auth.uid())
    )
  );

-- agent_shifts: Otimizar políticas
DROP POLICY IF EXISTS agent_shifts_select_own ON public.agent_shifts;
DROP POLICY IF EXISTS agent_shifts_insert_own ON public.agent_shifts;
DROP POLICY IF EXISTS agent_shifts_update_own ON public.agent_shifts;

CREATE POLICY agent_shifts_select_optimized ON public.agent_shifts
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY agent_shifts_insert_optimized ON public.agent_shifts
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY agent_shifts_update_optimized ON public.agent_shifts
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- agent_pauses: Otimizar políticas
DROP POLICY IF EXISTS agent_pauses_select_shift ON public.agent_pauses;
DROP POLICY IF EXISTS agent_pauses_insert_own ON public.agent_pauses;
DROP POLICY IF EXISTS agent_pauses_update_own ON public.agent_pauses;

CREATE POLICY agent_pauses_select_optimized ON public.agent_pauses
  FOR SELECT
  TO authenticated
  USING (
    shift_id IN (
      SELECT id FROM public.agent_shifts WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY agent_pauses_insert_optimized ON public.agent_pauses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    shift_id IN (
      SELECT id FROM public.agent_shifts WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY agent_pauses_update_optimized ON public.agent_pauses
  FOR UPDATE
  TO authenticated
  USING (
    shift_id IN (
      SELECT id FROM public.agent_shifts WHERE user_id = (SELECT auth.uid())
    )
  );

-- agent_goals: Otimizar políticas
DROP POLICY IF EXISTS agent_goals_select ON public.agent_goals;
DROP POLICY IF EXISTS agent_goals_insert ON public.agent_goals;
DROP POLICY IF EXISTS agent_goals_update ON public.agent_goals;

CREATE POLICY agent_goals_select_optimized ON public.agent_goals
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY agent_goals_insert_optimized ON public.agent_goals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY agent_goals_update_optimized ON public.agent_goals
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE user_id = (SELECT auth.uid())
    )
  );

-- agent_badges: Otimizar política
DROP POLICY IF EXISTS agent_badges_select ON public.agent_badges;

CREATE POLICY agent_badges_select_optimized ON public.agent_badges
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE user_id = (SELECT auth.uid())
    )
  );

-- agent_notes: Otimizar políticas
DROP POLICY IF EXISTS agent_notes_select ON public.agent_notes;
DROP POLICY IF EXISTS agent_notes_insert ON public.agent_notes;
DROP POLICY IF EXISTS agent_notes_update ON public.agent_notes;
DROP POLICY IF EXISTS agent_notes_delete ON public.agent_notes;

CREATE POLICY agent_notes_select_optimized ON public.agent_notes
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY agent_notes_insert_optimized ON public.agent_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY agent_notes_update_optimized ON public.agent_notes
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY agent_notes_delete_optimized ON public.agent_notes
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE user_id = (SELECT auth.uid())
    )
  );

-- internal_messages: Otimizar políticas
DROP POLICY IF EXISTS internal_messages_select ON public.internal_messages;
DROP POLICY IF EXISTS internal_messages_insert ON public.internal_messages;
DROP POLICY IF EXISTS internal_messages_update ON public.internal_messages;

CREATE POLICY internal_messages_select_optimized ON public.internal_messages
  FOR SELECT
  TO authenticated
  USING (
    from_user_id = (SELECT auth.uid())
    OR to_user_id = (SELECT auth.uid())
    OR to_user_id IS NULL
  );

CREATE POLICY internal_messages_insert_optimized ON public.internal_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (from_user_id = (SELECT auth.uid()));

CREATE POLICY internal_messages_update_optimized ON public.internal_messages
  FOR UPDATE
  TO authenticated
  USING (
    to_user_id = (SELECT auth.uid())
    OR from_user_id = (SELECT auth.uid())
  );

-- tags: Otimizar política
DROP POLICY IF EXISTS "Tags visíveis por tenant" ON public.tags;

CREATE POLICY tags_select_optimized ON public.tags
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE user_id = (SELECT auth.uid())
    )
  );

-- conversation_tags: Otimizar política
DROP POLICY IF EXISTS "Conv Tags visíveis por tenant" ON public.conversation_tags;

CREATE POLICY conversation_tags_select_optimized ON public.conversation_tags
  FOR SELECT
  TO authenticated
  USING (
    conversation_id IN (
      SELECT c.id FROM public.conversations c
      INNER JOIN public.profiles p ON p.tenant_id = c.tenant_id
      WHERE p.user_id = (SELECT auth.uid())
    )
  );

-- ============================================================================
-- COMENTÁRIOS E DOCUMENTAÇÃO
-- ============================================================================

COMMENT ON INDEX idx_messages_tenant_id IS 'Índice para melhorar performance de queries filtradas por tenant';
COMMENT ON INDEX idx_conversations_assigned_user_id IS 'Índice para melhorar performance de queries de conversas por atendente';
COMMENT ON INDEX idx_internal_messages_from_user_id IS 'Índice para melhorar performance de mensagens internas';

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
