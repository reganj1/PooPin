# MVP Build Tasks

## Completed In This Pass
- [x] Bootstrap Next.js App Router + TypeScript + Tailwind project structure.
- [x] Define typed domain models for bathroom, review, photo, and report.
- [x] Add mock restroom and review dataset.
- [x] Build responsive homepage with map placeholder and nearby list.
- [x] Build restroom detail page from mock data.
- [x] Replace `/add` placeholder with a working add-restroom form (React Hook Form + Zod).
- [x] Add starter Supabase migration scaffold.
- [x] Add Supabase read path for homepage + detail with graceful mock fallback.
- [x] Connect add-restroom form submit to Supabase `bathrooms` insert with graceful errors.
- [x] Replace map placeholder with real Mapbox map + restroom pins + marker navigation.
- [x] Add review submission form on restroom detail with Supabase insert + refresh.
- [x] Add lightweight restroom marker popups with key ratings and detail action.
- [x] Add homepage “Use my location” support for map centering and distance-based re-sorting.
- [x] Add distinct current-location marker when near-me location is granted.
- [x] Add lightweight homepage filter and sort controls (public/accessibility/baby-station, closest/best-rated).
- [x] Add repeatable restroom seed import script for JSON/CSV with dedupe safeguards.
- [x] Split homepage map/list data strategies with viewport-based map pin loading.
- [x] Sync homepage list-hover and map-pin highlight states for easier pin/card matching.
- [x] Keep nearby list aligned with current map viewport/my-location context and preserve WC marker styling with hover emphasis.
- [x] Polish desktop homepage layout and copy for a cleaner, product-ready map/list experience.
- [x] Refine desktop UI toward a premium consumer map/list product feel (navigation, hierarchy, controls, and cards).
- [x] Redesign review submission UX with overall-star-first flow and optional quick-pick detail ratings mapped to existing schema.
- [x] Refine review form details into a lightweight "what stood out" flow with progressive optional categories.
- [x] Surface review outputs with human-readable chips/summaries and add lightweight review safety checks.
- [x] Add OSM/Overpass restroom seed pipeline with deterministic source IDs and existing dedupe safeguards.
- [x] Improve OSM restroom naming/address presentation quality for clearer map/list/detail readability.
- [x] Add moderation-first restroom photo uploads (Supabase Storage + pending review + approved-only public gallery).
- [x] Add anonymous anti-abuse protections for reviews (profanity guardrails, cooldown/rate limits, and review reporting).
- [x] Add anonymous restroom existence confirmations with community trust counts.
- [x] Expand Bay Area OSM seeding with chunked fetch/import workflow and stronger import-time normalization/dedupe.
- [x] Document product scope and local run instructions.

## Next Suggested Tasks
- [ ] Add basic filtering (open now, accessible, public only).
