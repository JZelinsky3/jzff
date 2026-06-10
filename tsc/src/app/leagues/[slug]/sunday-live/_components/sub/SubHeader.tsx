// Reused chrome for the three sub-pages — small kicker + page title + back link.

import Link from 'next/link'

export function SubHeader({
  slug,
  kicker,
  title,
  description,
}: {
  slug: string
  kicker: string
  title: string
  description?: string
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-sl-edge-soft pb-4">
      <div>
        <div className="sl-ff-mono mb-1 text-[0.58rem] uppercase tracking-[0.28em] text-sl-ember">
          {kicker}
        </div>
        <h1 className="sl-ff-serif text-3xl italic leading-tight text-sl-cream">{title}</h1>
        {description && (
          <p className="mt-1 max-w-xl text-xs italic text-sl-mute">{description}</p>
        )}
      </div>
      <Link
        href={`/leagues/${slug}/sunday-live/`}
        className="sl-ff-mono text-[0.6rem] uppercase tracking-[0.22em] text-sl-mute hover:text-sl-ember"
      >
        ← Back to broadcast
      </Link>
    </div>
  )
}
