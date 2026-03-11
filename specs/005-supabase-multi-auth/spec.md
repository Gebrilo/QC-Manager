# Feature Specification: Supabase Multi-Provider Authentication

**Feature Branch**: `005-supabase-multi-auth`  
**Created**: 2026-03-11  
**Status**: Draft  
**Input**: User description: "Add multiple connection options, like login with Google and Microsoft, or even login with a phone number and receive an OTP."

## Clarifications

### Session 2026-03-11

- Q: Should password reset, email verification, and MFA be in scope for this feature? → A: Include password reset and email verification for social/phone users in this feature. MFA excluded.
- Q: Should social/phone login options appear on the registration page too? → A: Merge login and registration into a single unified auth page where social buttons handle both automatically.
- Q: If a user signs in with a different social provider but the same email, how should the system handle it? → A: Block the login and tell the user to sign in with their original provider. No silent merging.
- Q: How should the system handle both the existing custom JWTs and new Supabase Auth tokens? → A: Migrate fully to Supabase session tokens for all users and deprecate the custom JWT generator.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign In with Google (Priority: P1)

A returning or new user visits the login page and clicks "Sign in with Google." The system redirects them to Google's consent screen, where they authorize the application. Upon returning, the system either creates a new account (if first-time) or matches the user with their existing account (by email). The user lands on their personalized dashboard.

**Why this priority**: Google accounts are the most widely used identity provider. This single integration covers the largest portion of potential users and dramatically reduces friction for sign-up and login.

**Independent Test**: Can be fully tested by clicking "Sign in with Google" on the login page and confirming that the user arrives on the dashboard with correct profile information.

**Acceptance Scenarios**:

1. **Given** a user on the login page with no existing account, **When** they click "Sign in with Google" and authorize, **Then** a new account is created with their Google profile (name, email) and they are redirected to the application.
2. **Given** a user who previously registered with the same email via email/password or Microsoft, **When** they click "Sign in with Google," **Then** the login is blocked and they see a message instructing them to log in with their original provider.
3. **Given** a user who cancels the Google consent screen, **When** they are returned to the app, **Then** they see the login page with an appropriate message and no account is created.

---

### User Story 2 - Sign In with Microsoft (Priority: P2)

A user visits the login page and clicks "Sign in with Microsoft." The system redirects them to Microsoft's login and consent screen. Once authorized, the user is logged in or a new account is created (same matching logic as Google).

**Why this priority**: Microsoft accounts are widespread in enterprise and education environments, which is highly relevant for a QC Management Tool used by professional teams. Adding Microsoft after Google maximizes identity provider coverage for the target audience.

**Independent Test**: Can be fully tested by clicking "Sign in with Microsoft" on the login page and confirming successful login/account creation.

**Acceptance Scenarios**:

1. **Given** a user on the login page, **When** they click "Sign in with Microsoft" and complete authorization, **Then** they are logged in and land on the dashboard.
2. **Given** a new user signing in with Microsoft, **When** authorization completes, **Then** a new account is created using their Microsoft profile information (name, email).
3. **Given** a user whose Microsoft email matches an existing account from another provider, **When** they sign in via Microsoft, **Then** the login is blocked and they are instructed to use their original sign-in method.

---

### User Story 3 - Sign In with Phone OTP (Priority: P3)

A user visits the login page, chooses the "Sign in with Phone" option, and enters their phone number. The system sends a one-time password (OTP) via SMS. The user enters the OTP and is authenticated. If no account exists for that phone number, a new account is created.

**Why this priority**: Phone OTP provides a passwordless option that is especially valuable for users in mobile-first environments or those who prefer not to use email-based login. It also serves as an alternative when users don't have or want to use Google/Microsoft accounts.

**Independent Test**: Can be fully tested by entering a phone number, receiving an OTP code, submitting the code, and verifying the user arrives on the dashboard.

**Acceptance Scenarios**:

1. **Given** a user on the login page, **When** they enter a valid phone number and request an OTP, **Then** they receive an SMS with a verification code within 60 seconds.
2. **Given** a user who received an OTP, **When** they enter the correct code, **Then** they are authenticated and redirected to the application.
3. **Given** a user who enters an incorrect or expired OTP, **When** they submit, **Then** they see an error message and can request a new code.
4. **Given** a new phone number not linked to any account, **When** the user completes OTP verification, **Then** a new account is created using their phone number as the primary identifier.

---

### User Story 4 - Existing Email/Password Login Continuation (Priority: P1)

Users who already have an email/password account continue to log in using their existing credentials without disruption. The new social and phone login options appear alongside the existing email/password form.

**Why this priority**: Backward compatibility is critical. No existing user should be locked out or confused by the addition of new login methods.

**Independent Test**: Can be fully tested by logging in with existing email/password credentials and verifying the same behavior as today.

**Acceptance Scenarios**:

1. **Given** an existing user with email/password credentials, **When** they visit the login page, **Then** they see the email/password form alongside the new social login buttons.
2. **Given** an existing user, **When** they log in with email/password, **Then** the login works identically to current behavior.

---

### User Story 5 - Password Reset (Priority: P2)

A user who has an email/password account forgets their password. They click "Forgot Password" on the login page, enter their email, and receive a password reset link. They follow the link, set a new password, and can log in again.

**Why this priority**: Password reset is a critical recovery mechanism. Without it, users who forget their password are permanently locked out of their accounts.

**Independent Test**: Can be fully tested by requesting a password reset, clicking the emailed link, setting a new password, and logging in with it.

**Acceptance Scenarios**:

