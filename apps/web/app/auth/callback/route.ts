import { NextRequest, NextResponse } from 'next/server'

function getOrigin(request: NextRequest): string {
    const forwardedHost = request.headers.get('x-forwarded-host')
    const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'
    return forwardedHost
        ? `${forwardedProto}://${forwardedHost}`
        : new URL(request.url).origin
}

/**
 * Auth callback handler.
 *
 * Handles two cases:
 * 1. Error params (e.g. expired link) → redirect to /login?error=...
 * 2. Email confirmation → redirect to /auth/confirmed (activation screen).
 *    The email is already verified by Supabase when this callback is hit,
 *    so the user can sign in manually after seeing the confirmation.
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const origin = getOrigin(request)

    const error = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    if (error) {
        const message = errorDescription || error
        return NextResponse.redirect(
            `${origin}/login?error=${encodeURIComponent(message)}`
        )
    }

    // Email confirmation callback — redirect to the confirmation page.
    // The email is already verified by Supabase at this point; the user
    // will sign in manually after seeing the confirmation screen.
    return NextResponse.redirect(`${origin}/auth/confirmed`)
}
