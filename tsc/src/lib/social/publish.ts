// Sends whatever is due. Called hourly through the day by the cron, and for a
// single post by "Send now" on /admin/social.
//
// Rules:
//   - Nothing leaves unless SOCIAL_LIVE=1. Until then a run fills posts that
//     need filling (so the admin page shows the real copy) and reports what
//     it would have sent.
//   - A post more than a day late is expired, not sent. A Tuesday regret
//     post going out on Thursday after an outage is worse than none, and it
//     stops a backlog flooding both accounts the moment posting is switched on.
//     The text-only extras get six hours (TIMELY_KINDS): a "most added" list
//     or an evening question is stale by the next morning.
//   - Each platform is sent at most once per post. If X succeeds and Threads
//     fails, the post goes back in the queue and the next run retries Threads
//     alone. Three attempts, then it stops and says so on the admin page.

import { createAdminClient } from '@/lib/supabase/admin'
import { absoluteUrl, socialLive, textProblem, threadsSeeded, xConfigured, type Platform } from './config'
import { buildOnTheDay, TIMELY_KINDS } from './extras'
import { postToX } from './x'
import { postToThreads } from './threads'

type Db = ReturnType<typeof createAdminClient>

export type PostRow = {
  id: string
  plan_key: string | null
  kind: string
  scheduled_at: string
  status: string
  x_text: string | null
  threads_text: string | null
  image_path: string | null
  link: string | null
  params: Record<string, unknown>
  card: unknown
  x_post_id: string | null
  threads_post_id: string | null
  x_error: string | null
  threads_error: string | null
  attempts: number
  sent_at: string | null
}

export type PublishResult = { id: string; plan_key: string | null; outcome: string; detail?: string }

const LATE_MS = 24 * 60 * 60 * 1000
const TIMELY_LATE_MS = 6 * 60 * 60 * 1000
const MAX_ATTEMPTS = 3
const COLS = 'id, plan_key, kind, scheduled_at, status, x_text, threads_text, image_path, link, params, card, x_post_id, threads_post_id, x_error, threads_error, attempts, sent_at'

async function threadsReady(db: Db): Promise<boolean> {
  if (threadsSeeded()) return true
  const { data } = await db.from('social_tokens').select('platform').eq('platform', 'threads').maybeSingle()
  return !!data
}

export async function enabledPlatforms(db: Db): Promise<Platform[]> {
  const out: Platform[] = []
  if (xConfigured()) out.push('x')
  if (await threadsReady(db)) out.push('threads')
  return out
}

async function touch(db: Db, id: string, patch: Record<string, unknown>) {
  await db.from('social_posts').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
}

/** Writes the copy for a post that could only be built on the day. */
async function fill(db: Db, row: PostRow): Promise<PostRow | { expired: string }> {
  if (row.x_text && row.threads_text) return row
  const made = await buildOnTheDay(row.kind, row.params)
  if ('skip' in made) return { expired: made.skip }
  const built = made.built
  const patch = { x_text: built.x_text, threads_text: built.threads_text, link: built.link, card: built.card }
  await touch(db, row.id, patch)
  return { ...row, ...patch }
}

