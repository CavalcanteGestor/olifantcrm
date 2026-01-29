-- ============================================================================
-- Migration 0037: Fix Profiles RLS Infinite Recursion
-- Data: 2026-01-28
-- Descrição: Corrige recursão infinita na política RLS de profiles
-- Status: CRÍTICO - Aplicado imediatamente
-- ============================================================================

-- PROBLEMA:
-- A política profiles_select_optimized criada na migration 0035 causou
-- recursão infinita porque fazia uma subquery em profiles que chamava
-- a própria política novamente, criando um loop infinito.

-- SOLUÇÃO:
-- Voltar para as políticas originais que funcionavam corretamente.

-- ============================================================================
-- REMOVER POLÍTICA PROBLEMÁTICA
-- ============================================================================

DROP POLICY IF EXISTS profiles_select_optimized ON public.profiles;

-- ============================================================================
-- RECRIAR POLÍTICAS ORIGINAIS
-- ============================================================================

-- Política 1: Usuário pode ver seu próprio perfil
CREATE POLICY profiles_select_self ON public.profiles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Política 2: Usuário pode ver perfis do mesmo tenant
CREATE POLICY profiles_select_tenant ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (
      SELECT p.tenant_id 
      FROM public.profiles p 
      WHERE p.user_id = auth.uid()
      LIMIT 1
    )
  );

-- ============================================================================
-- COMENTÁRIOS
-- ============================================================================

COMMENT ON POLICY profiles_select_self ON public.profiles IS 
  'Permite que usuário veja seu próprio perfil';

COMMENT ON POLICY profiles_select_tenant ON public.profiles IS 
  'Permite que usuário veja perfis do mesmo tenant';

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================

-- Verificar se as políticas foram criadas corretamente
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
  AND tablename = 'profiles'
  AND policyname IN ('profiles_select_self', 'profiles_select_tenant');
  
  IF policy_count = 2 THEN
    RAISE NOTICE 'Políticas de profiles criadas com sucesso!';
  ELSE
    RAISE WARNING 'Esperado 2 políticas, encontrado %', policy_count;
  END IF;
END $$;

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
