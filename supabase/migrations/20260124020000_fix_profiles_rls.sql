-- Habilitar service_role para bypass RLS na tabela profiles (se não for default)
-- Na verdade, service_role DEVERIA bypassar tudo. Se falhou com service_role, pode ser que a tabela não tenha RLS habilitado mas tenha triggers restritivas, OU a chave usada não é service_role (mas parece ser).
-- Vamos tentar uma inserção direta via SQL se possível, mas não temos psql fácil aqui.
-- O erro 42501 é permission denied.
-- Vamos tentar criar um script que insere na tabela profiles usando o client do Supabase, mas garantindo que o client tenha auth configurado como service_role.

-- Tentativa de fix via SQL Migration
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access for service role" ON profiles
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
