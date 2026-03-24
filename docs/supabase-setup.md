# Supabase Setup Guide

## Goal
Enable live restroom reads/inserts from Supabase while keeping Poopin usable with mock data when env vars are missing, and wire Supabase Auth for contribution actions.

## 1) Create project
- Create a Supabase project in the Supabase dashboard.

## 2) Apply schema
- Open SQL Editor and run `supabase/migrations/20260308220000_initial_schema.sql`.
- This creates `bathrooms`, `reviews`, `photos`, and `reports` plus basic indexes and constraints.
- Run `supabase/migrations/20260309152000_setup_restroom_photo_storage.sql`.
- This creates/configures the `restroom-photos` storage bucket and policies:
  - baseline photo bucket setup
  - public reads only when matching `photos.status = 'active'`
- Run `supabase/migrations/20260323121500_add_supabase_profiles.sql`.
- Run `supabase/migrations/20260323170000_enable_auth_rls.sql`.
- This creates `profiles`, links them to Supabase Auth users, and enables RLS/policies for public reads plus authenticated contribution writes.
- Run `supabase/migrations/20260323190000_contribution_ownership_points.sql`.
- This adds profile-linked contribution ownership fields, the `point_events` table, leaderboard totals view, and points-related RLS/policies.
- Run `supabase/migrations/20260323203000_leaderboard_points_refresh.sql`.
- This updates contribution point weights to review `+5`, photo `+7`, restroom add `+10`, and creates the server-side `leaderboard_profile_stats` view.

## 3) Configure env vars
Set these in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
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
  - `/login` sends Supabase email one-time codes for contribution actions
  - `/add` inserts restroom rows into `bathrooms` with `source='user'` and `status='pending'`
  - `/restroom/[id]` supports photo upload to Supabase Storage with moderation-first behavior:
    - upload creates `photos` row as `status='pending'`
    - only `status='active'` photos render in the public gallery
  - `/profile` lets signed-in users rename their generated `poopin####` display name
  - contribution ownership and point awards use the server-only `SUPABASE_SERVICE_ROLE_KEY` path for safe account linkage + leaderboard totals
- Without env vars (or if query fails):
  - app falls back to local typed mock data
  - UI remains fully functional for MVP exploration

## 5) Supabase auth dashboard
- Enable Email auth in Supabase Auth.
- Poopin uses `signInWithOtp()` for email OTP codes, not magic-link clicking.
- Update the email template to use `{{ .Token }}` instead of `{{ .ConfirmationURL }}` so Supabase sends a code.
- Set `Site URL` and redirect URLs to include:
  - `http://localhost:3000/auth/callback`
  - your production callback URL
- See [docs/supabase-auth-branding.md](/Users/reganjia/Projects/PooPin%20/docs/supabase-auth-branding.md) for email branding and SMTP setup.
- See [docs/auth-ownership-points-checklist.md](/Users/reganjia/Projects/PooPin%20/docs/auth-ownership-points-checklist.md) for the post-migration verification checklist.

## Current fallback model
- Supabase configured + successful query: use live DB data.
- Supabase missing OR query failure: use mock data from `lib/mock/restrooms.ts`.
- Supabase missing or insert failure on `/add`: show actionable error and keep the form usable.
- Supabase missing or upload failure on photo submit: show actionable upload error and keep detail page usable.
