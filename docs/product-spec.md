# Poopin MVP Product Spec (v0)

## Vision
Poopin helps people quickly find reliable public restrooms, with smell, cleanliness, recency, and access friction as first-class signals.

## MVP Goals
- Show nearby restrooms on map/list from a shared dataset.
- Allow users to open restroom details and inspect ratings.
- Prepare clear pathways for adding restrooms, reviews, and photos in next iterations.

## Scope In This Pass
- Next.js App Router foundation with TypeScript + Tailwind.
- Mock-first data model with typed bathroom/review/photo/report entities.
- Homepage map/list layout with graceful map fallback.
- Restroom detail route with ratings and recent reviews.
- Placeholder add-restroom route.

## Out Of Scope In This Pass
- Auth and user profiles.
- Real Supabase reads/writes.
- Live Mapbox rendering.
- Photo upload flows.
- Moderation workflows.

## Core Data Fields
### bathrooms
- id
- name
- place_type
- address
- city
- state
- lat
- lng
- access_type
- has_baby_station
- is_gender_neutral
- is_accessible
- requires_purchase
- created_by
- created_at
- status
- source
- source_external_id

### reviews
- id
- bathroom_id
- user_id
- overall_rating
- smell_rating
- cleanliness_rating
- wait_rating
- privacy_rating
- review_text
- visit_time
- created_at
- status

### photos
- id
- bathroom_id
- user_id
- storage_path
- created_at
- status

### reports
- id
- bathroom_id
- user_id
- reason
- created_at

## UX Notes
- Mobile-first list and map stacking, then split layout on large screens.
- Restroom cards should prioritize quick scan fields: distance, overall/smell/cleanliness, access tags.
- Map panel must stay useful even when token is missing.
