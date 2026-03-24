do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_supabase_auth_user_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_supabase_auth_user_id_fkey
      foreign key (supabase_auth_user_id)
      references auth.users (id)
      on delete set null;
  end if;
end
$$;

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  where p.supabase_auth_user_id = auth.uid()
  limit 1
$$;

revoke all on function public.current_profile_id() from public;
grant execute on function public.current_profile_id() to anon, authenticated;

alter table public.profiles enable row level security;
alter table public.bathrooms enable row level security;
alter table public.reviews enable row level security;
alter table public.photos enable row level security;
alter table public.reports enable row level security;

drop policy if exists "Public read active bathrooms" on public.bathrooms;
create policy "Public read active bathrooms"
  on public.bathrooms
  for select
  to public
  using (status = 'active');

drop policy if exists "Authenticated submit bathrooms" on public.bathrooms;
create policy "Authenticated submit bathrooms"
  on public.bathrooms
  for insert
  to authenticated
  with check (
    created_by = public.current_profile_id()
    and source = 'user'
    and status = 'pending'
  );

drop policy if exists "Public read active reviews" on public.reviews;
create policy "Public read active reviews"
  on public.reviews
  for select
  to public
  using (status = 'active');

drop policy if exists "Authenticated submit reviews" on public.reviews;
create policy "Authenticated submit reviews"
  on public.reviews
  for insert
  to authenticated
  with check (
    user_id = public.current_profile_id()
    and status = 'active'
  );

drop policy if exists "Public read active photos" on public.photos;
create policy "Public read active photos"
  on public.photos
  for select
  to public
  using (status = 'active');

drop policy if exists "Authenticated submit photos" on public.photos;
create policy "Authenticated submit photos"
  on public.photos
  for insert
  to authenticated
  with check (
    user_id = public.current_profile_id()
    and status = 'pending'
  );

drop policy if exists "Authenticated users can view own profile" on public.profiles;
create policy "Authenticated users can view own profile"
  on public.profiles
  for select
  to authenticated
  using (supabase_auth_user_id = auth.uid());

drop policy if exists "Authenticated users can create own profile" on public.profiles;
create policy "Authenticated users can create own profile"
  on public.profiles
  for insert
  to authenticated
  with check (supabase_auth_user_id = auth.uid());

drop policy if exists "Authenticated users can update own profile" on public.profiles;
create policy "Authenticated users can update own profile"
  on public.profiles
  for update
  to authenticated
  using (supabase_auth_user_id = auth.uid())
  with check (supabase_auth_user_id = auth.uid());

-- Reports intentionally stay public-facing because anonymous confirm/report flows
-- still query and write this table directly from the browser in the current MVP.
drop policy if exists "Public read reports" on public.reports;
create policy "Public read reports"
  on public.reports
  for select
  to public
  using (true);

drop policy if exists "Public insert reports" on public.reports;
create policy "Public insert reports"
  on public.reports
  for insert
  to public
  with check (char_length(trim(reason)) > 2);

drop policy if exists "Anon upload restroom photos" on storage.objects;
drop policy if exists "Authenticated upload restroom photos" on storage.objects;
create policy "Authenticated upload restroom photos"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'restroom-photos');

drop policy if exists "Public read approved restroom photos" on storage.objects;
create policy "Public read approved restroom photos"
  on storage.objects
  for select
  to public
  using (
    bucket_id = 'restroom-photos'
    and exists (
      select 1
      from public.photos p
      where p.storage_path = storage.objects.name
        and p.status = 'active'
    )
  );
