import { redirect } from 'next/navigation';

/**
 * Password reset page — no longer needed with magic link authentication.
 * Redirects to the login page.
 */
export default function ResetPasswordPage() {
    redirect('/login');
}
