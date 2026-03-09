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

You can override format:

```bash
npm run seed:import:restrooms -- --input ./data/sf-restrooms.csv --format csv
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

## Common options
- `--source city_open_data|google_places|partner|user|other` (default: `city_open_data`)
- `--default-city "San Francisco"` (default: `San Francisco`)
- `--default-state "CA"` (default: `CA`)
- `--distance-miles 0.08` duplicate radius for no-external-id fallback
- `--dry-run` parse + dedupe summary without DB writes

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

## Notes
- The script never deletes existing rows.
- It normalizes incoming fields to the current `bathrooms` schema and defaults unknown values conservatively.
- Input rows missing required name/address/lat/lng are skipped and counted as invalid.
