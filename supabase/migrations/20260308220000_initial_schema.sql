create extension if not exists pgcrypto;

create table if not exists bathrooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  place_type text not null check (place_type in ('park', 'restaurant', 'cafe', 'mall', 'transit_station', 'library', 'gym', 'office', 'other')),
  address text not null,
  city text not null,
  state text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  access_type text not null check (access_type in ('public', 'customer_only', 'code_required', 'staff_assisted')),
  has_baby_station boolean not null default false,
  is_gender_neutral boolean not null default false,
  is_accessible boolean not null default false,
  requires_purchase boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'pending', 'flagged', 'removed')),
  source text not null default 'user' check (source in ('user', 'google_places', 'city_open_data', 'partner', 'other')),
  source_external_id text
);

create index if not exists bathrooms_city_idx on bathrooms(city);
create index if not exists bathrooms_location_idx on bathrooms(lat, lng);
create index if not exists bathrooms_status_idx on bathrooms(status);
create index if not exists bathrooms_created_at_idx on bathrooms(created_at desc);
create unique index if not exists bathrooms_source_external_unique_idx
  on bathrooms(source, source_external_id)
  where source_external_id is not null;

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  bathroom_id uuid not null references bathrooms(id) on delete cascade,
  user_id uuid,
  overall_rating numeric(2,1) not null check (overall_rating between 1 and 5),
  smell_rating numeric(2,1) not null check (smell_rating between 1 and 5),
  cleanliness_rating numeric(2,1) not null check (cleanliness_rating between 1 and 5),
  wait_rating numeric(2,1) not null check (wait_rating between 1 and 5),
  privacy_rating numeric(2,1) not null check (privacy_rating between 1 and 5),
  review_text text,
  visit_time timestamptz,
  created_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'pending', 'flagged', 'removed'))
);

create index if not exists reviews_bathroom_id_idx on reviews(bathroom_id);
create index if not exists reviews_created_at_idx on reviews(created_at desc);

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  bathroom_id uuid not null references bathrooms(id) on delete cascade,
  user_id uuid,
  storage_path text not null,
  created_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'pending', 'flagged', 'removed'))
);

create index if not exists photos_bathroom_id_idx on photos(bathroom_id);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  bathroom_id uuid not null references bathrooms(id) on delete cascade,
  user_id uuid,
  reason text not null check (char_length(trim(reason)) > 2),
  created_at timestamptz not null default now()
);

create index if not exists reports_bathroom_id_idx on reports(bathroom_id);
