# 👥 Guia de Gerenciamento de Usuários

## Acesso
**Configurações → Usuários** (apenas Admin)

---

## ✅ Funcionalidades Disponíveis

### 1. 🆕 Criar Novo Usuário

**Campos:**
- **Nome**: Nome completo do usuário
- **Email**: Email para login (deve ser único)
- **Senha**: Opcional - mínimo 8 caracteres
  - Se não informar, o usuário receberá um link para criar a senha
- **Papel**: Secretária ou Administrador
- **Enviar convite**: Se marcado, envia magic link por email

**Como funciona:**
1. Preencha os campos
2. Clique em **"Criar"**
3. O usuário é criado no sistema
4. Se "Enviar convite" estiver marcado:
   - Usuário recebe email com link mágico
   - Se não definiu senha, recebe também link de recuperação

**Dicas:**
- ✅ Sempre defina uma senha inicial para facilitar
- ✅ Use emails corporativos
- ✅ Crie usuários como "Secretária" por padrão
- ⚠️ Só promova para "Admin" quem realmente precisa

---

### 2. 🔑 Atualizar Senha

**Como usar:**
1. Encontre o usuário na lista
2. Clique no botão **"🔑 Senha"**
3. Digite a nova senha (mínimo 8 caracteres)
4. Clique em **"Atualizar Senha"**

**Quando usar:**
- Usuário esqueceu a senha
- Senha comprometida
- Primeiro acesso (se não definiu senha na criação)
- Política de segurança (trocar periodicamente)

**Segurança:**
- ✅ Senha deve ter no mínimo 8 caracteres
- ✅ Recomendado: use letras, números e símbolos
- ✅ Não compartilhe senhas por mensagem
- ✅ Oriente o usuário a trocar após primeiro acesso

---

### 3. 🎭 Alterar Papel (Role)

**Como usar:**
1. Encontre o usuário na lista
2. Use o dropdown ao lado do nome
3. Selecione:
   - **Secretária** → Para atendentes
   - **Admin** → Para coordenadores/supervisores

**Diferenças:**

| Permissão | Secretária | Admin |
|-----------|------------|-------|
| Atender conversas | ✅ | ✅ |
| Ver fila | ✅ | ✅ |
| Pegar conversas | ✅ | ✅ |
| Transferir conversas | ❌ | ✅ |
| Ver conversas de outros | ❌ | ✅ |
| Sussurrar | ❌ | ✅ |
| Relatórios | ❌ | ✅ |
| Gerenciar usuários | ❌ | ✅ |
| Configurações | ❌ | ✅ |

**Atenção:**
- ⚠️ Você não pode mudar seu próprio papel
- ⚠️ Mantenha pelo menos 2 admins no sistema
- ⚠️ A mudança é imediata

---

### 4. 🗑️ Remover Usuário

**Como usar:**
1. Encontre o usuário na lista
2. Clique em **"Remover"**
3. Confirme a ação

**ATENÇÃO:**
- ⚠️ **Esta ação é IRREVERSÍVEL**
- ⚠️ Todas as conversas atribuídas ao usuário ficarão sem dono
- ⚠️ O histórico de mensagens permanece
- ⚠️ O usuário não poderá mais fazer login

**Recomendações:**
- ✅ Antes de remover, transfira as conversas ativas
- ✅ Considere apenas mudar o papel ao invés de remover
- ✅ Documente o motivo da remoção

---

## 📋 Fluxo Recomendado

### Novo Funcionário
1. Criar usuário com papel "Secretária"
2. Definir senha inicial
3. Marcar "Enviar convite"
4. Orientar a trocar senha no primeiro acesso
5. Fazer treinamento antes de liberar acesso

### Promoção a Admin
1. Verificar se a pessoa precisa realmente das permissões
2. Alterar papel para "Admin"
3. Orientar sobre novas responsabilidades
4. Mostrar funcionalidades exclusivas

### Desligamento
1. Transferir todas as conversas ativas
2. Verificar se há tarefas pendentes
3. Remover o usuário
4. Documentar a remoção

### Esqueceu a Senha
1. Clicar em "🔑 Senha"
2. Definir nova senha temporária
3. Informar ao usuário
4. Orientar a trocar após login

---

## 🔒 Segurança

### Boas Práticas
- ✅ Use senhas fortes (mínimo 8 caracteres)
- ✅ Não compartilhe senhas
- ✅ Troque senhas periodicamente
- ✅ Revise usuários ativos mensalmente
- ✅ Remova usuários inativos
- ✅ Mantenha pelo menos 2 admins

### Políticas Recomendadas
- Senha mínima: 8 caracteres
- Trocar senha: a cada 90 dias
- Revisar acessos: mensalmente
- Remover inativos: após 30 dias sem uso

---

## ❓ Perguntas Frequentes

### Posso criar usuário sem email?
❌ Não. O email é obrigatório e usado para login.

### Posso usar o mesmo email para dois usuários?
❌ Não. Cada email deve ser único no sistema.

### O que acontece se eu não definir senha?
✅ O usuário receberá um link para criar a senha dele mesmo.

### Posso mudar meu próprio papel?
❌ Não. Isso é uma proteção para evitar se trancar fora do sistema.

### Posso recuperar um usuário removido?
❌ Não. A remoção é irreversível. Você precisará criar um novo usuário.

### Quantos admins devo ter?
✅ Recomendamos pelo menos 2 admins para evitar ficar sem acesso.

### Posso ver a senha de um usuário?
❌ Não. As senhas são criptografadas. Você só pode definir uma nova.

### O usuário recebe notificação quando mudo a senha dele?
❌ Não automaticamente. Você deve informá-lo manualmente.

### Posso criar usuários em massa?
❌ Não no momento. Cada usuário deve ser criado individualmente.

---

## 🆘 Problemas Comuns

### "Email já existe"
**Causa:** Já existe um usuário com este email
**Solução:** Use outro email ou remova o usuário existente

### "Senha muito curta"
**Causa:** Senha tem menos de 8 caracteres
**Solução:** Use uma senha com pelo menos 8 caracteres

### "Erro ao criar usuário"
**Causa:** Problema na API ou banco de dados
**Solução:** 
1. Verifique sua conexão
2. Tente novamente
3. Verifique os logs da API

### "Não consigo remover usuário"
**Causa:** Você pode estar tentando remover a si mesmo
**Solução:** Peça para outro admin remover

### "Usuário não recebeu o convite"
**Causa:** Email pode estar na caixa de spam
**Solução:**
1. Verifique spam/lixo eletrônico
2. Defina uma senha manualmente
3. Informe ao usuário

---

## 📊 Monitoramento

### O que verificar regularmente:
- [ ] Quantidade de usuários ativos
- [ ] Usuários sem conversas atribuídas (inativos?)
- [ ] Usuários com papel correto
- [ ] Pelo menos 2 admins no sistema
- [ ] Emails válidos e atualizados

### Relatório Mensal Sugerido:
1. Total de usuários
2. Secretárias vs Admins
3. Usuários criados no mês
4. Usuários removidos no mês
5. Usuários inativos (sem login há 30+ dias)

---

## 🔗 Referências

- Gerenciar Roles: `olifantcrm/docs/GERENCIAR_ROLES.md`
- API de Usuários: `olifantcrm/apps/api/src/routes/users.routes.ts`
- Interface: `olifantcrm/apps/web/src/app/settings/users/page.tsx`
