"use client";

import { useState } from "react";
import { Calendar, Clock, Bell, X } from "lucide-react";
import { apiBaseUrl } from "@/lib/api";

type TaskCreatorProps = {
  conversationId: string;
  accessToken: string;
  onTaskCreated: () => void;
  onCancel: () => void;
};

export default function TaskCreator({
  conversationId,
  accessToken,
  onTaskCreated,
  onCancel,
}: TaskCreatorProps) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Calcular data/hora mínima (agora)
  const now = new Date();
  const minDate = now.toISOString().split("T")[0];
  const minTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!title.trim()) {
      newErrors.title = "Título é obrigatório";
    }

    if (!dueDate) {
      newErrors.dueDate = "Data é obrigatória";
    }

    if (!dueTime) {
      newErrors.dueTime = "Hora é obrigatória";
    }

    // Validar se data/hora não está no passado
    if (dueDate && dueTime) {
      const dueDateTime = new Date(`${dueDate}T${dueTime}`);
      if (dueDateTime < now) {
        newErrors.dueDateTime = "Data e hora não podem ser no passado";
      }
    }

    // Se lembrete está marcado, validar que está no futuro
    if (reminderEnabled && dueDate && dueTime) {
      const dueDateTime = new Date(`${dueDate}T${dueTime}`);
      if (dueDateTime <= now) {
        newErrors.reminder = "Lembrete só pode ser ativado para tarefas futuras";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setSaving(true);
    try {
      // Combinar data e hora em ISO string
      const dueAt = new Date(`${dueDate}T${dueTime}`).toISOString();

      // Chamar API para criar tarefa
      const response = await fetch(`${apiBaseUrl()}/api/conversations/${conversationId}/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          due_at: dueAt,
          reminder_enabled: reminderEnabled,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Erro ao criar tarefa");
      }

      // Limpar formulário
      setTitle("");
      setDueDate("");
      setDueTime("");
      setReminderEnabled(false);
      setErrors({});

      onTaskCreated();
    } catch (err: any) {
      setErrors({ submit: err.message || "Erro ao criar tarefa" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-md border border-gray-200 dark:border-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Criar Nova Tarefa
          </h2>
          <button
            onClick={onCancel}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Título */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Título da Tarefa *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Confirmar consulta agendada"
              className={`w-full px-3 py-2 rounded-lg border ${
                errors.title
                  ? "border-red-500 focus:ring-red-500"
                  : "border-gray-300 dark:border-gray-700 focus:ring-blue-500"
              } bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 transition-colors`}
            />
            {errors.title && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {errors.title}
              </p>
            )}
          </div>

          {/* Data e Hora */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                <Calendar className="w-4 h-4 inline mr-1.5" />
                Data *
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                min={minDate}
                className={`w-full px-3 py-2 rounded-lg border ${
                  errors.dueDate || errors.dueDateTime
                    ? "border-red-500 focus:ring-red-500"
                    : "border-gray-300 dark:border-gray-700 focus:ring-blue-500"
                } bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 transition-colors`}
              />
              {errors.dueDate && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {errors.dueDate}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                <Clock className="w-4 h-4 inline mr-1.5" />
                Hora *
              </label>
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                min={dueDate === minDate ? minTime : undefined}
                className={`w-full px-3 py-2 rounded-lg border ${
                  errors.dueTime || errors.dueDateTime
                    ? "border-red-500 focus:ring-red-500"
                    : "border-gray-300 dark:border-gray-700 focus:ring-blue-500"
                } bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 transition-colors`}
              />
              {errors.dueTime && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {errors.dueTime}
                </p>
              )}
            </div>
          </div>

          {errors.dueDateTime && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {errors.dueDateTime}
            </p>
          )}

          {/* Lembrete */}
          <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
            <input
              type="checkbox"
              id="reminder"
              checked={reminderEnabled}
              onChange={(e) => setReminderEnabled(e.target.checked)}
              className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label
              htmlFor="reminder"
              className="flex-1 text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
            >
              <div className="flex items-center gap-2 mb-1">
                <Bell className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="font-medium">Lembrar-me desta tarefa</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Você receberá uma notificação no navegador quando a data/hora da
                tarefa chegar
              </p>
            </label>
          </div>

          {errors.reminder && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {errors.reminder}
            </p>
          )}

          {errors.submit && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400">
                {errors.submit}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium text-sm transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm hover:shadow-md"
            >
              {saving ? "Criando..." : "Criar Tarefa"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
