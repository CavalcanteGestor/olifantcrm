-- Alterar conversations.assigned_user_id para apontar para profiles (permite join no PostgREST)
ALTER TABLE public.conversations
  DROP CONSTRAINT conversations_assigned_user_id_fkey,
  ADD CONSTRAINT conversations_assigned_user_id_fkey
  FOREIGN KEY (assigned_user_id)
  REFERENCES public.profiles(user_id)
  ON DELETE SET NULL;

-- Alterar messages.sent_by_user_id para apontar para profiles
ALTER TABLE public.messages
  DROP CONSTRAINT messages_sent_by_user_id_fkey,
  ADD CONSTRAINT messages_sent_by_user_id_fkey
  FOREIGN KEY (sent_by_user_id)
  REFERENCES public.profiles(user_id)
  ON DELETE SET NULL;

-- Alterar funnel_moves.moved_by_user_id para apontar para profiles
ALTER TABLE public.funnel_moves
  DROP CONSTRAINT funnel_moves_moved_by_user_id_fkey,
  ADD CONSTRAINT funnel_moves_moved_by_user_id_fkey
  FOREIGN KEY (moved_by_user_id)
  REFERENCES public.profiles(user_id)
  ON DELETE SET NULL;
