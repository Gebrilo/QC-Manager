import { redirect } from 'next/navigation';

/**
 * Register page — redirects to the unified login page.
 * Registration is now handled inline on the login page.
 */
export default function RegisterPage() {
    redirect('/login');
}
