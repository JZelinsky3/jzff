import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const REFERRAL_CHANNELS = new Set(['discord', 'reddit', 'twitter', 'facebook', 'ai', 'other'])

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  // Default post-auth landing is the Clubhouse (/hub) — the signed-in home.
  const next = url.searchParams.get('next') ?? '/hub'

  // Optional referral metadata bounced through Google OAuth via the
  // redirectTo URL. Password signup persists referral via signUp({ data })
  // before the user lands here; OAuth has no equivalent form field, so we
  // stash the selection on the redirectTo and apply it here once.
  const refRaw = url.searchParams.get('ref')
  const refOtherRaw = url.searchParams.get('ref_other')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      if (refRaw && REFERRAL_CHANNELS.has(refRaw)) {
        // Only fill if the profile doesn't already have a referral on file —
        // we never want to overwrite a deliberate /account edit with stale
        // query-string data from an old redirect.
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('referral_source')
            .eq('id', user.id)
            .maybeSingle()
          if (profile && !profile.referral_source) {
            const otherTrimmed = refRaw === 'other' && refOtherRaw
              ? refOtherRaw.slice(0, 120)
              : null
            await supabase
              .from('profiles')
              .update({ referral_source: refRaw, referral_source_other: otherTrimmed })
              .eq('id', user.id)
          }
        }
      }
      return NextResponse.redirect(new URL(next, url.origin))
    }
  }

  return NextResponse.redirect(new URL('/login?error=auth', url.origin))
}