async function sendRow(db: Db, row: PostRow, platforms: Platform[]): Promise<PublishResult> {
  const base = { id: row.id, plan_key: row.plan_key }
  for (const p of platforms) {
    const bad = textProblem(p, p === 'x' ? row.x_text : row.threads_text)
    if (bad) {
      await touch(db, row.id, { status: 'failed', [`${p}_error`]: `copy ${bad}` })
      return { ...base, outcome: 'failed', detail: `${p} copy ${bad}` }
    }
  }

  // Claim it, so an overlapping run can't send the same post twice.
  const { data: claimed } = await db.from('social_posts')
    .update({ status: 'sending', updated_at: new Date().toISOString() })
    .eq('id', row.id).eq('status', 'queued').select('id')
  if (!claimed?.length) return { ...base, outcome: 'skipped', detail: 'claimed by another run' }

  const image = row.image_path ? absoluteUrl(row.image_path) : null
  const patch: Record<string, unknown> = { attempts: row.attempts + 1 }
  const ids: Record<Platform, string | null> = { x: row.x_post_id, threads: row.threads_post_id }

  for (const p of platforms) {
    if (ids[p]) continue
    try {
      const sent = p === 'x' ? await postToX(row.x_text!, image) : await postToThreads(db, row.threads_text!, image)
      ids[p] = sent.id
      patch[`${p}_post_id`] = sent.id
      patch[`${p}_error`] = null
    } catch (e) {
      patch[`${p}_error`] = (e as Error).message.slice(0, 500)
    }
  }

  const done = platforms.every((p) => ids[p])
  const any = platforms.some((p) => ids[p])
  const outOfTries = row.attempts + 1 >= MAX_ATTEMPTS
  patch.status = done ? 'sent' : outOfTries ? (any ? 'partial' : 'failed') : 'queued'
  if (any && !row.sent_at) patch.sent_at = new Date().toISOString()
  await touch(db, row.id, patch)

  const errors = platforms.filter((p) => !ids[p]).map((p) => `${p}: ${patch[`${p}_error`]}`)
  return { ...base, outcome: patch.status as string, detail: errors.join(' | ') || undefined }
}

export async function publishDue(db: Db): Promise<{ live: boolean; platforms: Platform[]; results: PublishResult[] }> {
  const live = socialLive()
  const platforms = await enabledPlatforms(db)
  const { data } = await db.from('social_posts').select(COLS)
    .eq('status', 'queued').lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true }).limit(5)

  const results: PublishResult[] = []
  for (const raw of (data ?? []) as PostRow[]) {
    const base = { id: raw.id, plan_key: raw.plan_key }
    // Late only counts against a post nothing has gone out for yet. One that
    // reached X and is retrying Threads should finish the job.
    const lateMs = TIMELY_KINDS.has(raw.kind) ? TIMELY_LATE_MS : LATE_MS
    if (!raw.x_post_id && !raw.threads_post_id && Date.now() - Date.parse(raw.scheduled_at) > lateMs) {
      await touch(db, raw.id, { status: 'expired' })
      results.push({ ...base, outcome: 'expired', detail: lateMs === LATE_MS ? 'more than a day late' : 'more than six hours late' })
      continue
    }
    try {
      const row = await fill(db, raw)
      if ('expired' in row) {
        await touch(db, raw.id, { status: 'expired', x_error: row.expired })
        results.push({ ...base, outcome: 'expired', detail: row.expired })
        continue
      }
      if (!live) { results.push({ ...base, outcome: 'would send', detail: `SOCIAL_LIVE is off. ${row.x_text?.split('\n')[0]}` }); continue }
      if (!platforms.length) { results.push({ ...base, outcome: 'held', detail: 'no platform has credentials' }); continue }
      results.push(await sendRow(db, row, platforms))
    } catch (e) {
      results.push({ ...base, outcome: 'error', detail: (e as Error).message.slice(0, 300) })
    }
  }
  return { live, platforms, results }
}

/** "Send now" from the admin page: this post, ignoring its scheduled time. */
export async function publishOne(db: Db, id: string): Promise<PublishResult> {
  const { data } = await db.from('social_posts').select(COLS).eq('id', id).maybeSingle()
  if (!data) return { id, plan_key: null, outcome: 'error', detail: 'no such post' }
  const raw = data as PostRow
  if (raw.status !== 'queued') return { id, plan_key: raw.plan_key, outcome: 'error', detail: `post is ${raw.status}` }
  if (!socialLive()) return { id, plan_key: raw.plan_key, outcome: 'error', detail: 'SOCIAL_LIVE is off' }
  const platforms = await enabledPlatforms(db)
  if (!platforms.length) return { id, plan_key: raw.plan_key, outcome: 'error', detail: 'no platform has credentials' }
  const row = await fill(db, raw)
  if ('expired' in row) return { id, plan_key: raw.plan_key, outcome: 'error', detail: row.expired }
  return sendRow(db, row, platforms)
}
