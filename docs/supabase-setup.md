# Supabase Setup Guide

## Goal
Enable live restroom reads/inserts from Supabase while keeping Poopin usable with mock data when env vars are missing.

## 1) Create project
- Create a Supabase project in the Supabase dashboard.

## 2) Apply schema
- Open SQL Editor and run `supabase/migrations/20260308220000_initial_schema.sql`.
- This creates `bathrooms`, `reviews`, `photos`, and `reports` plus basic indexes and constraints.
- Run `supabase/migrations/20260309152000_setup_restroom_photo_storage.sql`.
- This creates/configures the `restroom-photos` storage bucket and policies:
  - anon upload allowed
  - public reads only when matching `photos.status = 'active'`

## 3) Configure env vars
Set these in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_SUPABASE_PHOTOS_BUCKET=restroom-photos
```

Then restart dev server:

```bash
npm run dev
```

## 4) Verify behavior
- With env vars present and schema applied:
  - `/` reads restroom list from Supabase
  - `/restroom/[id]` reads restroom + reviews from Supabase
  - `/add` inserts restroom rows into `bathrooms` with `source='user'` and `status='active'`
  - `/restroom/[id]` supports photo upload to Supabase Storage with moderation-first behavior:
    - upload creates `photos` row as `status='pending'`
    - only `status='active'` photos render in the public gallery
- Without env vars (or if query fails):
  - app falls back to local typed mock data
  - UI remains fully functional for MVP exploration

## Current fallback model
- Supabase configured + successful query: use live DB data.
- Supabase missing OR query failure: use mock data from `lib/mock/restrooms.ts`.
- Supabase missing or insert failure on `/add`: show actionable error and keep the form usable.
- Supabase missing or upload failure on photo submit: show actionable upload error and keep detail page usable.
