# API Contract: Authentication

## Overview

The authentication system migrates from a custom JWT/password-hash implementation to Supabase Auth.

## Removed Endpoints

- `POST /auth/login` - Handled entirely by Supabase Client SDK on the frontend.
- `POST /auth/register` - Handled by Supabase Client SDK (or combined logic).

## Modified Endpoints

### `GET /auth/me`
- **Auth required**: Yes (Supabase JWT)
- **Behavior**: Reads the Supabase JWT `sub` claim, looks up the corresponding `app_user` using `supabase_id`, and returns the user metadata, role, and permissions arrays as it does today.

### `PATCH /auth/profile`
- **Auth required**: Yes (Supabase JWT)
- **Behavior**: Updates the user profile in `app_user` based on the authenticated Supabase `sub` claim.

## Middlewares

### `requireAuth`
- Scans `Authorization: Bearer <token>`
- Verifies the signature using Supabase JWT Secret.
- Attaches the resolved `app_user` record to `req.user` by querying `SELECT * FROM app_user WHERE supabase_id = $1`.

