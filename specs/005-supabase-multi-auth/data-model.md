# Data Model: Supabase Multi-Auth

## Entity Modifications

### `public.app_user` (Existing)

To seamlessly link Supabase Auth with the existing QC Manager database roles and metadata, we must modify the `app_user` table:

- **New Field**: `supabase_id` (UUID, UNIQUE) - Links directly to `auth.users.id`.
- **Modified Field**: `password_hash` (VARCHAR) - Make NULLABLE, as social/phone users won't have a password in `public.app_user` (Supabase handles it).

### `auth.users` (Supabase Managed)

Supabase automatically manages this table. Our API will interact with it via the `@supabase/supabase-js` admin client.

- **Primary Identifier**: `id` (UUID) - Mapped to `app_user.supabase_id`.
- **Identities**: Tracks linked providers (e.g., `google`, `azure`, `phone`, `email`).

## State Transitions

1. **User Registration (Social/Phone)**: 
   - Supabase creates `auth.users` record.
   - App intercepts via Webhook or API route.
   - Creates `public.app_user` with matching `supabase_id`, `email`/`phone`.
   - Default role assigned (Admin if first user, Viewer otherwise).

2. **Session Validation**:
   - Client sends Supabase JWT in `Authorization: Bearer <token>`.
   - API middleware verifies token using Supabase JWT secret.
   - API looks up `public.app_user` using `token.sub` == `supabase_id`.

