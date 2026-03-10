alter table if exists reviews
  add column if not exists quick_tags text[] not null default '{}'::text[];

alter table if exists reviews
  drop constraint if exists reviews_quick_tags_allowed;

alter table if exists reviews
  add constraint reviews_quick_tags_allowed
  check (
    quick_tags <@ array['clean', 'smelly', 'no_line', 'crowded', 'no_toilet_paper', 'locked']::text[]
  );

create index if not exists reviews_quick_tags_idx on reviews using gin (quick_tags);
