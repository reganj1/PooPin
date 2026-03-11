# Poopin

Poopin is a startup MVP web app for discovering and rating public restrooms, with smell, cleanliness, recency, and access friction as first-class signals.

## Tech Stack
- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui-compatible setup
- Supabase (planned integration)
- Mapbox (token-gated map setup)

## Local Development
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```
3. (Optional for map) set `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` in `.env.local`.
4. (Optional for analytics) set `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` in `.env.local`.
5. Start dev server:
   ```bash
   npm run dev
   ```
6. Open [http://localhost:3000](http://localhost:3000).

## Supabase Setup (Optional, Recommended Next)
1. Create a Supabase project in the dashboard.
2. Apply the schema from `supabase/migrations/20260308220000_initial_schema.sql`:
   - Option A: paste it into Supabase SQL Editor and run.
   - Option B: use Supabase CLI migrations if you already use the CLI workflow.
3. In project settings, copy:
   - `Project URL` -> `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public key` -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Add these to `.env.local` and restart `npm run dev`.

## Current MVP Routes
- `/` homepage with responsive map/list layout (Supabase-first with mock fallback)
- `/restroom/[id]` restroom detail (Supabase-first with mock fallback)
- `/add` add-restroom form with React Hook Form + Zod + Supabase insert

## Notes
- Map gracefully falls back to a setup placeholder when Mapbox token is missing.
- Restroom reads are Supabase-first for homepage/detail when env vars are configured.
- If Supabase env vars are missing (or read queries fail), homepage/detail automatically fall back to typed mock data.
- Add-restroom submits directly to Supabase when configured and shows graceful errors when not.
- PostHog analytics initializes only in production builds and only when both `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` are present.
