'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type Result = { ok: false; error: string } | { ok: true; message?: string }

// ─── Email change ─────────────────────────────────────────────────────────
// Supabase sends a confirmation link to BOTH the old and new addresses by
// default. The email doesn't actually change until both are confirmed (the
// new one for verification, the old one for security). UI should say so.

const EmailSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
})

export async function updateEmail(_prev: Result | null, formData: FormData): Promise<Result> {
  const parsed = EmailSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid email.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }
  if (parsed.data.email.toLowerCase() === user.email?.toLowerCase()) {
    return { ok: false, error: 'That\'s already your current email.' }
  }

  const { error } = await supabase.auth.updateUser({ email: parsed.data.email })
  if (error) return { ok: false, error: error.message }

  return {
    ok: true,
    message: `Confirmation links sent to ${user.email} and ${parsed.data.email}. The change takes effect once you click both.`,
  }
}

// ─── Password change ──────────────────────────────────────────────────────
// User is signed in, so Supabase doesn't require the old password. We still
// require it on the form as a UX safeguard against drive-by hijacking on a
// shared device — verified by re-signing-in with email + currentPassword
// before applying the new one.

// Password schema with `currentPassword` optional — set-initial-password
// callers (magic-link-only accounts that have never had a password) skip it.
const PasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, 'New password must be at least 8 characters.'),
})

export async function updatePassword(_prev: Result | null, formData: FormData): Promise<Result> {
  const parsed = PasswordSchema.safeParse({
    currentPassword: formData.get('currentPassword') ?? undefined,
    newPassword: formData.get('newPassword'),
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { ok: false, error: 'Not signed in.' }
  if (user.app_metadata?.provider && user.app_metadata.provider !== 'email') {
    return { ok: false, error: `Your account is signed in via ${user.app_metadata.provider}. Manage your password there.` }
  }

  const hadPassword = user.user_metadata?.has_password_set === true

  // Only verify the current password when one has actually been set before.
  // Magic-link-only accounts never had one, so the first call here behaves
  // as "set initial password" — no verification step.
  if (hadPassword) {
    if (!parsed.data.currentPassword) {
      return { ok: false, error: 'Enter your current password.' }
    }
    const { error: signinErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: parsed.data.currentPassword,
    })
    if (signinErr) return { ok: false, error: 'Current password doesn\'t match.' }
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
    data: { ...(user.user_metadata ?? {}), has_password_set: true },
  })
  if (error) return { ok: false, error: error.message }

  return {
    ok: true,
    message: hadPassword ? 'Password updated.' : 'Password set — you can now sign in with email + password.',
  }
}

// ─── Backup email (OAuth accounts) ────────────────────────────────────────
// Google/etc users can't change their primary email here (it's tied to their
// OAuth account). Instead they can register a backup email we'll use if they
// ever lose access to their OAuth provider. Stored in user_metadata.

const BackupEmailSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.').or(z.literal('')),
})

export async function updateBackupEmail(_prev: Result | null, formData: FormData): Promise<Result> {
  const parsed = BackupEmailSchema.safeParse({ email: formData.get('email') ?? '' })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid email.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const trimmed = parsed.data.email.trim().toLowerCase()
  if (trimmed && user.email && trimmed === user.email.toLowerCase()) {
    return { ok: false, error: 'Backup email must be different from your primary email.' }
  }

  const { error } = await supabase.auth.updateUser({
    data: {
      ...(user.user_metadata ?? {}),
      backup_email: trimmed || null,
    },
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/account')
  return {
    ok: true,
    message: trimmed ? `Backup email set to ${trimmed}.` : 'Backup email cleared.',
  }
}

// ─── Marketing email opt-in ───────────────────────────────────────────────
// Stored in user_metadata. Default is opted-IN (treat missing/true as on);
// only an explicit false counts as opted out. No DB migration needed.

const MarketingSchema = z.object({
  optIn: z.coerce.boolean(),
})

export async function updateMarketingOptIn(input: z.infer<typeof MarketingSchema>): Promise<Result> {
  const parsed = MarketingSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid input.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const { error } = await supabase.auth.updateUser({
    data: {
      ...(user.user_metadata ?? {}),
      marketing_opt_in: parsed.data.optIn,
    },
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/account')
  return { ok: true }
}
