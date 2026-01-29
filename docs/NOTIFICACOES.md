# 🔔 Sistema de Notificações - Guia Completo

## Como Ativar as Notificações

### 1. Banner de Permissão
Quando você acessar o sistema pela primeira vez, verá um **banner azul** acima do botão de notificações com:
- 🔔 Ícone de sino
- Texto explicativo sobre as notificações
- Botão **"Ativar Agora"** (azul)
- Botão **"Agora Não"** (cinza)

**Para ativar:** Clique em **"Ativar Agora"**

### 2. Pelo Botão de Notificações
Se você fechou o banner, pode ativar clicando no botão **"🔔 Notificações"** na barra lateral:
- Se as notificações não estiverem ativadas, o navegador pedirá permissão
- Clique em **"Permitir"** no popup do navegador

### 3. Indicadores Visuais
O botão de notificações mostra o status:
- ✓ (verde) = Notificações ativadas
- 🚫 (vermelho) = Notificações bloqueadas
- Sem ícone = Aguardando permissão

### 4. Dentro do Painel
Ao abrir o painel de notificações, você verá:
- **"✓ Ativadas"** (verde) = Funcionando
- **"🚫 Bloqueadas"** (vermelho) = Bloqueadas pelo navegador
- **"🔔 Ativar"** (azul) = Clique para ativar

---

## O Que Você Recebe de Notificações

### 🔊 Notificações Sonoras (sempre funcionam)
- **Nova mensagem**: Som suave (600Hz)
- **SLA violado**: Som de alerta (800Hz)
- **Conversa sem resposta**: Som grave (400Hz)
- **Transferência**: Som médio (700Hz)
- **Conversa sem atendente**: Som de atenção (600Hz)

### 💬 Notificações do Navegador (precisa de permissão)
- **Nova mensagem de cliente**
- **Conversa transferida para você**
- **Conversa sem atendente**
- **SLA violado**
- **Nova avaliação recebida**
- **Conversa sem resposta há X minutos**

---

## Tipos de Notificações

### 💬 Nova Conversa
- Quando uma nova conversa entra na fila
- Quando você recebe uma mensagem em conversa atribuída a você

### 📥 Transferência
- Quando uma conversa é transferida para você
- Aparece com ícone 📥 e mensagem do supervisor

### ⚠️ Conversa Sem Atendente
- Quando uma conversa fica sem atendente atribuído
- Sistema alerta supervisores automaticamente

### ⏰ Conversa Sem Resposta
- Verifica a cada 1 minuto
- Alerta quando cliente aguarda há mais de X minutos (configurável)
- Mostra tempo de espera
- Indica se está na fila ou em atendimento

### 🔴 SLA Violado
- Quando o tempo de resposta ultrapassa o limite
- Alerta crítico para ação imediata

### ⭐ Nova Avaliação
- Quando você recebe uma avaliação do cliente
- Mostra quantas estrelas recebeu

---

## Testar Notificações

### Botão de Teste
No painel de notificações, clique em **"🔊 Testar"**:
- Toca o som de notificação
- Cria uma notificação de teste
- Verifica se o sistema está funcionando

---

## Configurações do Navegador

### Se as Notificações Foram Bloqueadas

#### Chrome/Edge
1. Clique no **ícone de cadeado** na barra de endereço
2. Procure por **"Notificações"**
3. Mude para **"Permitir"**
4. Recarregue a página

#### Firefox
1. Clique no **ícone de escudo** na barra de endereço
2. Vá em **"Permissões"**
3. Encontre **"Notificações"**
4. Mude para **"Permitir"**
5. Recarregue a página

#### Safari
1. Vá em **Safari > Preferências**
2. Clique em **"Sites"**
3. Selecione **"Notificações"**
4. Encontre o site e mude para **"Permitir"**

---

## Sussurros (Mensagens Internas)

### O Que São Sussurros?
Mensagens privadas que supervisores enviam para atendentes durante uma conversa.

### Onde Aparecem?
1. **Chat Interno** (ícone 💬 no canto superior direito do HUD)
2. Aba **"Notas do Ticket"**
3. Mensagens aparecem com prefixo **[Sussurro]**

### Como Funcionam?
- **Supervisor** vê campo amarelo para sussurrar quando:
  - Está visualizando conversa de outro atendente
  - É admin/supervisor
- **Atendente** recebe:
  - Notificação sonora (som diferente)
  - Notificação do navegador (se ativada)
  - Mensagem no Chat Interno

### Notificações de Sussurros
- Som específico para chat interno (mais suave)
- Notificação mostra quem enviou
- Funciona mesmo se você não estiver na conversa

---

## Dicas

### ✅ Boas Práticas
- Mantenha as notificações ativadas para não perder mensagens
- Use o botão de teste para verificar se está funcionando
- Configure o tempo de alerta de "sem resposta" adequado ao seu fluxo

### ⚠️ Atenção
- Sons só tocam após primeira interação com a página (limitação do navegador)
- Notificações do navegador precisam de permissão explícita
- Se bloqueou acidentalmente, siga o guia de configurações acima

### 🔧 Solução de Problemas
1. **Não ouço sons**: Clique em qualquer lugar da página primeiro
2. **Não vejo notificações**: Verifique permissões do navegador
3. **Muitas notificações**: Ajuste o tempo de alerta nas configurações do tenant

---

## Configuração do Tenant

### Tempo de Alerta "Sem Resposta"
Administradores podem configurar quantos minutos esperar antes de alertar sobre conversas sem resposta:

1. Acesse as configurações do tenant no banco de dados
2. Campo: `no_response_alert_minutes`
3. Padrão: 5 minutos
4. Recomendado: 3-10 minutos dependendo do volume

---

## Resumo Rápido

| Tipo | Som | Navegador | Onde Ver |
|------|-----|-----------|----------|
| Nova Mensagem | ✅ | ✅ | Painel de Notificações |
| Transferência | ✅ | ✅ | Painel de Notificações |
| Sem Resposta | ✅ | ✅ | Painel de Notificações |
| SLA Violado | ✅ | ✅ | Painel de Notificações |
| Sussurro | ✅ | ✅ | Chat Interno |
| Avaliação | ✅ | ✅ | Painel de Notificações |

**Todos os tipos funcionam em tempo real via Supabase Realtime!**
