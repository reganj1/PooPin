create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  supabase_auth_user_id uuid,
  display_name text not null check (char_length(trim(display_name)) between 3 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_supabase_auth_user_id_unique_idx
  on public.profiles (supabase_auth_user_id)
  where supabase_auth_user_id is not null;

create index if not exists profiles_display_name_idx on public.profiles(display_name);

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'users'
  ) then
    insert into public.profiles (id, display_name, created_at, updated_at)
    select u.id, u.display_name, coalesce(u.created_at, now()), coalesce(u.updated_at, now())
    from public.users u
    where not exists (
      select 1
      from public.profiles p
      where p.id = u.id
    );
  end if;
end
$$;
