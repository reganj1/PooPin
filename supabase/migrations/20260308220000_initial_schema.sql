create extension if not exists pgcrypto;

create table if not exists bathrooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  place_type text not null,
  address text not null,
  city text not null,
  state text not null,
  lat double precision not null,
  lng double precision not null,
  access_type text not null,
  has_baby_station boolean not null default false,
  is_gender_neutral boolean not null default false,
  is_accessible boolean not null default false,
  requires_purchase boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  status text not null default 'active',
  source text not null default 'user',
  source_external_id text
);

create index if not exists bathrooms_city_idx on bathrooms(city);
create index if not exists bathrooms_location_idx on bathrooms(lat, lng);
create index if not exists bathrooms_status_idx on bathrooms(status);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  bathroom_id uuid not null references bathrooms(id) on delete cascade,
  user_id uuid,
  overall_rating numeric(2,1) not null,
  smell_rating numeric(2,1) not null,
  cleanliness_rating numeric(2,1) not null,
  wait_rating numeric(2,1) not null,
  privacy_rating numeric(2,1) not null,
  review_text text,
  visit_time timestamptz,
  created_at timestamptz not null default now(),
  status text not null default 'active'
);

create index if not exists reviews_bathroom_id_idx on reviews(bathroom_id);
create index if not exists reviews_created_at_idx on reviews(created_at desc);

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  bathroom_id uuid not null references bathrooms(id) on delete cascade,
  user_id uuid,
  storage_path text not null,
  created_at timestamptz not null default now(),
  status text not null default 'active'
);

create index if not exists photos_bathroom_id_idx on photos(bathroom_id);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  bathroom_id uuid not null references bathrooms(id) on delete cascade,
  user_id uuid,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists reports_bathroom_id_idx on reports(bathroom_id);
