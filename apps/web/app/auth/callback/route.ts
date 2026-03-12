import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Auth callback route handler.
 * Supabase redirects here after a user clicks a magic link in their email.
 * Exchanges the auth code for a session, then redirects to the login page
 * which picks up the session via onAuthStateChange.
 */
export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const error = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    // Handle auth errors (expired link, etc.)
    if (error) {
        const message = errorDescription || error
        return NextResponse.redirect(
            `${origin}/login?error=${encodeURIComponent(message)}`
        )
    }

    if (!code) {
        return NextResponse.redirect(
            `${origin}/login?error=${encodeURIComponent('No authorization code received')}`
        )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
        return NextResponse.redirect(
            `${origin}/login?error=${encodeURIComponent('Authentication service not configured')}`
        )
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    try {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

        if (exchangeError) {
            return NextResponse.redirect(
                `${origin}/login?error=${encodeURIComponent(exchangeError.message)}`
            )
        }

        // Successful exchange — redirect to login page.
        // The AuthProvider's onAuthStateChange listener will detect the new session
        // and call /auth/sync to create/retrieve the app_user.
        return NextResponse.redirect(`${origin}/login?auth=callback`)
    } catch (err) {
        return NextResponse.redirect(
            `${origin}/login?error=${encodeURIComponent('Authentication failed. Please try again.')}`
        )
    }
}
