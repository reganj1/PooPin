# Restroom Review Summary Checklist

Use this pass to verify the safer restroom-level scoring model:

1. Existing Supabase review rows still render on restroom detail pages without any data migration.
2. No schema or backfill step is required for the new summary logic to work.
3. A restroom with only one review shows cautious language like limited data or an early signal instead of looking settled.
4. Recent reviews pull the summary more than older reviews for the same restroom.
5. Conflicting tagged reviews produce mixed wording instead of a one-sided claim.
6. A single standout tag does not create an overconfident restroom-level signal by itself.
7. Restroom summary copy stays readable, compact, and trustworthy on mobile and desktop.
