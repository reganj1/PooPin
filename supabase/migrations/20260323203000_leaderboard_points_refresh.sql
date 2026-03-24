update public.point_events
set points_delta = case
  when event_type = 'review_created' and status = 'reversed' then -5
  when event_type = 'review_created' then 5
  when event_type = 'photo_uploaded' and status = 'reversed' then -7
  when event_type = 'photo_uploaded' then 7
  when event_type = 'restroom_added' and status = 'reversed' then -10
  when event_type = 'restroom_added' then 10
  else points_delta
end
where event_type in ('review_created', 'photo_uploaded', 'restroom_added');

create or replace view public.leaderboard_profile_stats as
with review_counts as (
  select
    profile_id,
    count(distinct id)::integer as review_count,
    max(created_at) as last_review_at
  from public.reviews
  where profile_id is not null
    and status = 'active'
  group by profile_id
),
photo_counts as (
  select
    profile_id,
    count(distinct id)::integer as photo_count,
    max(created_at) as last_photo_at
  from public.photos
  where profile_id is not null
    and status in ('active', 'pending')
  group by profile_id
),
restroom_counts as (
  select
    created_by_profile_id as profile_id,
    count(distinct id)::integer as restroom_add_count,
    max(created_at) as last_restroom_at
  from public.bathrooms
  where created_by_profile_id is not null
    and source = 'user'
    and status in ('active', 'pending')
  group by created_by_profile_id
),
combined as (
  select
    p.id as profile_id,
    coalesce(nullif(btrim(p.display_name), ''), 'Poopin Pal') as display_name,
    coalesce(r.review_count, 0)::integer as review_count,
    coalesce(ph.photo_count, 0)::integer as photo_count,
    coalesce(rc.restroom_add_count, 0)::integer as restroom_add_count,
    nullif(
      greatest(
        coalesce(r.last_review_at, 'epoch'::timestamptz),
        coalesce(ph.last_photo_at, 'epoch'::timestamptz),
        coalesce(rc.last_restroom_at, 'epoch'::timestamptz)
      ),
      'epoch'::timestamptz
    ) as last_contribution_at
  from public.profiles p
  left join review_counts r on r.profile_id = p.id
  left join photo_counts ph on ph.profile_id = p.id
  left join restroom_counts rc on rc.profile_id = p.id
),
scored as (
  select
    profile_id,
    display_name,
    review_count,
    photo_count,
    restroom_add_count,
    (review_count + photo_count + restroom_add_count)::integer as contribution_count,
    (review_count * 5 + photo_count * 7 + restroom_add_count * 10)::integer as total_points,
    last_contribution_at
  from combined
),
ranked as (
  select
    row_number() over (
      order by
        total_points desc,
        restroom_add_count desc,
        photo_count desc,
        review_count desc,
        last_contribution_at desc nulls last,
        lower(display_name) asc,
        profile_id asc
    )::integer as rank,
    profile_id,
    display_name,
    total_points,
    review_count,
    photo_count,
    restroom_add_count,
    contribution_count,
    last_contribution_at
  from scored
  where total_points > 0
)
select
  rank,
  profile_id,
  display_name,
  total_points,
  review_count,
  photo_count,
  restroom_add_count,
  contribution_count,
  last_contribution_at
from ranked;
