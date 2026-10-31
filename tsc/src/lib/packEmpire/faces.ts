// Photos uploaded from the complete binder. SERVER ONLY.
//
// The pool's images are baked into season-pool.json, and a stored lineup keeps
// whatever its cards held the day it was saved. So an upload doesn't touch
// either: it's a row saying "draw this for that card", read once by the Pack
// Empire layout and applied where a card is drawn (see faces.tsx). That's what
// lets a photo go live without a deploy, and reach lineups already saved.
// A deal never reads this, so a photo can't change anything about a run.
//
// See 0089_pack_empire_daily_binder_faces.sql.

import { revalidateTag, unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { versionsOf } from './pool'
import { personOf, type Player } from './rules'

const TAG = 'pe-faces'
const BUCKET = 'pack-empire-faces'

/** Card id to photo URL. */
export type FaceMap = Record<string, string | undefined>

const TYPES: Record<string, string> = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' }

/** Matches the bucket's file_size_limit. */
const MAX_BYTES = 4 * 1024 * 1024

export const loadFaces = unstable_cache(
  async (): Promise<FaceMap> => {
    const { data, error } = await createAdminClient().from('pe_card_faces').select('card_id, img')
    if (error) return {}
    return Object.fromEntries(((data ?? []) as { card_id: string; img: string }[]).map((r) => [r.card_id, r.img]))
  },
  ['pe-faces'],
  { tags: [TAG], revalidate: 300 }
)

/** A photo nothing points at any more comes out of the bucket. */
async function dropUnused(paths: string[]) {
  const db = createAdminClient()
  for (const path of new Set(paths)) {
    const { count } = await db.from('pe_card_faces').select('card_id', { count: 'exact', head: true }).eq('path', path)
    if (!count) await db.storage.from(BUCKET).remove([path])
  }
}

export type FaceResult = { ok: true; img: string | null; ids: string[] } | { ok: false; error: string }

/**
 * Put a photo on a card, and on any of the man's other cards with no photo at
 * all: a man missing a face is missing it on every card. His other cards that
 * do have one keep it, so a season-specific photo stays that season's.
 */
export async function saveFace(card: Player, file: File, userId: string): Promise<FaceResult> {
  const ext = TYPES[file.type]
  if (!ext) return { ok: false, error: 'Use a JPG, PNG or WebP.' }
  if (file.size === 0 || file.size > MAX_BYTES) return { ok: false, error: 'That image is too big.' }

  const db = createAdminClient()
  const versions = versionsOf(personOf(card))
  const { data: existing, error: readError } = await db
    .from('pe_card_faces')
    .select('card_id, path')
    .in(
      'card_id',
      versions.map((c) => c.id)
    )
  if (readError) return { ok: false, error: 'Could not read his photos.' }
  const rows = (existing ?? []) as { card_id: string; path: string }[]
  const taken = new Set(rows.map((r) => r.card_id))
  const ids = [card.id, ...versions.filter((c) => c.id !== card.id && !c.img && !taken.has(c.id)).map((c) => c.id)]

  const path = `${card.id}-${Date.now()}.${ext}`
  const upload = await db.storage.from(BUCKET).upload(path, file, { contentType: file.type, cacheControl: '31536000' })
  if (upload.error) return { ok: false, error: 'The upload failed.' }
  const img = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl

  const now = new Date().toISOString()
  const { error } = await db
    .from('pe_card_faces')
    .upsert(ids.map((card_id) => ({ card_id, img, path, updated_by: userId, updated_at: now })))
  if (error) {
    await db.storage.from(BUCKET).remove([path])
    return { ok: false, error: 'The photo uploaded but did not save.' }
  }

  await dropUnused(rows.filter((r) => r.card_id === card.id).map((r) => r.path))
  revalidateTag(TAG, { expire: 0 })
  return { ok: true, img, ids }
}

/** Take an upload off, from every card it went on. */
export async function clearFace(cardId: string): Promise<FaceResult> {
  const db = createAdminClient()
  const { data } = await db.from('pe_card_faces').select('path').eq('card_id', cardId).maybeSingle()
  const path = (data as { path: string } | null)?.path
  if (!path) return { ok: true, img: null, ids: [] }

  const { data: gone, error } = await db.from('pe_card_faces').delete().eq('path', path).select('card_id')
  if (error) return { ok: false, error: 'Could not remove that photo.' }
  await dropUnused([path])
  revalidateTag(TAG, { expire: 0 })
  return { ok: true, img: null, ids: ((gone ?? []) as { card_id: string }[]).map((r) => r.card_id) }
}
