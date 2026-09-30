// Turning recap emails off and back on for one address.
//
// Suppressions are keyed by address because bounces, complaints and Resend's
// own unsubscribe export all arrive as addresses. Only an unsubscribe (or an
// imported one) can be undone by the person; a bounce or a spam complaint
// stays until someone removes it by hand.

import { createAdminClient } from '@/lib/supabase/admin'

export type SuppressionReason = 'unsubscribe' | 'bounce' | 'complaint' | 'imported'

export async function suppressEmail(email: string, reason: SuppressionReason): Promise<void> {
  const db = createAdminClient()
  // ignoreDuplicates keeps a stronger existing reason (a complaint) from
  // being overwritten by a later unsubscribe click.
  await db
    .from('email_suppressions')
    .upsert({ email: email.toLowerCase(), reason }, { onConflict: 'email', ignoreDuplicates: true })
}

export async function unsuppressEmail(email: string): Promise<void> {
  const db = createAdminClient()
  await db
    .from('email_suppressions')
    .delete()
    .eq('email', email.toLowerCase())
    .in('reason', ['unsubscribe', 'imported'])
}

export async function suppressionFor(email: string): Promise<SuppressionReason | null> {
  const db = createAdminClient()
  const { data } = await db.from('email_suppressions').select('reason').eq('email', email.toLowerCase()).maybeSingle()
  return (data?.reason as SuppressionReason | undefined) ?? null
}

export async function userEmail(userId: string): Promise<{ email: string; productEmailOff: boolean } | null> {
  const db = createAdminClient()
  const { data } = await db.auth.admin.getUserById(userId)
  const user = data?.user
  if (!user?.email) return null
  return { email: user.email.toLowerCase(), productEmailOff: user.user_metadata?.marketing_opt_in === false }
}
