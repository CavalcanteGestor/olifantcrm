"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiListTemplates, apiSyncTemplates, apiSendTemplate } from "@/lib/api";

type Template = {
  id: string;
  name: string;
  language: string;
  category: string | null;
  approved_status: string | null;
  components_json: any[];
  last_synced_at: string | null;
};

type TemplateSelectorProps = {
  accessToken: string;
  conversationId: string | null;
  onSend: () => void;
  onClose: () => void;
};

export default function TemplateSelector({ accessToken, conversationId, onSend, onClose }: TemplateSelectorProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const qc = useQueryClient();

  const templatesQ = useQuery({
    queryKey: ["templates"],
    queryFn: () => apiListTemplates({ accessToken }),
    enabled: !!accessToken
  });

  // Filtrar apenas templates aprovados
  const approvedTemplates = (templatesQ.data?.items ?? []).filter((t) => t.approved_status === "APPROVED");

  useEffect(() => {
    if (selectedTemplate) {
      // Inicializar variáveis do template
      const vars: Record<string, string> = {};
      const bodyComp = selectedTemplate.components_json?.find((c: any) => c.type === "BODY");
      if (bodyComp?.text) {
        // Encontrar placeholders {{1}}, {{2}}, etc. no texto
        const placeholders = bodyComp.text.match(/\{\{\d+\}\}/g) || [];
        placeholders.forEach((placeholder: string) => {
          vars[placeholder] = "";
        });
      }
      setVariables(vars);
    }
  }, [selectedTemplate]);

  async function handleSync() {
    setSyncing(true);
    try {
      await apiSyncTemplates({ accessToken });
      await qc.invalidateQueries({ queryKey: ["templates"] });
    } catch (err) {
      alert("Erro ao sincronizar templates");
    } finally {
      setSyncing(false);
    }
  }

  async function handleSend() {
    if (!selectedTemplate || !conversationId) return;
    setSending(true);
    try {
      // Preparar componentes com variáveis preenchidas
      // A estrutura da Meta espera: components[0].type = "body", components[0].parameters = [{type: "text", text: "valor"}]
      const components: any[] = [];
      const bodyComp = selectedTemplate.components_json?.find((c: any) => c.type === "BODY");
      if (bodyComp && Object.keys(variables).length > 0) {
        // Extrair valores em ordem ({{1}}, {{2}}, etc.)
        const sortedKeys = Object.keys(variables).sort((a, b) => {
          const numA = parseInt(a.replace(/\{\{|\}\}/g, ""), 10);
          const numB = parseInt(b.replace(/\{\{|\}\}/g, ""), 10);
          return numA - numB;
        });
        components.push({
          type: "body",
          parameters: sortedKeys
            .map((key) => variables[key])
            .filter((v) => v.trim())
            .map((v) => ({ type: "text", text: v }))
        });
      }

      await apiSendTemplate({
        accessToken,
        conversationId,
        templateName: selectedTemplate.name,
        language: selectedTemplate.language,
        components: components.length > 0 ? components : undefined
      });
      onSend();
      onClose();
    } catch (err: any) {
      alert(err.message || "Erro ao enviar template");
    } finally {
      setSending(false);
    }
  }

  function renderPreview(template: Template) {
    const comps = template.components_json || [];
    const bodyComp = comps.find((c: any) => c.type === "BODY");
    let bodyText = bodyComp?.text || "";

    // Substituir placeholders por variáveis (escapar caracteres especiais)
    Object.entries(variables).forEach(([placeholder, value]) => {
      const escaped = placeholder.replace(/[{}]/g, "\\$&");
      bodyText = bodyText.replace(new RegExp(escaped, "g"), value || placeholder);
    });

    return (
      <div className="space-y-2">
        <div className="text-xs font-semibold text-gray-600 dark:text-gray-400">Preview:</div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 text-sm whitespace-pre-wrap text-gray-900 dark:text-white">{bodyText}</div>
      </div>
    );
  }

  const isPaid = selectedTemplate?.category && selectedTemplate.category !== "UTILITY";

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-lg font-semibold text-gray-900 dark:text-white">Templates WhatsApp</div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors font-medium"
          >
            {syncing ? "Sincronizando..." : "Sincronizar"}
          </button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-2 gap-4 overflow-hidden">
          {/* Lista de templates */}
          <div className="border-r border-gray-200 dark:border-gray-800 pr-4 overflow-auto">
            <div className="text-xs text-gray-600 dark:text-gray-400 mb-2 font-medium">
              {approvedTemplates.length} template{approvedTemplates.length !== 1 ? "s" : ""} aprovado{approvedTemplates.length !== 1 ? "s" : ""}
            </div>
            {templatesQ.isLoading ? (
              <div className="text-xs text-gray-500 dark:text-gray-400">Carregando...</div>
            ) : approvedTemplates.length === 0 ? (
              <div className="text-xs text-gray-500 dark:text-gray-400">Nenhum template aprovado. Sincronize primeiro.</div>
            ) : (
              <div className="space-y-2">
                {approvedTemplates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTemplate(t)}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                      selectedTemplate?.id === t.id
                        ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
                        : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-white dark:bg-gray-900"
                    }`}
                  >
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{t.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {t.language} · {t.category || "N/A"}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Preview e variáveis */}
          <div className="overflow-auto">
            {!selectedTemplate ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">Selecione um template</div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="text-sm font-semibold mb-1 text-gray-900 dark:text-white">{selectedTemplate.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {selectedTemplate.language} · {selectedTemplate.category || "N/A"}
                    {isPaid && (
                      <span className="ml-2 px-2 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 text-[10px]">Template pago</span>
                    )}
                  </div>
                </div>

                {renderPreview(selectedTemplate)}

                {Object.keys(variables).length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-gray-600 dark:text-gray-400">Variáveis:</div>
                    {Object.entries(variables).map(([placeholder, value], idx) => (
                      <div key={placeholder}>
                        <label className="text-xs text-gray-600 dark:text-gray-400 font-medium">{placeholder}</label>
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => setVariables({ ...variables, [placeholder]: e.target.value })}
                          className="mt-1 w-full rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 dark:text-white transition-all"
                          placeholder={`Valor para ${placeholder}`}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 pt-4">
                  <button
                    onClick={onClose}
                    disabled={sending}
                    className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-semibold hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSend}
                    disabled={sending || !conversationId}
                    className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md"
                  >
                    {sending ? "Enviando..." : "Enviar Template"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

