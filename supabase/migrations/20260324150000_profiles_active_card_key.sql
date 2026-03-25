alter table public.profiles
  add column if not exists active_card_key text;
