'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSiteAdmin } from '@/lib/siteAdmin'
import { textProblem } from '@/lib/social/config'
import { planWeek, type PlanResult } from '@/lib/social/plan'
import { publishOne } from '@/lib/social/publish'
import { xWhoAmI } from '@/lib/social/x'
import { threadsWhoAmI } from '@/lib/social/threads'

type Res = { ok: boolean; error?: string }

async function guard(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'Not signed in.'
  if (!(await isSiteAdmin(user.id))) return 'Forbidden.'
  return null
}

/** Veto or un-veto. Only a post that hasn't gone out can change. */
export async function setVetoed(id: string, vetoed: boolean): Promise<Res> {
  const denied = await guard()
  if (denied) return { ok: false, error: denied }
  const db = createAdminClient()
  const { data, error } = await db.from('social_posts')
    .update({ status: vetoed ? 'vetoed' : 'queued', updated_at: new Date().toISOString() })
    .eq('id', id).in('status', vetoed ? ['queued'] : ['vetoed']).select('id')
  if (error) return { ok: false, error: error.message }
  if (!data?.length) return { ok: false, error: 'That post has already gone out or changed.' }
  revalidatePath('/admin/social')
  return { ok: true }
}

export async function saveTexts(id: string, xText: string, threadsText: string): Promise<Res> {
  const denied = await guard()
  if (denied) return { ok: false, error: denied }
  const bad = textProblem('x', xText) ?? textProblem('threads', threadsText)
  if (bad) return { ok: false, error: `Copy is ${bad}.` }
  const db = createAdminClient()
  const now = new Date().toISOString()
  const { data, error } = await db.from('social_posts')
    .update({ x_text: xText, threads_text: threadsText, edited_at: now, updated_at: now })
    .eq('id', id).in('status', ['queued', 'vetoed']).select('id')
  if (error) return { ok: false, error: error.message }
  if (!data?.length) return { ok: false, error: 'That post has already gone out.' }
  revalidatePath('/admin/social')
  return { ok: true }
}

export async function sendNow(id: string): Promise<Res> {
  const denied = await guard()
  if (denied) return { ok: false, error: denied }
  const r = await publishOne(createAdminClient(), id)
  revalidatePath('/admin/social')
  return r.outcome === 'sent' ? { ok: true } : { ok: false, error: `${r.outcome}${r.detail ? `: ${r.detail}` : ''}` }
}

export async function planNext(): Promise<{ ok: boolean; error?: string; results?: PlanResult[] }> {
  const denied = await guard()
  if (denied) return { ok: false, error: denied }
  try {
    const { results } = await planWeek(createAdminClient())
    revalidatePath('/admin/social')
    return { ok: true, results }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** Reads each account back, to prove the keys work without posting anything. */
export async function checkConnections(): Promise<{ ok: boolean; error?: string; x?: string; threads?: string }> {
  const denied = await guard()
  if (denied) return { ok: false, error: denied }
  const [x, threads] = await Promise.all([xWhoAmI(), threadsWhoAmI(createAdminClient())])
  return {
    ok: true,
    x: x.ok ? `@${x.username}` : x.error,
    threads: threads.ok ? `@${threads.username}` : threads.error,
  }
}
