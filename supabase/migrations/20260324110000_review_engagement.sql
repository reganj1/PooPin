create table if not exists public.review_likes (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists review_likes_review_id_profile_id_unique_idx
  on public.review_likes (review_id, profile_id);

create index if not exists review_likes_review_id_created_at_idx
  on public.review_likes (review_id, created_at desc);

create table if not exists public.review_comments (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  status text not null default 'active' check (status in ('active', 'pending', 'flagged', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists review_comments_review_id_created_at_idx
  on public.review_comments (review_id, created_at asc);

create index if not exists review_comments_profile_id_created_at_idx
  on public.review_comments (profile_id, created_at desc);

alter table public.review_likes enable row level security;
alter table public.review_comments enable row level security;

drop policy if exists "Authenticated users can view own review likes" on public.review_likes;
create policy "Authenticated users can view own review likes"
  on public.review_likes
  for select
  to authenticated
  using (profile_id = public.current_profile_id());

drop policy if exists "Authenticated users can like reviews as themselves" on public.review_likes;
create policy "Authenticated users can like reviews as themselves"
  on public.review_likes
  for insert
  to authenticated
  with check (
    profile_id = public.current_profile_id()
    and exists (
      select 1
      from public.reviews r
      where r.id = review_id
        and r.status = 'active'
    )
  );

drop policy if exists "Authenticated users can unlike reviews as themselves" on public.review_likes;
create policy "Authenticated users can unlike reviews as themselves"
  on public.review_likes
  for delete
  to authenticated
  using (profile_id = public.current_profile_id());

drop policy if exists "Public read active review comments" on public.review_comments;
create policy "Public read active review comments"
  on public.review_comments
  for select
  to public
  using (status = 'active');

drop policy if exists "Authenticated users can comment as themselves" on public.review_comments;
create policy "Authenticated users can comment as themselves"
  on public.review_comments
  for insert
  to authenticated
  with check (
    profile_id = public.current_profile_id()
    and status = 'active'
    and char_length(trim(body)) between 2 and 320
    and exists (
      select 1
      from public.reviews r
      where r.id = review_id
        and r.status = 'active'
    )
  );