1. **Given** a user on the login page, **When** they click "Forgot Password" and enter a registered email, **Then** they receive a password reset email within 2 minutes.
2. **Given** a user who received a reset email, **When** they click the link and enter a new valid password, **Then** their password is updated and they can log in with the new credentials.
3. **Given** a user who enters an unregistered email, **When** they request a password reset, **Then** the system shows a generic success message (to prevent email enumeration) but sends no email.
4. **Given** a reset link that is older than its expiry window, **When** a user clicks it, **Then** they see an "expired link" message and can request a new one.

---

### User Story 6 - Email Verification for Phone-Only Users (Priority: P3)

A user who signed up via phone OTP is prompted to optionally add and verify an email address. This gives them an additional recovery path and enables email-based features (notifications, password reset).

**Why this priority**: Phone-only users currently have no email on file. Adding email verification ensures they can fully participate in email-based workflows and recover their account if they change phone numbers.

**Independent Test**: Can be fully tested by logging in via phone, adding an email, receiving a verification link, clicking it, and confirming the email appears on the user profile.

**Acceptance Scenarios**:

1. **Given** a phone-only user who is logged in, **When** they navigate to their profile and add an email, **Then** a verification email is sent to that address.
2. **Given** a user who received a verification email, **When** they click the verification link, **Then** their email is marked as verified and linked to their account.
3. **Given** a user who enters an email already linked to another account, **When** they try to verify, **Then** the system rejects the request and informs them the email is already in use.

---

### Edge Cases

- What happens when a user tries to sign in with Google but their Google email is already associated with a Microsoft-linked account?
  - The system will block the login and display an error message directing the user to sign in with Microsoft.
- What happens when a user signs in with Phone OTP but later tries to link the same phone number to a different account?
  - The system should prevent duplicate phone number registration and inform the user.
- What happens if the OTP SMS fails to deliver?
  - The user should be able to request a resend after a cooldown period (e.g., 30 seconds).
- What happens when a social provider is temporarily unavailable?
  - The login page should gracefully handle the error and show a user-friendly message without blocking other login methods.
- How does the system handle users with deactivated accounts attempting social login?
  - Deactivated users should see a "Contact administrator" message, consistent with current email/password behavior.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow users to sign in using their Google account via the login page.
- **FR-002**: System MUST allow users to sign in using their Microsoft account via the login page.
- **FR-003**: System MUST allow users to sign in using their phone number with an OTP code delivered via SMS.
- **FR-004**: System MUST continue to support existing email/password login without any changes to current user experience.
- **FR-005**: System MUST automatically create a new user account on first-time sign-in via any social or phone provider (with appropriate default role and activation status).
- **FR-006**: System MUST prevent account merging if a user attempts to sign in with a new social provider using an email address already registered via a different provider (including email/password). Instead, it MUST display an error directing them to use their original provider.
- **FR-007**: System MUST provide a single unified authentication page that handles both login and registration, replacing separate login/register pages.
- **FR-008**: System MUST maintain the existing role-based permission system (admin, manager, user, viewer, contributor) for all authentication methods.
- **FR-009**: System MUST enforce the same activation workflow for social/phone users as for email/password users (first user = admin + auto-activated; subsequent users = viewer + awaiting activation).
- **FR-010**: System MUST allow users to request a new OTP code after a cooldown period if the initial code expires or fails.
- **FR-011**: System MUST handle authentication errors gracefully, displaying user-friendly messages without exposing internal details.
- **FR-012**: System MUST migrate all user sessions to use Supabase Auth tokens instead of the legacy custom JWT system. The custom JWT generator and validation middleware MUST be replaced by Supabase token validation.
- **FR-013**: System MUST allow email/password users to reset their password via a "Forgot Password" flow that sends a time-limited reset link to their registered email.
- **FR-014**: System MUST prompt phone-only users to optionally add and verify an email address for recovery and notification purposes.
- **FR-015**: System MUST prevent email enumeration by displaying the same response for both registered and unregistered emails during password reset requests.

### Key Entities

- **User Account**: Represents an authenticated user. May be linked to one or more authentication providers (email/password, Google, Microsoft, phone). Key attributes: name, email, phone, role, activation status, linked providers.
- **Authentication Provider**: Represents a method of sign-in (e.g., Google, Microsoft, Phone OTP, email/password). Tracks which providers are linked to which user accounts.
- **OTP Code**: A one-time verification code associated with a phone number. Has an expiry window and limited retry attempts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete sign-in via Google or Microsoft in under 30 seconds from clicking the button to landing on the dashboard.
- **SC-002**: OTP codes are delivered to the user's phone within 60 seconds of request in 95% of cases.
- **SC-003**: 100% of existing email/password users can continue to log in without any change to their workflow.
- **SC-004**: The login page loads with all available sign-in options visible within 3 seconds on standard connections.
- **SC-005**: Account linking correctly matches existing accounts by email or phone number with zero data duplication.
- **SC-006**: Failed social/phone logins display clear, actionable error messages within 5 seconds, guiding the user on next steps.

## Assumptions

- Supabase Auth is available and will be used as the authentication provider, handling Google/Microsoft OAuth flows, phone OTP delivery, and session tokens.
- Google and Microsoft OAuth provider apps (client ID, client secret) will be configured by the project administrator via the Supabase Dashboard.
- SMS delivery for phone OTP will use Supabase's built-in phone provider configuration (Twilio or another supported SMS gateway, configured in Supabase Dashboard).
- New social/phone users follow the same activation workflow: the first user becomes admin (auto-activated), subsequent users are assigned the "viewer" role and require admin activation.
- Rate limiting for OTP requests (e.g., max 5 requests per phone number per hour) will be handled by Supabase's built-in rate limiting.
