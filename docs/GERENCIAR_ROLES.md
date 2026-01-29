# 👥 Guia de Gerenciamento de Roles (Papéis)

## Visão Geral

O sistema tem 3 roles (papéis) principais:

| Role no Banco | Aparece como | Permissões |
|---------------|--------------|------------|
| `secretaria` | Secretária | Atender conversas, ver fila, criar tarefas |
| `coordenador` | Admin | Todas as permissões + transferir, ver relatórios, gerenciar usuários |
| `admin` | Administrador | Permissões especiais do sistema (raramente usado) |

**IMPORTANTE:** No frontend, `coordenador` aparece como "Admin" para simplificar.

---

## 🔍 Como Verificar Roles dos Usuários

### Opção 1: Pela Interface Web (Recomendado)

1. Faça login como **Admin**
2. Vá em **Configurações → Usuários**
3. Veja a lista com todos os usuários e seus roles
4. Cada usuário tem um dropdown para alterar o role

### Opção 2: Via SQL (Detalhado)

1. Abra o **Supabase SQL Editor**
2. Execute o script: `olifantcrm/tools/list-all-users-roles.sql`
3. Você verá 6 queries diferentes:
   - **Query 1**: Visão geral (recomendada)
   - **Query 2**: Detalhada (uma linha por role)
   - **Query 3**: Usuários sem role (problemas)
   - **Query 4**: Usuários com múltiplos roles (pode ser problema)
   - **Query 5**: Estatísticas por role
   - **Query 6**: Todos os roles disponíveis

---

## ✏️ Como Corrigir Roles

### Método 1: Pela Interface Web (MAIS FÁCIL)

**Para mudar o role de um usuário:**

1. Vá em **Configurações → Usuários**
2. Encontre o usuário na lista
3. Clique no dropdown ao lado do nome
4. Selecione o novo role:
   - **Secretária** → Para atendentes
   - **Admin** → Para coordenadores/supervisores
5. Pronto! O sistema automaticamente:
   - Remove todos os roles antigos
   - Adiciona o novo role

**Exemplo: Corrigir Carol para Secretária**
1. Encontre "Carol" na lista
2. Mude o dropdown de "Admin" para "Secretária"
3. Aguarde a confirmação

### Método 2: Via SQL (Avançado)

**Para substituir o role de um usuário:**

```sql
-- 1. Primeiro, pegue os IDs executando a Query 1 do script list-all-users-roles.sql
-- Você vai precisar do user_id e tenant_id

-- 2. Execute este bloco (substitua os IDs):
BEGIN;

-- Remove todos os roles atuais
DELETE FROM user_roles 
WHERE user_id = 'USER_ID_AQUI' 
  AND tenant_id = 'TENANT_ID_AQUI';

-- Adiciona o novo role (secretaria)
INSERT INTO user_roles (tenant_id, user_id, role_id)
VALUES (
  'TENANT_ID_AQUI',
  'USER_ID_AQUI',
  (SELECT id FROM roles WHERE key = 'secretaria')
);

COMMIT;
```

**Para adicionar um role sem remover os existentes:**

```sql
INSERT INTO user_roles (tenant_id, user_id, role_id)
VALUES (
  'TENANT_ID_AQUI',
  'USER_ID_AQUI',
  (SELECT id FROM roles WHERE key = 'secretaria')
)
ON CONFLICT (tenant_id, user_id, role_id) DO NOTHING;
```

**Para remover apenas um role específico:**

```sql
DELETE FROM user_roles 
WHERE user_id = 'USER_ID_AQUI'
  AND tenant_id = 'TENANT_ID_AQUI'
  AND role_id = (SELECT id FROM roles WHERE key = 'coordenador');
```

---

## 🚨 Problemas Comuns

### Problema 1: Usuário Sem Role

**Sintoma:** Usuário não consegue fazer nada no sistema

**Solução:**
1. Via interface: Atribua um role (Secretária ou Admin)
2. Via SQL: Execute a query de INSERT acima

### Problema 2: Usuário com Múltiplos Roles

