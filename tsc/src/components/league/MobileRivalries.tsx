import Link from 'next/link'
import { deleteRivalry } from '@/app/league/[slug]/rivalries/actions'

type Rivalry = {
  id: string
  name: string
  manager_a_id: string
  manager_b_id: string
}

export function MobileRivalries({
  slug,
  rivalries,
  nameOf,
}: {
  slug: string
  rivalries: Rivalry[]
  nameOf: Map<string, string>
}) {
  async function remove(formData: FormData) {
    'use server'
    const id = formData.get('id') as string
    await deleteRivalry(id, slug)
  }

  return (
    <div className="mriv">
      <div className="mriv-head">
        <div className="mriv-head-left">
          <span className="mriv-title">Rivalries</span>
          <span className="mriv-count">{rivalries.length}</span>
        </div>
        <Link href={`/league/${slug}/rivalries/new`} className="mriv-add-btn">
          + New
        </Link>
      </div>

      {rivalries.length === 0 ? (
        <div className="mriv-empty">
          <div className="mriv-empty-title">No rivalries yet</div>
          <div className="mriv-empty-desc">Pair two managers and immortalize the grudge.</div>
          <Link href={`/league/${slug}/rivalries/new`} className="dc-btn" style={{ marginTop: '.75rem' }}>
            + Forge a rivalry
          </Link>
        </div>
      ) : (
        <div className="mriv-list">
          {rivalries.map((r, i) => (
            <div key={r.id} className="mriv-card">
              <div className="mriv-card-num">{i + 1}</div>
              <div className="mriv-card-body">
                <div className="mriv-card-name">{r.name}</div>
                <div className="mriv-card-vs">
                  {nameOf.get(r.manager_a_id) ?? '---'} vs {nameOf.get(r.manager_b_id) ?? '---'}
                </div>
              </div>
              <form action={remove}>
                <input type="hidden" name="id" value={r.id} />
                <button type="submit" className="mriv-card-del">Delete</button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
