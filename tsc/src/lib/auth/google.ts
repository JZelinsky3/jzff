// Google Identity Services (GIS) helper — renders the official "Sign in
// with Google" button, exchanges the resulting ID token with Supabase via
// signInWithIdToken, and applies optional referral metadata to the new
// profile. Bypasses the Supabase OAuth redirect entirely so Google's
// consent screen shows thesundaychronicle.app instead of the raw Supabase
// project URL.
//
// Accounts are still stored in Supabase auth.users — signInWithIdToken
// dedupes on email, so users created via the old OAuth flow log right
// back in to the same account on first GIS sign-in.
//
// Requires NEXT_PUBLIC_GOOGLE_CLIENT_ID (Web client ID from Google Cloud
// Console). Without it, isGoogleClientConfigured() returns false and the
// caller should fall back to the legacy supabase.auth.signInWithOAuth
// flow.

'use client'

import { createClient } from '@/lib/supabase/client'

type GsiCredentialResponse = { credential: string }
type GsiInitConfig = {
  client_id: string
  callback: (response: GsiCredentialResponse) => void
  nonce?: string
  use_fedcm_for_prompt?: boolean
  auto_select?: boolean
  cancel_on_tap_outside?: boolean
}
type GsiButtonOptions = {
  type?: 'standard' | 'icon'
  theme?: 'outline' | 'filled_blue' | 'filled_black'
  size?: 'large' | 'medium' | 'small'
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
  shape?: 'rectangular' | 'pill' | 'circle' | 'square'
  logo_alignment?: 'left' | 'center'
  width?: number | string
  locale?: string
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GsiInitConfig) => void
          renderButton: (parent: HTMLElement, options: GsiButtonOptions) => void
          prompt: () => void
          disableAutoSelect: () => void
        }
      }
    }
  }
}

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client'
const REFERRAL_CHANNELS = new Set(['discord', 'reddit', 'twitter', 'facebook', 'ai', 'other'])

export function isGoogleClientConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
}

let scriptPromise: Promise<void> | null = null
function loadGisScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.google?.accounts?.id) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Google sign-in failed to load.')), { once: true })
      return
    }
    const s = document.createElement('script')
    s.src = SCRIPT_SRC
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Google sign-in failed to load.'))
    document.head.appendChild(s)
  })
  return scriptPromise
}

function randomNonce(): string {
  const a = new Uint8Array(32)
  crypto.getRandomValues(a)
  return Array.from(a).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export type GoogleSignInOptions = {
  next?: string
  referral?: string
  referralOther?: string
}

export type MountHooks = {
  onSubmitting?: () => void
  onError?: (err: Error) => void
}

// Renders the official Google button into `parent`. `getOptions` is read
// at callback time so the latest referral/next state is used even though
// initialize() is only called once per mount.
export async function mountGoogleSignInButton(
  parent: HTMLElement,
  getOptions: () => GoogleSignInOptions,
  hooks: MountHooks = {},
): Promise<void> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  if (!clientId) throw new Error('NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set.')

  await loadGisScript()
  const nonce = randomNonce()
  const hashedNonce = await sha256Hex(nonce)

  window.google!.accounts.id.initialize({
    client_id: clientId,
    nonce: hashedNonce,
    use_fedcm_for_prompt: true,
    auto_select: false,
    cancel_on_tap_outside: true,
    callback: async (response) => {
      hooks.onSubmitting?.()
      try {
        const supabase = createClient()
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: response.credential,
          nonce,
        })
        if (error) {
          hooks.onError?.(error as Error)
          return
        }

        // Apply referral metadata if this is a fresh signup. Mirrors the
        // server-side logic that used to live in /auth/callback: only fill
        // when the profile row is still blank, never overwrite.
        const opts = getOptions()
        const ref = opts.referral
        if (ref && REFERRAL_CHANNELS.has(ref)) {
          try {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('referral_source')
                .eq('id', user.id)
                .maybeSingle<{ referral_source: string | null }>()
              if (profile && !profile.referral_source) {
                const otherTrim = ref === 'other' && opts.referralOther
                  ? opts.referralOther.trim().slice(0, 120)
                  : null
                await supabase
                  .from('profiles')
                  .update({ referral_source: ref, referral_source_other: otherTrim })
                  .eq('id', user.id)
              }
            }
          } catch {
            // Referral write is best-effort. Never block sign-in on it.
          }
        }

        // Hard nav so server components see the new session on the next page.
        window.location.assign(opts.next || '/hub')
      } catch (err) {
        hooks.onError?.(err instanceof Error ? err : new Error('Sign-in failed.'))
      }
    },
  })

  parent.innerHTML = ''
  const measured = parent.clientWidth
  const width = measured > 0 ? Math.min(400, Math.max(240, measured)) : 320

  // Render two stacked GIS buttons (outline + filled_black) and cross-fade
  // between them on parent :hover via CSS. Same nonce, same callback —
  // either click triggers the same sign-in flow.
  const outlineSlot = document.createElement('div')
  outlineSlot.className = 'dc-gis-btn dc-gis-btn-outline'
  const filledSlot = document.createElement('div')
  filledSlot.className = 'dc-gis-btn dc-gis-btn-filled'
  parent.appendChild(outlineSlot)
  parent.appendChild(filledSlot)

  const common = {
    type: 'standard' as const,
    size: 'large' as const,
    text: 'continue_with' as const,
    shape: 'rectangular' as const,
    logo_alignment: 'left' as const,
    width,
  }
  window.google!.accounts.id.renderButton(outlineSlot, { ...common, theme: 'outline' })
  window.google!.accounts.id.renderButton(filledSlot, { ...common, theme: 'filled_black' })
}
