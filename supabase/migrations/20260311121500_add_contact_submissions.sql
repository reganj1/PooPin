create table if not exists contact_submissions (
  id text primary key,
  name text not null check (char_length(trim(name)) between 2 and 80),
  email text not null check (char_length(trim(email)) between 3 and 254),
  topic text not null check (
    topic in (
      'general_feedback',
      'incorrect_restroom_info',
      'photo_or_content_issue',
      'business_or_partnership',
      'press_or_media',
      'other'
    )
  ),
  message text not null check (char_length(trim(message)) between 10 and 2000),
  restroom_url_or_id text,
  city_or_location text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists contact_submissions_created_at_idx on contact_submissions(created_at desc);
create index if not exists contact_submissions_topic_idx on contact_submissions(topic);
