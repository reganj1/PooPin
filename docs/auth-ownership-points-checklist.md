# Auth, Ownership, and Points Verification Checklist

Use this checklist after applying the latest auth and points migrations.

## Auth and profile linkage
- Sign in twice with the same email and confirm Supabase returns the same auth user.
- Confirm repeated sign-ins for that same email resolve to the same `profiles.id`.
- Sign in with a different email and confirm a different auth user and different `profiles.id` are created.
- Confirm a profile row is auto-created on first sign-in with:
  - `supabase_auth_user_id`
  - generated `display_name`

## Protected write routes
- While logged out, verify these routes return `401`:
  - `POST /api/reviews`
  - `POST /api/restrooms/[id]/photos`
  - `POST /api/restrooms/submit`
  - `POST /api/profile/display-name`
- While logged in, confirm the same routes succeed only for the current session user.
- Confirm request bodies cannot set or override ownership fields.

## Ownership storage
- Create a review and confirm:
  - `reviews.profile_id = current profiles.id`
  - legacy `reviews.user_id` backfill/fallback does not break older rows
- Upload a photo and confirm:
  - `photos.profile_id = current profiles.id`
- Add a restroom and confirm:
  - `bathrooms.created_by_profile_id = current profiles.id`

## Points correctness
- Create one review and confirm exactly one point event exists:
  - `event_type = review_created`
  - `points_delta = 10`
- Upload one photo and confirm exactly one point event exists:
  - `event_type = photo_uploaded`
  - `points_delta = 8`
- Add one restroom and confirm exactly one point event exists:
  - `event_type = restroom_added`
  - `points_delta = 20`
- Re-submit the same award path for an existing entity id and confirm `point_events.idempotency_key` prevents duplicate awards.
- Confirm `/profile` total points equals the sum of awarded `point_events.points_delta` for that profile.

## Leaderboard foundation
- Query leaderboard data server-side and confirm:
  - totals match `point_events`
  - `display_name` is shown instead of email
  - the same account appears only once
- If `SUPABASE_SERVICE_ROLE_KEY` is missing, confirm leaderboard reads fail with a clear server-side configuration error instead of returning a misleading empty list.
