import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import { useMemo, useEffect } from 'react';

export type UnansweredCount = {
  conversation_id: string;
  unanswered_count: number;
};

export function useUnansweredCounts(conversationIds: string[]): UseQueryResult<Map<string, number>, Error> {
  const supabase = supabaseBrowser();
  const queryClient = useQueryClient();
  
  // Estabilizar o array de IDs para evitar re-renders desnecessários
  const stableIds = useMemo(() => {
    return [...conversationIds].sort();
  }, [conversationIds.join(',')]);

  const query = useQuery<Map<string, number>, Error>({
    queryKey: ['unanswered-counts', stableIds],
    queryFn: async () => {
      if (stableIds.length === 0) {
        return new Map();
      }

      const { data, error } = await supabase.rpc('get_unanswered_counts', {
        p_conversation_ids: stableIds
      });

      if (error) {
        throw new Error(error.message || 'query_failed');
      }

      const map = new Map<string, number>();
      (data ?? []).forEach((item: UnansweredCount) => {
        map.set(item.conversation_id, item.unanswered_count);
      });

      return map;
    },
    enabled: stableIds.length > 0,
    staleTime: 30000, // Cache por 30s
    refetchOnWindowFocus: false
  });

  // 🔥 REALTIME: Escutar mudanças nas mensagens para atualizar contadores
  useEffect(() => {
    if (stableIds.length === 0) return;

    const channel = supabase
      .channel('unanswered-counts-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages'
        },
        () => {
          // Mensagem nova/atualizada, recalcular contadores
          queryClient.invalidateQueries({ queryKey: ['unanswered-counts'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [stableIds.length, supabase, queryClient]);

  return query;
}