**Sintoma:** Comportamento inconsistente, permissões confusas

**Solução:**
1. Via interface: Mude o role (isso remove todos e adiciona apenas um)
2. Via SQL: Execute o bloco BEGIN/COMMIT acima

### Problema 3: Role Aparece Errado na Interface

**Sintoma:** No banco está "coordenador" mas aparece "Admin" (ou vice-versa)

**Explicação:** Isso é normal! O sistema mapeia:
- `coordenador` (banco) → "Admin" (interface)
- `secretaria` (banco) → "Secretária" (interface)

Se aparecer diferente disso, há um problema no código.

### Problema 4: Não Consigo Mudar Meu Próprio Role

**Sintoma:** Erro ao tentar mudar seu próprio role

**Explicação:** Isso é uma proteção! Você não pode mudar seu próprio role para evitar se trancar fora do sistema.

**Solução:** Peça para outro admin mudar, ou use SQL diretamente.

---

## 📋 Checklist de Verificação

Use este checklist para garantir que todos os usuários estão configurados corretamente:

- [ ] Todos os usuários têm pelo menos 1 role
- [ ] Nenhum usuário tem múltiplos roles (a menos que seja intencional)
- [ ] Secretárias têm role "Secretária"
- [ ] Coordenadores/Supervisores têm role "Admin"
- [ ] Pelo menos 1 usuário tem role "Admin" (para não ficar sem acesso)

---

## 🔐 Permissões por Role

### Secretária (`secretaria`)
✅ Ver fila de conversas
✅ Pegar conversas da fila
✅ Atender conversas atribuídas
✅ Enviar mensagens
✅ Criar tarefas
✅ Ver próprias conversas
✅ Devolver conversa para fila (se implementado)
❌ Transferir conversas
❌ Ver conversas de outros atendentes
❌ Acessar relatórios
❌ Gerenciar usuários
❌ Alterar configurações

### Admin/Coordenador (`coordenador`)
✅ Todas as permissões de Secretária
✅ Transferir conversas
✅ Ver todas as conversas
✅ Sussurrar para atendentes
✅ Acessar relatórios e dashboards
✅ Gerenciar usuários
✅ Alterar configurações do sistema
✅ Ver métricas de todos os atendentes

### Administrador (`admin`)
⚠️ Role especial, raramente usado
✅ Todas as permissões do sistema
✅ Acesso direto ao banco de dados (via RLS)

---

## 📝 Logs e Auditoria

Quando você muda um role:
- A mudança é registrada na tabela `user_roles`
- O campo `created_at` mostra quando o role foi atribuído
- Não há histórico automático de mudanças (considere adicionar se necessário)

---

## 🛠️ Scripts Úteis

### Listar Todos os Usuários e Roles
```bash
# Execute no Supabase SQL Editor
olifantcrm/tools/list-all-users-roles.sql
```

### Corrigir Role de um Usuário Específico
```bash
# Execute no Supabase SQL Editor
olifantcrm/tools/fix-carol-role.sql
```

---

## 💡 Dicas

1. **Sempre use a interface web** quando possível - é mais seguro
2. **Teste em ambiente de desenvolvimento** antes de fazer mudanças em produção
3. **Mantenha pelo menos 2 admins** para evitar ficar sem acesso
4. **Documente mudanças importantes** em roles de usuários
5. **Revise roles periodicamente** para garantir que estão corretos

---

## 🆘 Suporte

Se encontrar problemas:
1. Execute o script `list-all-users-roles.sql` para diagnóstico
2. Verifique os logs da API para erros
3. Consulte a documentação do Supabase sobre RLS (Row Level Security)
4. Em último caso, use SQL direto com cuidado

---

## 📚 Referências

- Migração inicial: `olifantcrm/supabase/migrations/0001_init.sql`
- Rotas de usuários: `olifantcrm/apps/api/src/routes/users.routes.ts`
- Página de configurações: `olifantcrm/apps/web/src/app/settings/users/page.tsx`
- Hook de autenticação: `olifantcrm/apps/web/src/hooks/useRequireRole.ts`
