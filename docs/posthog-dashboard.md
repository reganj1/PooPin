# Poopin PostHog Event Model and Dashboard

This model is intentionally minimal and product-focused.

## Core Events
- `page_view_home`
- `restroom_marker_clicked`
- `restroom_popup_opened`
- `restroom_viewed`
- `navigate_clicked`

## Contribution Events
- `add_restroom_started`
- `restroom_submitted`
- `review_started`
- `review_submitted`
- `photo_uploaded`

## Optional Utility Events
- `expand_map_clicked`
- `locate_clicked`

## Event Properties
Keep these context properties where applicable:
- `source_surface`
- `viewport_mode`
- `has_user_location`

Plus event-specific identifiers:
- `bathroom_id`
- `source` (for `navigate_clicked`)
- `status` (for `restroom_submitted` / `locate_clicked`)
- review/photo specific fields (`overall_rating`, `quick_tag_count`, `moderation_state`)

Automatic metadata added for filtering:
- `app_hostname`
- `app_pathname`

## Recommended Dashboard

### Product usage snapshot
- Unique users with `page_view_home`
- Unique users with `restroom_marker_clicked`
- Unique users with `restroom_viewed`
- Unique users with `navigate_clicked`

### Core funnel
1. `page_view_home`
2. `restroom_marker_clicked`
3. `restroom_popup_opened`
4. `restroom_viewed`
5. `navigate_clicked`

### Contribution funnels
- `add_restroom_started` -> `restroom_submitted`
- `restroom_viewed` -> `review_started` -> `review_submitted`

### Surface performance
Break down `navigate_clicked` by:
- `source_surface`
- `viewport_mode`
- `has_user_location`

## Founder Filtering
Use dashboard filters to exclude obvious internal traffic:
- `app_hostname` does not contain `localhost`
- `app_hostname` does not contain `127.0.0.1`
