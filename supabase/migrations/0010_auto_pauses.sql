-- Migration 0010: Pausas Automáticas

alter table public.tenants
  add column if not exists auto_pause_enabled boolean default false,
  add column if not exists auto_pause_start_time time, -- ex: "12:00:00"
  add column if not exists auto_pause_end_time time; -- ex: "13:00:00"

