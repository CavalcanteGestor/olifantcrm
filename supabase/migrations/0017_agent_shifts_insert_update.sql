-- Migration 0017: Adicionar políticas INSERT e UPDATE para agent_shifts e agent_pauses

-- Política INSERT para agent_shifts: usuário pode criar seu próprio turno
drop policy if exists agent_shifts_insert_own on public.agent_shifts;
create policy agent_shifts_insert_own on public.agent_shifts
  for insert to authenticated
  with check (user_id = auth.uid());

-- Política UPDATE para agent_shifts: usuário pode atualizar seu próprio turno
drop policy if exists agent_shifts_update_own on public.agent_shifts;
create policy agent_shifts_update_own on public.agent_shifts
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Política INSERT para agent_pauses: usuário pode criar pausas em seus próprios turnos
drop policy if exists agent_pauses_insert_own on public.agent_pauses;
create policy agent_pauses_insert_own on public.agent_pauses
  for insert to authenticated
  with check (
    exists (
      select 1 from public.agent_shifts s
      where s.id = agent_pauses.shift_id
      and s.user_id = auth.uid()
    )
  );

-- Política UPDATE para agent_pauses: usuário pode atualizar pausas de seus próprios turnos
drop policy if exists agent_pauses_update_own on public.agent_pauses;
create policy agent_pauses_update_own on public.agent_pauses
  for update to authenticated
  using (
    exists (
      select 1 from public.agent_shifts s
      where s.id = agent_pauses.shift_id
      and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.agent_shifts s
      where s.id = agent_pauses.shift_id
      and s.user_id = auth.uid()
    )
  );
