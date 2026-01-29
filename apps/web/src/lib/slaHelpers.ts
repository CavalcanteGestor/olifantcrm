export type SlaTimer = {
  due_at: string;
  breached_at: string | null;
  paused_at: string | null;
  started_at: string;
} | null;

export type SlaIndicator = {
  label: string;
  color: string;
  bgColor: string;
  icon?: string;
};

/**
 * Calcula o indicador de SLA baseado no timer
 */
export function getSlaIndicator(timer: SlaTimer): SlaIndicator | null {
  if (!timer?.due_at || timer.paused_at) {
    return null; // Não mostrar nada se pausado ou sem timer
  }

  const due = new Date(timer.due_at).getTime();
  const now = Date.now();
  const remaining = due - now;

  if (timer.breached_at || remaining <= 0) {
    return {
      label: 'Atrasado',
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      icon: '🔴'
    };
  }

  if (remaining <= 300_000) { // 5 minutos
    return {
      label: 'Urgente',
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20',
      icon: '⚠️'
    };
  }

  if (remaining <= 600_000) { // 10 minutos
    return {
      label: 'Atenção',
      color: 'text-yellow-600 dark:text-yellow-400',
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
      icon: '⏰'
    };
  }

  return null; // No prazo - não mostrar nada
}

/**
 * Verifica se precisa de follow-up baseado no tempo sem resposta do cliente
 */
export function needsFollowUp(
  lastPatientMessageAt: string | null,
  lastOutboundAt: string | null,
  followUpMinutes: number = 120
): boolean {
  if (!lastPatientMessageAt) return false;
  
  const lastPatient = new Date(lastPatientMessageAt).getTime();
  const lastOut = lastOutboundAt ? new Date(lastOutboundAt).getTime() : 0;
  
  // Se já respondemos depois da última mensagem do paciente, não precisa follow-up
  if (lastOut > lastPatient) return false;
  
  const now = Date.now();
  const minutesSinceLastPatient = (now - lastPatient) / 60_000;
  
  return minutesSinceLastPatient >= followUpMinutes;
}

/**
 * Formata o tempo restante de forma legível
 */
export function formatTimeRemaining(timer: SlaTimer): string | null {
  if (!timer?.due_at || timer.paused_at) return null;

  const due = new Date(timer.due_at).getTime();
  const now = Date.now();
  const remaining = due - now;

  if (remaining <= 0) return 'Atrasado';

  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);

  if (minutes > 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}
