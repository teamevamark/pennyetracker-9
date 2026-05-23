## Goal

Add a self-serve staff signup + login flow that uses **mobile number + password only** (no email, no OTP). New signups land in a "pending" queue; a super admin then approves them and assigns a role (admin or delivery staff) along with their panchayath/ward.

## User flow

**Signup (`/staff/signup`)** — public page:
- Full name
- Mobile number (validated, normalized to `+<digits>`)
- Panchayath (dropdown from `panchayaths`)
- Ward (dropdown filtered by selected panchayath from `wards`)
- Password + Repeat password (min 6, must match)
- Submit → account created in `auth.users` with phone+password, `phone_confirm=true` (no SMS), profile + `delivery_staff` row inserted with `status='pending'`, panchayath/ward stored on a join row. No role assigned yet.
- Success screen: "Your account is pending super admin approval."

**Login (`/staff/login`)** — public page:
- Mobile number + password → `supabase.auth.signInWithPassword({ phone, password })`
- After sign-in:
  - If no role yet → show "Pending approval" screen with sign-out button.
  - If `delivery` role → redirect to delivery dashboard (or landing).
  - If `admin`/`super_admin` role → redirect to `/admin`.

**Super admin approval (`/admin/staff` — extend existing page):**
- New "Pending approvals" section listing `delivery_staff` rows with `status='pending'`.
- For each row: show name, phone, requested panchayath/ward, signup date.
- Actions: **Approve as Delivery**, **Approve as Admin**, **Reject**.
  - Approve → insert into `user_roles` (`delivery` or `admin`), set `status='active'`, keep panchayath/ward assignments (already linked via `delivery_staff_panchayaths` / `delivery_staff_wards`).
  - Reject → set `status='rejected'` (do not delete auth user; super admin can clean up separately).

## Database changes (migration)

Existing `delivery_staff.status` is already `text default 'active'`. We will:
1. Allow `'pending'` and `'rejected'` as valid statuses (no constraint to change — it's free-text today).
2. No schema change to `user_roles` — signup simply doesn't create a row there; approval does.
3. The `handle_new_user` trigger currently auto-inserts `('delivery')` into `user_roles` and writes to `profiles` using `email`. We need to update it so phone-only signups don't auto-grant the `delivery` role and don't require email:
   - Change trigger to insert profile with whatever's available (email or phone), and **only** insert a `user_roles` row when `raw_user_meta_data->>'auto_role'` is set (legacy path). For new staff signups, no role is auto-granted.

## Server-side (TanStack server functions, not edge functions)

New file `src/lib/staff-signup.functions.ts`:
- `staffSignup({ full_name, phone, password, panchayath_id, ward_id })`
  - Uses `supabaseAdmin` to:
    1. `auth.admin.createUser({ phone, password, phone_confirm: true, user_metadata: { full_name } })`
    2. Upsert `profiles` (id, full_name, phone)
    3. Insert into `delivery_staff` (user_id, full_name, phone, status='pending')
    4. Insert into `delivery_staff_panchayaths` and `delivery_staff_wards`
  - Validates with Zod (name 1–120, phone `/^\+?[0-9]{6,20}$/`, password ≥ 6, valid UUIDs, password === repeat).
  - Returns `{ ok: true }` or `{ error }`.

New file `src/lib/staff-approval.functions.ts` (protected by `requireSupabaseAuth` + super_admin check inside handler):
- `listPendingStaff()` → rows from `delivery_staff` where `status='pending'` joined with their panchayath/ward names.
- `approveStaff({ staff_id, role: 'admin' | 'delivery' })` → insert `user_roles`, set `status='active'`.
- `rejectStaff({ staff_id })` → set `status='rejected'`.

## Frontend changes

- **New routes**
  - `src/routes/staff.signup.tsx` — form with name / phone / panchayath select / ward select (loads wards for chosen panchayath) / password / repeat password.
  - `src/routes/staff.login.tsx` — phone + password form, calls `supabase.auth.signInWithPassword({ phone, password })`.
  - `src/routes/staff.pending.tsx` — shown to signed-in users with no role.
- **Existing routes**
  - `src/routes/admin.staff.tsx` — add "Pending Approvals" card above existing staff list with the three actions.
  - `src/routes/landing.tsx` (and/or auth page) — add a "Staff sign in / sign up" entry point.
  - `src/hooks/use-auth.tsx` — after sign-in, if `roles` is empty and a `delivery_staff` row exists with status≠active, route the user to `/staff/pending`.

## Security notes

- Self-signup must NOT grant any role automatically — verified by the trigger change above and by the server function not inserting into `user_roles`.
- All admin/role mutations go through server functions that re-check `super_admin` via `has_role`.
- Phone is normalized server-side; duplicate phone returns a clean error.
- Mobile-only auth means email-based password reset doesn't apply; a "forgot password" flow can be added later as a super-admin reset action.

## Out of scope (ask if needed)

- SMS OTP verification of the phone number (we use `phone_confirm=true` — phone is trusted on signup, like the existing admin-create flow).
- Password reset for staff users.
- Editing a staff member's requested panchayath/ward during approval (super admin can change it later from the existing staff admin UI).
