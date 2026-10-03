// The Saturday email: next week's posts, so Joey can veto any of them
// without opening the admin page unless he wants to. Silence means they go.
//
// The vetoes themselves happen on /admin/social, behind the admin sign-in.
// A one-click veto link in the email would be fired by the link scanners
// mail providers run on every URL, vetoing posts nobody chose to veto.

import { createAdminClient } from '@/lib/supabase/admin'
import { SITE_URL } from '@/lib/recap/links'
import { sendViaResend } from '@/lib/recap/resend'
import { absoluteUrl, addDays, fmtEastern, socialLive } from './config'
import { KIND_LABELS, type Kind } from './content'

type Db = ReturnType<typeof createAdminClient>

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export async function sendDigest(db: Db, monday: string): Promise<string[]> {
  const from = new Date(`${monday}T00:00:00-05:00`).toISOString()
  const to = new Date(`${addDays(monday, 7)}T06:00:00-05:00`).toISOString()
  const { data } = await db.from('social_posts')
    .select('id, kind, scheduled_at, status, x_text, image_path')
    .gte('scheduled_at', from).lt('scheduled_at', to)
    .order('scheduled_at', { ascending: true })
  const posts = data ?? []

  const { data: adminRows } = await db.from('site_admins').select('user_id')
  const emails: string[] = []
  for (const a of adminRows ?? []) {
    const { data: u } = await db.auth.admin.getUserById(a.user_id as string)
    if (u?.user?.email && u.user.email_confirmed_at) emails.push(u.user.email)
  }
  if (!emails.length) return ['no admin with a confirmed email']

  const adminUrl = `${SITE_URL}/admin/social/`
  const live = socialLive()
  const rows = posts.map((p) => {
    const label = KIND_LABELS[p.kind as Kind] ?? p.kind
    const copy = p.x_text ? esc(p.x_text).replace(/\n/g, '<br>') : '<em>Written on the day from that week&#39;s scores.</em>'
    const img = p.image_path && p.x_text
      ? `<img src="${esc(absoluteUrl(p.image_path))}" width="240" style="display:block;width:240px;max-width:100%;border:1px solid #d9cdb2;margin:8px 0 0">`
      : ''
    return `<tr><td style="padding:18px 0;border-top:1px solid #d9cdb2">
      <div style="font:700 11px/1.4 monospace;letter-spacing:.12em;text-transform:uppercase;color:#a3271d">${esc(fmtEastern(p.scheduled_at))} &middot; ${esc(label)}${p.status === 'vetoed' ? ' &middot; VETOED' : ''}</div>
      <div style="font:15px/1.5 Georgia,serif;color:#16130f;margin-top:6px">${copy}</div>${img}
    </td></tr>`
  }).join('')

  const html = `<div style="background:#f4ebd8;padding:28px 18px"><table role="presentation" width="100%" style="max-width:560px;margin:0 auto;border-collapse:collapse">
    <tr><td style="font:28px/1.1 Georgia,serif;color:#16130f;padding-bottom:6px">Next week on X and Threads</td></tr>
    <tr><td style="font:14px/1.5 Georgia,serif;color:#55482e;padding-bottom:14px">${posts.length} post${posts.length === 1 ? '' : 's'} queued. They go out on their own. To stop or edit one, open <a href="${adminUrl}" style="color:#a3271d">the social queue</a>.${live ? '' : ' Posting is switched OFF (SOCIAL_LIVE), so nothing will actually send.'}</td></tr>
    ${rows || '<tr><td style="font:15px Georgia,serif;color:#55482e">Nothing planned. Check the plan run on the admin page.</td></tr>'}
  </table></div>`
  const text = `Next week on X and Threads: ${posts.length} posts queued. Review or veto: ${adminUrl}\n\n` +
    posts.map((p) => `${fmtEastern(p.scheduled_at)} | ${KIND_LABELS[p.kind as Kind] ?? p.kind}\n${p.x_text ?? '(written on the day)'}`).join('\n\n')

  const out: string[] = []
  for (const to of emails) {
    const r = await sendViaResend({
      to, subject: `Social queue: week of ${monday}`, html, text,
      unsubToken: null, idempotencyKey: `social-digest-${monday}-${to}`, category: 'social-digest',
    })
    out.push(r.ok ? `sent to ${to}` : `${to}: ${r.error}`)
  }
  return out
}
