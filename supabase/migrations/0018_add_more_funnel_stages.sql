-- Migration 0018: Adicionar mais etapas do funil (Paciente, etc.)

-- Adicionar novas etapas do funil para todos os tenants existentes
DO $$
DECLARE
  tenant_record RECORD;
  max_sort_order INT;
BEGIN
  -- Para cada tenant, adicionar as novas etapas se não existirem
  FOR tenant_record IN SELECT id FROM public.tenants LOOP
    -- Obter o maior sort_order atual
    SELECT COALESCE(MAX(sort_order), -1) INTO max_sort_order
    FROM public.funnel_stages
    WHERE tenant_id = tenant_record.id;
    
    -- Adicionar "Paciente Novo" (após Consulta Realizada)
    IF NOT EXISTS (
      SELECT 1 FROM public.funnel_stages 
      WHERE tenant_id = tenant_record.id AND name = 'Paciente Novo'
    ) THEN
      INSERT INTO public.funnel_stages (tenant_id, name, sort_order)
      VALUES (tenant_record.id, 'Paciente Novo', max_sort_order + 1);
    END IF;
    
    -- Adicionar "Em Tratamento"
    IF NOT EXISTS (
      SELECT 1 FROM public.funnel_stages 
      WHERE tenant_id = tenant_record.id AND name = 'Em Tratamento'
    ) THEN
      INSERT INTO public.funnel_stages (tenant_id, name, sort_order)
      VALUES (tenant_record.id, 'Em Tratamento', max_sort_order + 2);
    END IF;
    
    -- Adicionar "Retorno Agendado"
    IF NOT EXISTS (
      SELECT 1 FROM public.funnel_stages 
      WHERE tenant_id = tenant_record.id AND name = 'Retorno Agendado'
    ) THEN
      INSERT INTO public.funnel_stages (tenant_id, name, sort_order)
      VALUES (tenant_record.id, 'Retorno Agendado', max_sort_order + 3);
    END IF;
    
    -- Adicionar "Aguardando Pagamento"
    IF NOT EXISTS (
      SELECT 1 FROM public.funnel_stages 
      WHERE tenant_id = tenant_record.id AND name = 'Aguardando Pagamento'
    ) THEN
      INSERT INTO public.funnel_stages (tenant_id, name, sort_order)
      VALUES (tenant_record.id, 'Aguardando Pagamento', max_sort_order + 4);
    END IF;
    
    -- Adicionar "Finalizado"
    IF NOT EXISTS (
      SELECT 1 FROM public.funnel_stages 
      WHERE tenant_id = tenant_record.id AND name = 'Finalizado'
    ) THEN
      INSERT INTO public.funnel_stages (tenant_id, name, sort_order)
      VALUES (tenant_record.id, 'Finalizado', max_sort_order + 5);
    END IF;
    
    -- Adicionar "Cancelado"
    IF NOT EXISTS (
      SELECT 1 FROM public.funnel_stages 
      WHERE tenant_id = tenant_record.id AND name = 'Cancelado'
    ) THEN
      INSERT INTO public.funnel_stages (tenant_id, name, sort_order)
      VALUES (tenant_record.id, 'Cancelado', max_sort_order + 6);
    END IF;
  END LOOP;
END $$;

COMMENT ON TABLE public.funnel_stages IS 'Etapas do funil de vendas/atendimento - Agora inclui etapas para Paciente, Tratamento, Retorno, etc.';
