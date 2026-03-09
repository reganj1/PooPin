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
- [x] Document product scope and local run instructions.

## Next Suggested Tasks
- [ ] Add image upload to Supabase Storage.
- [ ] Add basic filtering (open now, accessible, public only).
