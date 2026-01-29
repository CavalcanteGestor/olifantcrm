"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Home, BookOpen, MessageSquare, Users, Send, Calendar,
  ArrowRight, ArrowLeft, CheckCircle, AlertCircle,
  Lightbulb, Keyboard, Zap, User, Settings,
  FileText, Image as ImageIcon, Video, HelpCircle,
  ChevronRight, ChevronDown
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Section = {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  content: React.ReactNode;
};

export default function TutorialPage() {
  const router = useRouter();
  const [sessionReady, setSessionReady] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("introducao");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["introducao"]));
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    (async () => {
      const { data } = await supabaseBrowser().auth.getSession();
      if (!data.session) {
        router.replace(`/login?redirect=${encodeURIComponent("/tutorial")}`);
        return;
      }
      setSessionReady(true);
    })();
  }, [router]);

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
    setActiveSection(sectionId);
  };

  const scrollToSection = (sectionId: string) => {
    const element = sectionRefs.current[sectionId];
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSection(sectionId);
    }
  };

  const sections: Section[] = [
    {
      id: "introducao",
      title: "Introdução",
      icon: BookOpen,
      content: (
        <div className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Bem-vinda ao CRM Clínica Olifant!</h3>
            <p className="text-blue-800 dark:text-blue-200 text-sm">
              Este tutorial vai te ensinar a usar todas as funcionalidades do sistema de atendimento via WhatsApp.
              Ao final, você estará pronta para atender pacientes de forma eficiente e profissional.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-2">O que você vai aprender:</h4>
            <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
              <li>Como navegar pela interface do sistema</li>
              <li>Como gerenciar conversas e contatos</li>
              <li>Como enviar mensagens e usar templates</li>
              <li>Como realizar ações rápidas (agendar, confirmar, etc.)</li>
              <li>Funcionalidades avançadas e atalhos de teclado</li>
            </ul>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <Lightbulb className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-yellow-800 dark:text-yellow-200 text-sm font-medium mb-1">Dica</p>
                <p className="text-yellow-700 dark:text-yellow-300 text-sm">
                  Você pode navegar pelo tutorial usando o menu lateral ou clicando nas seções abaixo.
                  Use os botões "Anterior" e "Próximo" para avançar sequencialmente.
                </p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "primeiros-passos",
      title: "Primeiros Passos",
      icon: Home,
      content: (
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">1. Como fazer login</h4>
            <p className="text-gray-700 dark:text-gray-300 mb-2">
              Acesse o sistema usando suas credenciais fornecidas pela administração.
              Após o login, você será redirecionada para o HUD (Head-Up Display) - a tela principal de atendimento.
            </p>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 my-3">
              <img src="/tutorial/login.png" alt="Tela de Login" className="w-full rounded border border-gray-200 dark:border-gray-700 shadow-sm" />
              <p className="text-xs text-center mt-2 text-gray-500">Tela de login do sistema</p>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-2">2. Entendendo a interface do HUD</h4>
            <p className="text-gray-700 dark:text-gray-300 mb-2">
              O HUD é dividido em três áreas principais:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
              <li>
                <strong>Fila (lado esquerdo):</strong> Lista de todas as conversas que precisam de atenção.
                As conversas são organizadas por prioridade e status.
              </li>
              <li>
                <strong>Área de Conversa (centro):</strong> Onde você visualiza e envia mensagens para o paciente selecionado.
              </li>
              <li>
                <strong>Painel do Contato (lado direito):</strong> Informações do paciente, histórico e ações rápidas.
              </li>
            </ul>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 my-3">
              <img src="/tutorial/hud-overview.png" alt="Visão Geral do HUD" className="w-full rounded border border-gray-200 dark:border-gray-700 shadow-sm" />
              <p className="text-xs text-center mt-2 text-gray-500">Visão geral do Painel de Atendimento (HUD)</p>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-2">3. Componentes principais</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <MessageSquare className="w-8 h-8 text-blue-600 dark:text-blue-400 mb-2" />
                <h5 className="font-semibold mb-1">Fila de Conversas</h5>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Veja todas as conversas pendentes, em atendimento ou aguardando resposta do paciente.
                </p>
              </div>
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <Users className="w-8 h-8 text-green-600 dark:text-green-400 mb-2" />
                <h5 className="font-semibold mb-1">Área de Mensagens</h5>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Envie e receba mensagens, use templates e gerencie a conversa.
                </p>
              </div>
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <User className="w-8 h-8 text-purple-600 dark:text-purple-400 mb-2" />
                <h5 className="font-semibold mb-1">Painel do Contato</h5>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Visualize e edite informações do paciente, histórico e ações rápidas.
                </p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "gerenciando-conversas",
      title: "Gerenciando Conversas",
      icon: MessageSquare,
      content: (
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">1. Visualizar fila de conversas</h4>
            <p className="text-gray-700 dark:text-gray-300 mb-2">
              A fila mostra todas as conversas organizadas por prioridade. Você verá:
            </p>
            <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
              <li><strong>Aguardando Atendimento:</strong> Novas conversas que precisam ser atendidas</li>
              <li><strong>Em Atendimento:</strong> Conversas que você ou outro atendente está cuidando</li>
              <li><strong>Aguardando Paciente:</strong> Você já respondeu e está aguardando resposta</li>
              <li><strong>Finalizado:</strong> Conversas concluídas</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-2">2. Selecionar e abrir conversas</h4>
            <p className="text-gray-700 dark:text-gray-300 mb-2">
              Clique em qualquer conversa na fila para abri-la. A conversa selecionada será exibida no centro da tela.
            </p>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-blue-800 dark:text-blue-200 text-sm">
                💡 <strong>Dica:</strong> Use a tecla <kbd className="px-2 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-xs">↑</kbd> e <kbd className="px-2 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-xs">↓</kbd> para navegar entre conversas rapidamente.
              </p>
            </div>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 my-3">
              <img src="/tutorial/conversa-full.png" alt="Conversa Aberta" className="w-full rounded border border-gray-200 dark:border-gray-700 shadow-sm" />
              <p className="text-xs text-center mt-2 text-gray-500">Exemplo de uma conversa selecionada para atendimento</p>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-2">3. Entender status das conversas</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <span className="text-sm"><strong>Aguardando:</strong> Nova conversa sem resposta</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <span className="text-sm"><strong>Em Atendimento:</strong> Sendo atendida por você ou outro atendente</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-sm"><strong>Aguardando Paciente:</strong> Aguardando resposta do paciente</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-500"></div>
                <span className="text-sm"><strong>Finalizado:</strong> Conversa concluída</span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-2">4. Filtrar conversas</h4>
            <p className="text-gray-700 dark:text-gray-300 mb-2">
              Use os filtros no topo da fila para encontrar conversas específicas:
            </p>
            <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
              <li><strong>Por estágio do funil:</strong> Filtrar por etapa do processo (ex: Triagem, Agendamento)</li>
              <li><strong>Por status:</strong> Ver apenas conversas em determinado status</li>
              <li><strong>Por atendente:</strong> Ver conversas de um atendente específico</li>
              <li><strong>Busca:</strong> Digite palavras-chave para encontrar conversas</li>
            </ul>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 my-3">
              <img src="/tutorial/filtros.png" alt="Filtros da Fila" className="w-full rounded border border-gray-200 dark:border-gray-700 shadow-sm" />
              <p className="text-xs text-center mt-2 text-gray-500">Opções de filtro expandidas para localizar conversas</p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "enviando-mensagens",
      title: "Enviando Mensagens",
      icon: Send,
      content: (
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">1. Como escrever e enviar mensagens</h4>
            <p className="text-gray-700 dark:text-gray-300 mb-2">
              Na área central do HUD, você encontrará a caixa de texto para escrever mensagens.
              Digite sua mensagem e pressione <kbd className="px-2 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-xs">Enter</kbd> ou clique no botão de enviar.
            </p>
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <p className="text-green-800 dark:text-green-200 text-sm">
                ✅ <strong>Boa prática:</strong> Sempre seja cordial e profissional. Use o nome do paciente quando possível.
              </p>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-2">2. Usar templates/respostas prontas</h4>
            <p className="text-gray-700 dark:text-gray-300 mb-2">
              Templates são respostas pré-definidas que agilizam o atendimento. Para usar:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-gray-700 dark:text-gray-300">
              <li>Clique no ícone de template (ou use <kbd className="px-2 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-xs">Ctrl+K</kbd>)</li>
              <li>Selecione o template desejado</li>
              <li>Personalize se necessário (ex: adicionar nome do paciente)</li>
              <li>Envie a mensagem</li>
            </ol>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 my-3">
              <img src="/tutorial/chat-area.png" alt="Área de Mensagens" className="w-full rounded border border-gray-200 dark:border-gray-700 shadow-sm" />
              <p className="text-xs text-center mt-2 text-gray-500">Área de composição e histórico de mensagens</p>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-2">3. Enviar mídia (imagens, documentos)</h4>
            <p className="text-gray-700 dark:text-gray-300 mb-2">
              Para enviar imagens ou documentos:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-gray-700 dark:text-gray-300">
              <li>Clique no ícone de anexo na caixa de mensagem</li>
              <li>Selecione o arquivo desejado</li>
              <li>Adicione uma legenda (opcional)</li>
              <li>Envie a mensagem</li>
            </ol>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p className="text-yellow-800 dark:text-yellow-200 text-sm">
                ⚠️ <strong>Atenção:</strong> Verifique se o arquivo não excede o tamanho máximo permitido pelo WhatsApp.
              </p>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-2">4. Formatação de texto</h4>
            <p className="text-gray-700 dark:text-gray-300 mb-2">
              Você pode formatar texto usando:
            </p>
            <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
              <li><strong>*negrito*</strong> - Texto em negrito</li>
              <li><em>_itálico_</em> - Texto em itálico</li>
              <li><s>~riscado~</s> - Texto riscado</li>
              <li><code>`código`</code> - Texto monoespaçado</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: "gerenciando-contatos",
      title: "Gerenciando Contatos",
      icon: Users,
      content: (
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">1. Visualizar informações do contato</h4>
            <p className="text-gray-700 dark:text-gray-300 mb-2">
              No painel direito, você verá todas as informações do paciente:
            </p>
            <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
              <li>Nome completo</li>
              <li>Telefone</li>
              <li>Status (ativo, inativo, etc.)</li>
              <li>Etapa atual no funil</li>
              <li>Tags e notas</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-2">2. Editar dados do contato</h4>
            <p className="text-gray-700 dark:text-gray-300 mb-2">
              Para editar informações:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-gray-700 dark:text-gray-300">
              <li>Clique na aba "Editar" no painel do contato</li>
              <li>Modifique os campos desejados</li>
              <li>Clique em "Salvar" para confirmar as alterações</li>
            </ol>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-blue-800 dark:text-blue-200 text-sm">
                💡 <strong>Dica:</strong> Mantenha os dados sempre atualizados para melhor atendimento.
              </p>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-2">3. Ver histórico de conversas anteriores</h4>
            <p className="text-gray-700 dark:text-gray-300 mb-2">
              Na aba "Histórico", você pode ver todas as conversas anteriores com este paciente,
              incluindo mensagens, ações realizadas e mudanças de status.
            </p>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 my-3">
              <img src="/tutorial/contact-panel.png" alt="Painel do Contato" className="w-full rounded border border-gray-200 dark:border-gray-700 shadow-sm" />
              <p className="text-xs text-center mt-2 text-gray-500">Painel lateral com detalhes e histórico do paciente</p>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-2">4. Adicionar tags e notas</h4>
            <p className="text-gray-700 dark:text-gray-300 mb-2">
              Tags ajudam a categorizar pacientes. Notas permitem adicionar informações importantes:
            </p>
            <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
              <li><strong>Tags:</strong> Use para marcar características (ex: "Urgente", "VIP", "Retorno")</li>
              <li><strong>Notas:</strong> Adicione observações importantes sobre o paciente</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: "acoes-rapidas",
      title: "Ações Rápidas",
      icon: Zap,
      content: (
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">1. Agendar consultas</h4>
            <p className="text-gray-700 dark:text-gray-300 mb-2">
              Para agendar uma consulta:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-gray-700 dark:text-gray-300">
              <li>Clique no botão "Agendar" nas ações rápidas</li>
              <li>Selecione data e horário</li>
              <li>Confirme os detalhes</li>
              <li>O sistema enviará uma mensagem de confirmação automaticamente</li>
            </ol>
          </div>

          <div>
            <h4 className="font-semibold mb-2">2. Confirmar/Remarcar consultas</h4>
            <p className="text-gray-700 dark:text-gray-300 mb-2">
              Use os botões "Confirmar" ou "Remarcar" para gerenciar agendamentos existentes.
            </p>
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <p className="text-green-800 dark:text-green-200 text-sm">
                ✅ <strong>Lembrete:</strong> Sempre confirme agendamentos com pelo menos 24h de antecedência.
              </p>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-2">3. Marcar compareceu/faltou</h4>
            <p className="text-gray-700 dark:text-gray-300 mb-2">
              Após a data da consulta, marque se o paciente compareceu ou faltou.
              Isso ajuda no controle e acompanhamento.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-2">4. Outras ações rápidas</h4>
            <p className="text-gray-700 dark:text-gray-300 mb-2">
              O sistema oferece outras ações para agilizar o atendimento:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                <Calendar className="w-6 h-6 text-blue-600 dark:text-blue-400 mb-2" />
                <h5 className="font-semibold text-sm mb-1">Agendar</h5>
                <p className="text-xs text-gray-600 dark:text-gray-400">Criar novo agendamento</p>
              </div>
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400 mb-2" />
                <h5 className="font-semibold text-sm mb-1">Confirmar</h5>
                <p className="text-xs text-gray-600 dark:text-gray-400">Confirmar agendamento</p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "funcionalidades-avancadas",
      title: "Funcionalidades Avançadas",
      icon: Settings,
      content: (
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">1. Transferir conversas</h4>
            <p className="text-gray-700 dark:text-gray-300 mb-2">
              Para transferir uma conversa para outro atendente:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-gray-700 dark:text-gray-300">
              <li>Clique no botão "Transferir"</li>
              <li>Selecione o atendente de destino</li>
              <li>Adicione uma nota (opcional) explicando o motivo</li>
              <li>Confirme a transferência</li>
            </ol>
          </div>

          <div>
            <h4 className="font-semibold mb-2">2. Gerenciar SLA (pausar/retomar)</h4>
            <p className="text-gray-700 dark:text-gray-300 mb-2">
              SLA (Service Level Agreement) é o tempo limite para responder. Você pode:
            </p>
            <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
              <li><strong>Pausar:</strong> Quando precisa de mais tempo (ex: aguardando informação externa)</li>
              <li><strong>Retomar:</strong> Quando estiver pronto para continuar</li>
            </ul>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p className="text-yellow-800 dark:text-yellow-200 text-sm">
                ⚠️ <strong>Atenção:</strong> Use pausar SLA com moderação e sempre informe o motivo.
              </p>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-2">3. Criar tarefas</h4>
            <p className="text-gray-700 dark:text-gray-300 mb-2">
              Tarefas ajudam a organizar ações futuras:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-gray-700 dark:text-gray-300">
              <li>Clique em "Criar Tarefa"</li>
              <li>Defina título, descrição e prazo</li>
              <li>Atribua para você ou outro atendente</li>
              <li>Acompanhe o status no Kanban</li>
            </ol>
          </div>

          <div>
            <h4 className="font-semibold mb-2">4. Usar chat interno</h4>
            <p className="text-gray-700 dark:text-gray-300 mb-2">
              O chat interno permite comunicação entre atendentes sobre uma conversa específica,
              sem que o paciente veja. Útil para consultas e transferências.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-2">5. Visualizar Kanban</h4>
            <p className="text-gray-700 dark:text-gray-300 mb-2">
              O Kanban oferece uma visão visual das conversas organizadas por estágio.
              Acesse pelo menu principal para ver e mover conversas entre estágios.
            </p>

          </div>
        </div>
      )
    },
    {
      id: "atalhos-dicas",
      title: "Atalhos e Dicas",
      icon: Keyboard,
      content: (
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold mb-3">Atalhos de Teclado Principais</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                <span className="text-sm text-gray-700 dark:text-gray-300">Navegar entre conversas</span>
                <div className="flex gap-1">
                  <kbd className="px-2 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs">↑</kbd>
                  <kbd className="px-2 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs">↓</kbd>
                </div>
              </div>
              <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                <span className="text-sm text-gray-700 dark:text-gray-300">Abrir templates</span>
                <kbd className="px-2 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs">Ctrl+K</kbd>
              </div>
              <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                <span className="text-sm text-gray-700 dark:text-gray-300">Buscar conversas</span>
                <kbd className="px-2 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs">Ctrl+F</kbd>
              </div>
              <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                <span className="text-sm text-gray-700 dark:text-gray-300">Enviar mensagem</span>
                <kbd className="px-2 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs">Enter</kbd>
              </div>
              <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                <span className="text-sm text-gray-700 dark:text-gray-300">Nova linha (sem enviar)</span>
                <kbd className="px-2 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs">Shift+Enter</kbd>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Dicas de Produtividade</h4>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
              <li>Use templates para respostas comuns - economiza tempo</li>
              <li>Mantenha as informações do contato atualizadas</li>
              <li>Responda dentro do prazo do SLA para melhor atendimento</li>
              <li>Use o chat interno para consultar colegas sem interromper o paciente</li>
              <li>Organize conversas usando filtros e tags</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Boas Práticas de Atendimento</h4>
            <div className="space-y-3">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                <p className="text-green-800 dark:text-green-200 text-sm font-medium mb-1">✅ Sempre faça:</p>
                <ul className="list-disc list-inside text-sm text-green-700 dark:text-green-300 space-y-1">
                  <li>Cumprimente o paciente pelo nome</li>
                  <li>Seja cordial e profissional</li>
                  <li>Confirme informações importantes</li>
                  <li>Responda dentro do prazo</li>
                </ul>
              </div>
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                <p className="text-red-800 dark:text-red-200 text-sm font-medium mb-1">❌ Evite:</p>
                <ul className="list-disc list-inside text-sm text-red-700 dark:text-red-300 space-y-1">
                  <li>Usar gírias ou linguagem informal demais</li>
                  <li>Deixar conversas sem resposta por muito tempo</li>
                  <li>Transferir sem explicar o motivo</li>
                  <li>Ignorar informações do histórico</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )
    }
  ];

  const currentIndex = sections.findIndex(s => s.id === activeSection);
  const prevSection = currentIndex > 0 ? sections[currentIndex - 1] : null;
  const nextSection = currentIndex < sections.length - 1 ? sections[currentIndex + 1] : null;

  if (!sessionReady) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-600 dark:text-gray-400">Carregando...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BookOpen className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                Tutorial de Atendimento
              </h1>
            </div>
            <Link
              href="/"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Home className="w-4 h-4" />
              Voltar ao HUD
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Sidebar Navigation */}
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sticky top-24">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Índice</h2>
              <nav className="space-y-1">
                {sections.map((section) => {
                  const Icon = section.icon;
                  const isActive = activeSection === section.id;
                  return (
                    <button
                      key={section.id}
                      onClick={() => scrollToSection(section.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${isActive
                          ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-left">{section.title}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
              {/* Sections */}
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {sections.map((section, index) => {
                  const Icon = section.icon;
                  const isExpanded = expandedSections.has(section.id);
                  const isActive = activeSection === section.id;

                  return (
                    <div
                      key={section.id}
                      ref={(el) => {
                        sectionRefs.current[section.id] = el;
                      }}
                      className="scroll-mt-24"
                    >
                      <button
                        onClick={() => toggleSection(section.id)}
                        className={`w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${isActive ? "bg-blue-50 dark:bg-blue-900/20" : ""
                          }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${isActive
                              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                              : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                            }`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                              {index + 1}. {section.title}
                            </h2>
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronDown className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="px-6 pb-6 pt-2">
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            {section.content}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Navigation Buttons */}
              <div className="border-t border-gray-200 dark:border-gray-700 p-6 flex items-center justify-between">
                <button
                  onClick={() => prevSection && scrollToSection(prevSection.id)}
                  disabled={!prevSection}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${prevSection
                      ? "bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
                      : "bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed"
                    }`}
                >
                  <ArrowLeft className="w-4 h-4" />
                  Anterior
                </button>

                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {currentIndex + 1} de {sections.length}
                </div>

                <button
                  onClick={() => nextSection && scrollToSection(nextSection.id)}
                  disabled={!nextSection}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${nextSection
                      ? "bg-blue-600 hover:bg-blue-700 text-white"
                      : "bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed"
                    }`}
                >
                  Próximo
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Help Section */}
            <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
              <div className="flex items-start gap-3">
                <HelpCircle className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                    Precisa de mais ajuda?
                  </h3>
                  <p className="text-blue-800 dark:text-blue-200 text-sm mb-3">
                    Se você tiver dúvidas ou encontrar problemas, entre em contato com o administrador do sistema.
                  </p>
                  <Link
                    href="/"
                    className="inline-flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-200 font-medium"
                  >
                    Voltar ao HUD
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
