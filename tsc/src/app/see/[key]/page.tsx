// Public, themed landing page for one almanac chapter.
//
// These are the links Joey hands to people outside his league. They are
// deliberately reachable without an account: the whole point is that a
// stranger opens the link cold, sees what that page is, and lands on
// either "start your own" or "read the demo". Only the index that lists
// them (/admin/share) is private.
//
// Each page borrows the palette of the chapter it represents, so a draft
// link opens black cloth and cream and a rivalries link opens oxblood.
// Those colours are handed to see.module.css as CSS variables, which is
// what lets one stylesheet carry media queries for every theme.
//
// The hero is the chapter's own OG card, which means these pages inherit
// every card design change for free.

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { findSharePage, SHARE_PAGES } from '@/lib/sharePages'
import { SeeHeader } from './SeeHeader'
import s from './see.module.css'

export const revalidate = 3600

export function generateStaticParams() {
  return SHARE_PAGES.map((p) => ({ key: p.key }))
}

export async function generateMetadata(
  { params }: { params: Promise<{ key: string }> }
): Promise<Metadata> {
  const { key } = await params
  const page = findSharePage(key)
  if (!page) return {}
  return {
    title: page.title,
    description: page.deck,
    openGraph: {
      title: `${page.title} · The Sunday Chronicle`,
      description: page.deck,
      images: [{ url: page.og, width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image' },
  }
}

export default async function SharePage(
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params
  const page = findSharePage(key)
  if (!page) notFound()

  const t = page.theme
  const others = SHARE_PAGES.filter((p) => p.key !== page.key)

  return (
    <div
      className={s.page}
      style={{
        // Consumed by see.module.css.
        ['--bg' as string]: t.bg,
        ['--bg2' as string]: t.bg2,
        ['--ink' as string]: t.ink,
        ['--mute' as string]: t.mute,
        ['--accent' as string]: t.accent,
        ['--onAccent' as string]: t.onAccent,
      }}
    >
      <SeeHeader
        pages={SHARE_PAGES.map((p) => ({ key: p.key, title: p.title }))}
        currentKey={page.key}
        demoHref={page.demo}
      />

      <main className={s.body}>
        {/* No masthead line here: the header carries the wordmark now. */}
        <h1 className={s.title}>{page.title}</h1>
        <div className={s.rule} />
        <p className={s.deck}>{page.deck}</p>

        <div className={s.hero}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={page.og} alt={`${page.title} preview`} width={1200} height={630} />
        </div>

        <p className={s.caption}>Built from a league&rsquo;s own history</p>

        <div className={s.ctas}>
          <Link href="/login?mode=signup" className={s.btnPrimary}>
            Start your chronicle
          </Link>
          <Link href={page.demo} className={s.btnGhost}>
            View in the demo
          </Link>
        </div>

        <p className={s.fine}>
          Free to start. One league free forever. Sleeper, ESPN, NFL.com and Yahoo.
        </p>

        {/* Also in the book, set as a table of contents rather than a stack
            of pills: leader dots and ruled rows are the almanac's own
            furniture, and it collapses to one column on a phone. */}
        <section className={s.tocWrap}>
          <p className={s.tocHead}>Also in the book</p>
          <div className={s.tocRules} />
          <div className={s.tocRulesThin} />
          <nav className={s.toc}>
            {others.map((p) => (
              <Link key={p.key} href={`/see/${p.key}`} className={s.tocRow}>
                <span className={s.tocName}>{p.title}</span>
                <span className={s.tocLeader} aria-hidden="true" />
                <span className={s.tocMark}>View</span>
              </Link>
            ))}
          </nav>
        </section>

        <p className={s.foot}>
          <Link href="/" className={s.footLink}>
            thesundaychronicle.app
          </Link>
        </p>
      </main>
    </div>
  )
}
