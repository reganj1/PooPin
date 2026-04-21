create table if not exists public.report_notes (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  comment text not null,
  constraint report_notes_comment_length check (char_length(btrim(comment)) between 1 and 500)
);

create index if not exists report_notes_report_id_idx
  on public.report_notes (report_id);

alter table public.report_notes enable row level security;

create or replace function public.soft_delete_fresh_review(
  p_review_id uuid,
  p_profile_id uuid,
  p_delete_after timestamptz
)
returns table (
  review_id uuid,
  bathroom_id uuid,
  profile_id uuid,
  created_at timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_review record;
begin
  select r.id, r.bathroom_id, r.profile_id, r.created_at, r.status
    into target_review
  from public.reviews r
  where r.id = p_review_id
  for update;

  if not found then
    raise exception 'review_not_found' using errcode = 'P0002';
  end if;

  if target_review.profile_id is distinct from p_profile_id then
    raise exception 'review_not_owned' using errcode = '42501';
  end if;

  if target_review.status <> 'active' then
    raise exception 'review_not_active' using errcode = 'P0001';
  end if;

  if target_review.created_at < p_delete_after then
    raise exception 'review_delete_window_expired' using errcode = 'P0001';
  end if;

  update public.reviews
  set status = 'removed'
  where id = p_review_id;

  update public.point_events
  set status = 'reversed',
      points_delta = -5
  where profile_id = p_profile_id
    and event_type = 'review_created'
    and entity_type = 'review'
    and entity_id = p_review_id
    and status = 'awarded';

  return query
  select target_review.id, target_review.bathroom_id, target_review.profile_id, target_review.created_at;
end;
$$;
