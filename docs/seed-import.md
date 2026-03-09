# Restroom Seed Import

## Goal
Import real restroom rows (JSON or CSV) into Supabase `bathrooms` with lightweight normalization and dedupe safeguards.

## Script
Use:

```bash
npm run seed:import:restrooms -- --input <path-to-file>
```

Supported formats:
- `.json` (auto-detected)
- `.csv` (auto-detected)

## Bay Area Workflow (Recommended)
Fetch in reliable chunks instead of one giant bbox:

```bash
npm run seed:fetch:bay-area
```

This writes:
- `supabase/seeds/bay-area/osm-sf-overpass.json`
- `supabase/seeds/bay-area/osm-east_bay-overpass.json`
- `supabase/seeds/bay-area/osm-peninsula-overpass.json`
- `supabase/seeds/bay-area/osm-south_bay-overpass.json`
- `supabase/seeds/bay-area/osm-north_bay-overpass.json`

Import all available Bay Area chunk files:

```bash
npm run seed:import:bay-area
```

Dry run import:

```bash
npm run seed:import:bay-area -- --dry-run
```

Import specific chunks only:

```bash
npm run seed:import:bay-area -- --chunks sf,east_bay
```

or:

```bash
npm run seed:import:bay-area -- --chunk south_bay
```

You can also fetch specific chunks:

```bash
npm run seed:fetch:osm -- --chunk sf
npm run seed:fetch:osm -- --chunks east_bay,peninsula
```

You can override format:

```bash
npm run seed:import:restrooms -- --input ./data/sf-restrooms.csv --format csv
```

For OpenStreetMap/Overpass, fetch raw `amenity=toilets` first:

```bash
npm run seed:fetch:osm -- \
  --bbox 37.706,-122.524,37.833,-122.356 \
  --output ./supabase/seeds/osm-sf-overpass.json
```

If the default Overpass endpoint is overloaded, try an alternate endpoint:

```bash
npm run seed:fetch:osm -- \
  --bbox 37.706,-122.524,37.833,-122.356 \
  --endpoint https://overpass.kumi.systems/api/interpreter \
  --output ./supabase/seeds/osm-sf-overpass.json
```

Then import with OSM source:

```bash
npm run seed:import:restrooms -- \
  --input ./supabase/seeds/osm-sf-overpass.json \
  --source openstreetmap \
  --default-city "San Francisco" \
  --default-state "CA"
```

## Required env vars
Preferred:

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Fallback (less ideal):

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## Before importing OSM data
Make sure latest migrations are applied so `bathrooms.source` accepts `openstreetmap`:

```bash
supabase db push
```

## Common options
- `--source city_open_data|openstreetmap|google_places|partner|user|other` (default: `city_open_data`)
- `--default-city "San Francisco"` (default: `San Francisco`)
- `--default-state "CA"` (default: `CA`)
- `--distance-miles 0.08` duplicate radius for no-external-id fallback
- `--dry-run` parse + dedupe summary without DB writes

### Fetch script options
- `--chunk sf|east_bay|peninsula|south_bay|north_bay`
- `--chunks sf,east_bay,...`
- `--all-bay-area`
- `--output-dir ./supabase/seeds/bay-area`

Example for San Francisco public restroom dataset:

```bash
npm run seed:import:restrooms -- \
  --input ./data/sf-public-restrooms.json \
  --source city_open_data \
  --default-city "San Francisco" \
  --default-state "CA" \
  --dry-run
```

Then run real import:

```bash
npm run seed:import:restrooms -- \
  --input ./data/sf-public-restrooms.json \
  --source city_open_data \
  --default-city "San Francisco" \
  --default-state "CA"
```

## Dedupe strategy
1. If `source_external_id` exists:
- Upsert by `(source, source_external_id)`.
- This is repeatable and prevents duplicate rows for the same external record.

2. If `source_external_id` is missing:
- Skip insert when an existing row has a similar name and is within the configured distance radius.
- Similar name uses normalized token matching.

### OSM deterministic IDs
- Overpass elements are normalized with deterministic IDs when possible:
  - `source = openstreetmap`
  - `source_external_id = osm:<type>/<id>` (for example `osm:node/123456789`)
- This keeps repeated OSM imports idempotent through the same source+external-id upsert path.

### Additional OSM duplicate guard
- For clearly overlapping nearby generic OSM rows, the importer applies a stricter duplicate check before insert/upsert.
- This is intentionally conservative and avoids aggressive cross-merging against trusted city datasets.

## Import normalization highlights
- Generic OSM names are upgraded using context priority:
  1. specific name
  2. landmark/operator
  3. street
  4. neighborhood
  5. city fallback
- Weak location fallbacks are normalized to cleaner labels (for example `Near <landmark>` or `Near <city>`).
- OSM tags are used to improve:
  - `place_type` inference
  - `access_type`
  - `is_accessible`
  - `is_gender_neutral`
  - `has_baby_station`
  - `requires_purchase`

## Notes
- The script never deletes existing rows.
- It normalizes incoming fields to the current `bathrooms` schema and defaults unknown values conservatively.
- Input rows missing required coordinates (`lat`/`lng`) are skipped and counted as invalid.
- For sparse OSM rows, missing names/addresses are filled with safe defaults to keep schema compatibility.
