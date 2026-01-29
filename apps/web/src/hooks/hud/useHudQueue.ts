import { useQuery, useQueryClient, keepPreviousData, type UseQueryResult } from '@tanstack/react-query';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import { useEffect } from 'react';

export type HudQueueConversation = {
  id: string;
  assigned_user_id: string | null;
  updated_at: string;
  priority: number;
  last_outbound_at: string | null;
  last_patient_message_at: string | null;
  contacts: {
    display_name: string | null;
    profile_picture_url: string | null;
    phone_e164: string | null;
  } | null;
  funnel_stages: { name: string | null } | null;
  assigned_user: { full_name: string | null } | null;
  sla_timers: {
    due_at: string;
    breached_at: string | null;
    paused_at: string | null;
    started_at: string;
  } | null;
};

export function useHudQueue(): UseQueryResult<HudQueueConversation[], Error> {
  const supabase = supabaseBrowser();
  const qc = useQueryClient();

  const query = useQuery<HudQueueConversation[], Error>({
    queryKey: ['hud-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select(`
          *,
          contacts(display_name, profile_picture_url, phone_e164),
          funnel_stages(name),
          assigned_user:profiles!assigned_user_id(full_name),
          sla_timers(due_at, breached_at, paused_at, started_at)
        `)
        .neq('status_fila', 'finalizado')
        .order('priority', { ascending: false })
        .order('updated_at', { ascending: false });

      if (error) {
        const message = String((error as any)?.message ?? '');
        if (/abort|aborted|AbortError/i.test(message)) {
          return (qc.getQueryData(['hud-queue']) ?? []) as HudQueueConversation[];
        }
        throw new Error(message || 'query_failed');
      }

      return (data ?? []) as HudQueueConversation[];
    },
    placeholderData: keepPreviousData,
    staleTime: 30000, // Cache por 30s
    refetchOnWindowFocus: false
  });

  // 🔥 REALTIME: Escutar mudanças nas conversas
  useEffect(() => {
    const channel = supabase
      .channel('hud-queue-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'conversations'
        },
        () => {
          // Invalidar query para refetch automático
          qc.invalidateQueries({ queryKey: ['hud-queue'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sla_timers'
        },
        () => {
          // SLA mudou, atualizar fila
          qc.invalidateQueries({ queryKey: ['hud-queue'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, qc]);

  return query;
}
