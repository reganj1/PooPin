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
4. Start dev server:
   ```bash
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000).

## Current MVP Routes
- `/` homepage with responsive map/list layout
- `/restroom/[id]` restroom detail using mock data
- `/add` placeholder page for add-restroom flow

## Notes
- Map gracefully falls back to a setup placeholder when Mapbox token is missing.
- Data is currently mock-first and strongly typed.
- Supabase migration scaffold lives under `supabase/migrations/` for the next integration pass.
