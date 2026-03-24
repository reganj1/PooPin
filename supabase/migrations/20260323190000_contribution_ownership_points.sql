alter table public.reviews add column if not exists profile_id uuid;
alter table public.photos add column if not exists profile_id uuid;
alter table public.bathrooms add column if not exists created_by_profile_id uuid;

update public.reviews r
set profile_id = r.user_id
where r.profile_id is null
  and r.user_id is not null
  and exists (
    select 1
    from public.profiles p
    where p.id = r.user_id
  );

update public.photos p
set profile_id = p.user_id
where p.profile_id is null
  and p.user_id is not null
  and exists (
    select 1
    from public.profiles pr
    where pr.id = p.user_id
  );

update public.bathrooms b
set created_by_profile_id = b.created_by
where b.created_by_profile_id is null
  and b.created_by is not null
  and exists (
    select 1
    from public.profiles p
    where p.id = b.created_by
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reviews_profile_id_fkey'
  ) then
    alter table public.reviews
      add constraint reviews_profile_id_fkey
      foreign key (profile_id)
      references public.profiles (id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'photos_profile_id_fkey'
  ) then
    alter table public.photos
      add constraint photos_profile_id_fkey
      foreign key (profile_id)
      references public.profiles (id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'bathrooms_created_by_profile_id_fkey'
  ) then
    alter table public.bathrooms
      add constraint bathrooms_created_by_profile_id_fkey
      foreign key (created_by_profile_id)
      references public.profiles (id)
      on delete set null;
  end if;
end
$$;

create index if not exists reviews_profile_id_idx on public.reviews (profile_id);
create index if not exists photos_profile_id_idx on public.photos (profile_id);
create index if not exists bathrooms_created_by_profile_id_idx on public.bathrooms (created_by_profile_id);

create table if not exists public.point_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null check (event_type in ('review_created', 'photo_uploaded', 'restroom_added')),
  entity_type text not null check (entity_type in ('review', 'photo', 'restroom')),
  entity_id uuid not null,
  points_delta integer not null,
  status text not null default 'awarded' check (status in ('awarded', 'reversed')),
  idempotency_key text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists point_events_idempotency_key_unique_idx
  on public.point_events (idempotency_key);

create index if not exists point_events_profile_id_created_at_idx
  on public.point_events (profile_id, created_at desc);

create index if not exists point_events_status_created_at_idx
  on public.point_events (status, created_at desc);

create or replace view public.profile_point_totals as
select
  p.id as profile_id,
  p.display_name,
  coalesce(sum(pe.points_delta) filter (where pe.status = 'awarded'), 0)::integer as total_points,
  max(pe.created_at) filter (where pe.status = 'awarded') as last_event_at
from public.profiles p
left join public.point_events pe
  on pe.profile_id = p.id
group by p.id, p.display_name;

alter table public.point_events enable row level security;

drop policy if exists "Authenticated submit bathrooms" on public.bathrooms;
create policy "Authenticated submit bathrooms"
  on public.bathrooms
  for insert
  to authenticated
  with check (
    created_by_profile_id = public.current_profile_id()
    and source = 'user'
    and status = 'pending'
  );

drop policy if exists "Authenticated submit reviews" on public.reviews;
create policy "Authenticated submit reviews"
  on public.reviews
  for insert
  to authenticated
  with check (
    profile_id = public.current_profile_id()
    and status = 'active'
  );

drop policy if exists "Authenticated submit photos" on public.photos;
create policy "Authenticated submit photos"
  on public.photos
  for insert
  to authenticated
  with check (
    profile_id = public.current_profile_id()
    and status = 'pending'
  );

drop policy if exists "Authenticated users can view own point events" on public.point_events;
create policy "Authenticated users can view own point events"
  on public.point_events
  for select
  to authenticated
  using (profile_id = public.current_profile_id());
