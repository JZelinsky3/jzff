// GET /api/me → { signedIn: boolean }
//
// A tiny, cache-proof auth probe for statically-served almanac pages (the
// demo tree lives under /public and can't have its __DC.isSignedIn injected
// server-side, so it ships hardcoded false). The demo nav scripts call this
// on load and, if the visitor is actually authenticated, swap the signed-out
// CTA (Sign in / New chronicle — which just loops back through /login for an
// already-signed-in user) for the real account links.
//
// Deliberately returns nothing but a boolean: no id, email, or profile, so it
// is safe to hit from any public page.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return NextResponse.json(
    { signedIn: !!user },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
