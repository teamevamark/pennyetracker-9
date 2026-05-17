## Problem

`/marking/panchayath` shows the empty state ("Search above or create…") and no nodes ever appear. The DB has 94 panchayaths, so the data exists.

Root cause: the `panchayaths`, `wards`, and `*_connections` tables have RLS policies that only allow the `authenticated` role to read. The `/marking/*` routes are currently public (not gated by auth), so when the page loads without a signed-in session, Supabase silently returns `[]` (RLS hides rows; no error is thrown). The search box has nothing to match and the canvas stays empty.

Secondary issue: `GraphCanvas` swallows query errors — `useQuery` errors are never surfaced to the UI, so the user just sees an empty state with no hint of what's wrong.

## Fix

1. **Require auth for the marking pages.** Add a `src/routes/_authenticated.tsx` pathless layout route that:
   - Waits for the auth session to hydrate.
   - Redirects to `/auth` when there is no user.
   - Renders `<Outlet />` otherwise.

   Move the three marking routes to live under it by renaming:
   - `marking.index.tsx` → `_authenticated.marking.index.tsx`
   - `marking.panchayath.tsx` → `_authenticated.marking.panchayath.tsx`
   - `marking.ward.tsx` → `_authenticated.marking.ward.tsx`

   (URLs stay identical: `/marking`, `/marking/panchayath`, `/marking/ward`.)

2. **Surface query errors in `GraphCanvas`.** When the panchayaths/wards query errors, show a small inline error message + a `toast.error` so future RLS / network problems are visible instead of silently rendering empty state.

3. **Friendly empty-but-loaded state.** If the user is authenticated and the list truly has 0 rows for the chosen scope, keep the current placeholder copy. If still loading, show a brief loading hint instead of the "no data" placeholder so it doesn't look broken during the first fetch.

## Out of scope

- No DB / RLS changes. Panchayath data should stay readable only to authenticated users.
- No changes to the graph editing logic or the `delivery_staff` flows.

Once approved I'll implement these three edits.