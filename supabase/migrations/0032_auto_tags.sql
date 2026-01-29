-- Tabela de Tags (Etiquetas)
CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1', -- Indigo
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, name)
);

-- Relacionamento Conversa <-> Tag
CREATE TABLE IF NOT EXISTS public.conversation_tags (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (conversation_id, tag_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_tags_tenant ON public.tags(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conv_tags_conv ON public.conversation_tags(conversation_id);

-- RLS
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tags visíveis por tenant" ON public.tags
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Conv Tags visíveis por tenant" ON public.conversation_tags
  FOR ALL USING (
    conversation_id IN (
      SELECT id FROM conversations WHERE tenant_id = (SELECT tenant_id FROM profiles WHERE user_id = auth.uid())
    )
  );
