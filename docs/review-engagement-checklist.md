# Review Engagement Checklist

Use this quick pass before shipping review likes, comments, and sharing:

1. Browse a restroom detail page while logged out and confirm reviews still render normally.
2. Sign in, like a review, refresh, and confirm the like count and liked state persist.
3. Try liking the same review twice and confirm the count does not double-increment.
4. Sign in, add a comment, and confirm it appears under the correct review with your display name.
5. While logged out, try posting a comment and confirm the UI sends you to sign in instead of creating anything.
6. Load a restroom with comments and confirm reviews stay collapsed/compact by default, with the featured comment preview shown only as a secondary layer.
7. Expand comments and confirm the full thread is readable on mobile and desktop.
8. Use the share button on mobile and desktop:
   - native share should open where supported
   - clipboard fallback should copy a direct review link where native share is unavailable
9. Re-test existing review posting, photo uploads, restroom adds, and their point awards to confirm they still work unchanged.
