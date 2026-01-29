"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { apiGetAutomationSettings, apiUpdateAutomationSettings } from "@/lib/api";
import { notify } from "@/lib/toastBus";
import { MessageSquare, Star, Info, Save, ToggleLeft, ToggleRight, Clock, Calendar, Check, X } from "lucide-react";

type DayConfig = { start: string; end: string; active: boolean };
type BusinessHours = Record<string, DayConfig>;

const DEFAULT_HOURS: BusinessHours = {
  monday: { start: "08:00", end: "18:00", active: true },
  tuesday: { start: "08:00", end: "18:00", active: true },
  wednesday: { start: "08:00", end: "18:00", active: true },
  thursday: { start: "08:00", end: "18:00", active: true },
  friday: { start: "08:00", "end": "18:00", active: true },
  saturday: { start: "08:00", end: "12:00", active: false },
  sunday: { start: "00:00", end: "00:00", active: false }
};

const DAYS_TRANSLATION: Record<string, string> = {
  monday: "Segunda",
  tuesday: "Terça",
  wednesday: "Quarta",
  thursday: "Quinta",
  friday: "Sexta",
  saturday: "Sábado",
  sunday: "Domingo"
};

const ORDERED_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export default function AutomationSettingsPage() {
  const qc = useQueryClient();
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // Form State
  const [ratingEnabled, setRatingEnabled] = useState(false);
  const [ratingTemplate, setRatingTemplate] = useState("");
  const [closeEnabled, setCloseEnabled] = useState(false);
  const [closeTemplate, setCloseTemplate] = useState("");
  
  // Business Hours State
  const [hoursEnabled, setHoursEnabled] = useState(false);
  const [hoursConfig, setHoursConfig] = useState<BusinessHours>(DEFAULT_HOURS);
  const [outsideMessage, setOutsideMessage] = useState("");

  useEffect(() => {
    supabaseBrowser().auth.getSession().then(({ data }) => {
      setAccessToken(data.session?.access_token ?? null);
    });
  }, []);

  const settingsQ = useQuery({
    queryKey: ["automation-settings"],
    queryFn: () => apiGetAutomationSettings({ accessToken: accessToken! }),
    enabled: !!accessToken
  });

  useEffect(() => {
    if (settingsQ.data) {
      setRatingEnabled(settingsQ.data.rating_message_enabled);
      setRatingTemplate(settingsQ.data.rating_message_template || "");
      setCloseEnabled(settingsQ.data.close_message_enabled);
      setCloseTemplate(settingsQ.data.close_message_template || "");
      
      setHoursEnabled(settingsQ.data.business_hours_enabled || false);
      setHoursConfig(settingsQ.data.business_hours || DEFAULT_HOURS);
      setOutsideMessage(settingsQ.data.outside_hours_message || "");
    }
  }, [settingsQ.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!accessToken) return;
      await apiUpdateAutomationSettings({
        accessToken,
        data: {
          rating_message_enabled: ratingEnabled,
          rating_message_template: ratingTemplate,
          close_message_enabled: closeEnabled,
          close_message_template: closeTemplate,
          business_hours_enabled: hoursEnabled,
          business_hours: hoursConfig,
          outside_hours_message: outsideMessage
        }
      });
    },
    onSuccess: () => {
      notify("Configurações salvas com sucesso!", "success");
      qc.invalidateQueries({ queryKey: ["automation-settings"] });
    },
    onError: (err: any) => {
      notify(`Erro ao salvar: ${err.message}`, "error");
    }
  });

  const updateDay = (day: string, field: keyof DayConfig, value: any) => {
    setHoursConfig(prev => ({
      ...prev,
      [day]: { ...prev[day], [field]: value }
    }));
  };

  if (!accessToken) return <div className="p-8 text-center text-gray-500">Carregando...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
            <MessageSquare className="w-7 h-7 text-indigo-600" />
            Automação de Mensagens
          </h1>
          <p className="text-gray-500 dark:text-gray-400 font-medium mt-1">
            Configure mensagens automáticas para padronizar o atendimento.
          </p>
        </div>
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 flex items-center gap-2 disabled:opacity-50 transition-all"
        >
          <Save className="w-5 h-5" />
          {saveMutation.isPending ? "Salvando..." : "Salvar Alterações"}
        </button>
      </div>

      {/* Seção de Horário de Funcionamento */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 border border-gray-100 dark:border-gray-800 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-green-50 dark:bg-green-900/20 rounded-full blur-3xl -mr-16 -mt-16"></div>
        
        <div className="flex items-center justify-between mb-6 relative z-10">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-xl text-green-600 dark:text-green-400">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Horário de Funcionamento</h3>
              <p className="text-xs text-gray-500 font-medium">Defina quando a clínica está aberta</p>
            </div>
          </div>
          <button
            onClick={() => setHoursEnabled(!hoursEnabled)}
            className={`transition-colors ${hoursEnabled ? "text-green-600" : "text-gray-300 dark:text-gray-700"}`}
          >
            {hoursEnabled ? <ToggleRight className="w-10 h-10" /> : <ToggleLeft className="w-10 h-10" />}
          </button>
        </div>

        <div className={`space-y-6 transition-opacity ${hoursEnabled ? "opacity-100" : "opacity-50 pointer-events-none"}`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Lista de Dias */}
            <div className="space-y-3">
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Dias e Horários
              </label>
              <div className="space-y-2 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl">
                {ORDERED_DAYS.map((day) => (
                  <div key={day} className="flex items-center gap-3 text-sm">
                    <div className="w-24 font-medium text-gray-700 dark:text-gray-300">{DAYS_TRANSLATION[day]}</div>
                    <button
                      onClick={() => updateDay(day, 'active', !hoursConfig[day]?.active)}
                      className={`p-1.5 rounded-lg transition-colors ${hoursConfig[day]?.active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500"}`}
                    >
                      {hoursConfig[day]?.active ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                    </button>
                    {hoursConfig[day]?.active ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          value={hoursConfig[day]?.start || "08:00"}
                          onChange={(e) => updateDay(day, 'start', e.target.value)}
                          className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-xs"
                        />
                        <span className="text-gray-400">-</span>
                        <input
                          type="time"
                          value={hoursConfig[day]?.end || "18:00"}
                          onChange={(e) => updateDay(day, 'end', e.target.value)}
                          className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-xs"
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Fechado</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Mensagem de Ausência */}
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                Mensagem de Ausência (Fora do Horário)
              </label>
              <textarea
                value={outsideMessage}
                onChange={(e) => setOutsideMessage(e.target.value)}
                rows={6}
                className="w-full p-4 rounded-xl bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-green-500 outline-none text-sm font-medium text-gray-900 dark:text-white transition-all resize-none"
                placeholder="Ex: Olá! No momento estamos fechados. Nosso horário é..."
              />
              <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                <Info className="w-3 h-3" />
                Esta mensagem será enviada automaticamente quando um cliente entrar em contato fora dos horários definidos acima.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Card: Encerramento */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 border border-gray-100 dark:border-gray-800 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 dark:bg-indigo-900/20 rounded-full blur-3xl -mr-16 -mt-16"></div>
          
          <div className="flex items-center justify-between mb-6 relative z-10">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400">
                <Info className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Mensagem de Encerramento</h3>
                <p className="text-xs text-gray-500 font-medium">Enviada ao finalizar o atendimento</p>
              </div>
            </div>
            <button
              onClick={() => setCloseEnabled(!closeEnabled)}
              className={`transition-colors ${closeEnabled ? "text-indigo-600" : "text-gray-300 dark:text-gray-700"}`}
            >
              {closeEnabled ? <ToggleRight className="w-10 h-10" /> : <ToggleLeft className="w-10 h-10" />}
            </button>
          </div>

          <div className={`space-y-4 transition-opacity ${closeEnabled ? "opacity-100" : "opacity-50 pointer-events-none"}`}>
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                Texto da Mensagem
              </label>
              <textarea
                value={closeTemplate}
                onChange={(e) => setCloseTemplate(e.target.value)}
                disabled={!closeEnabled}
                rows={4}
                className="w-full p-4 rounded-xl bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-indigo-500 outline-none text-sm font-medium text-gray-900 dark:text-white transition-all resize-none"
                placeholder="Ex: Obrigado pelo contato! Até a próxima."
              />
              <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                <Info className="w-3 h-3" />
                Use <strong>{`{nome}`}</strong> para inserir o nome do cliente automaticamente.
              </p>
            </div>
          </div>
        </div>

        {/* Card: Avaliação (NPS) */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 border border-gray-100 dark:border-gray-800 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-50 dark:bg-amber-900/20 rounded-full blur-3xl -mr-16 -mt-16"></div>

          <div className="flex items-center justify-between mb-6 relative z-10">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-xl text-amber-600 dark:text-amber-400">
                <Star className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Pesquisa de Satisfação</h3>
                <p className="text-xs text-gray-500 font-medium">Enviada 5min após o encerramento</p>
              </div>
            </div>
            <button
              onClick={() => setRatingEnabled(!ratingEnabled)}
              className={`transition-colors ${ratingEnabled ? "text-amber-600" : "text-gray-300 dark:text-gray-700"}`}
            >
              {ratingEnabled ? <ToggleRight className="w-10 h-10" /> : <ToggleLeft className="w-10 h-10" />}
            </button>
          </div>

          <div className={`space-y-4 transition-opacity ${ratingEnabled ? "opacity-100" : "opacity-50 pointer-events-none"}`}>
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                Texto da Pergunta
              </label>
              <textarea
                value={ratingTemplate}
                onChange={(e) => setRatingTemplate(e.target.value)}
                disabled={!ratingEnabled}
                rows={4}
                className="w-full p-4 rounded-xl bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-amber-500 outline-none text-sm font-medium text-gray-900 dark:text-white transition-all resize-none"
                placeholder="Ex: De 1 a 5, como você avalia nosso atendimento?"
              />
              <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                <Info className="w-3 h-3" />
                O cliente deverá responder com um número de 1 a 5.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
