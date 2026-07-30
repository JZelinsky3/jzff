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
// The hero is the chapter's own OG card, which means these pages inherit
// every card design change for free.

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { findSharePage, SHARE_PAGES } from '@/lib/sharePages'

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

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: `linear-gradient(165deg, ${t.bg} 0%, ${t.bg2} 100%)`,
        color: t.ink,
        padding: '0 20px 64px',
      }}
    >
      {/* The chapter's accent as a sash, the way the cards carry it. */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 6, background: t.accent, zIndex: 2 }} />

      <div style={{ width: '100%', maxWidth: 880, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <p
          style={{
            margin: '72px 0 0',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.34em',
            textTransform: 'uppercase',
            color: t.accent,
            textAlign: 'center',
          }}
        >
          The Sunday Chronicle
        </p>

        <h1
          style={{
            margin: '18px 0 0',
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: 'clamp(38px, 7vw, 68px)',
            lineHeight: 1.05,
            fontWeight: 400,
            textAlign: 'center',
          }}
        >
          {page.title}
        </h1>

        <div style={{ width: 96, height: 2, background: t.accent, opacity: 0.6, margin: '24px 0 0' }} />

        <p
          style={{
            margin: '24px 0 0',
            maxWidth: 560,
            textAlign: 'center',
            fontSize: 'clamp(16px, 2.4vw, 19px)',
            lineHeight: 1.5,
            color: t.mute,
          }}
        >
          {page.deck}
        </p>

        {/* Hero: the chapter's own share card. */}
        <div
          style={{
            width: '100%',
            margin: '40px 0 0',
            borderRadius: 10,
            overflow: 'hidden',
            border: `1px solid ${t.accent}44`,
            boxShadow: '0 30px 70px rgba(0,0,0,0.45)',
            lineHeight: 0,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={page.og}
            alt={`${page.title} preview`}
            width={1200}
            height={630}
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
        </div>

        <p
          style={{
            margin: '18px 0 0',
            fontSize: 12,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: t.mute,
            textAlign: 'center',
          }}
        >
          A real league&rsquo;s page, built from its own history
        </p>

        {/* The two ways out. */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 14,
            justifyContent: 'center',
            margin: '40px 0 0',
          }}
        >
          <Link
            href="/login?mode=signup"
            style={{
              display: 'inline-block',
              padding: '15px 30px',
              borderRadius: 6,
              background: t.accent,
              color: t.onAccent,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              textDecoration: 'none',
            }}
          >
            Start your chronicle
          </Link>
          <Link
            href={page.demo}
            style={{
              display: 'inline-block',
              padding: '15px 30px',
              borderRadius: 6,
              border: `1px solid ${t.accent}77`,
              color: t.ink,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              textDecoration: 'none',
            }}
          >
            View in the demo
          </Link>
        </div>

        <p style={{ margin: '26px 0 0', fontSize: 13, color: t.mute, textAlign: 'center' }}>
          Free to start. One league free forever. Sleeper, ESPN, NFL.com and Yahoo.
        </p>

        {/* The rest of the book. */}
        <div style={{ width: '100%', margin: '56px 0 0' }}>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              color: t.mute,
              textAlign: 'center',
            }}
          >
            Also in the book
          </p>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              justifyContent: 'center',
              margin: '18px 0 0',
            }}
          >
            {SHARE_PAGES.filter((p) => p.key !== page.key).map((p) => (
              <Link
                key={p.key}
                href={`/see/${p.key}`}
                style={{
                  padding: '8px 14px',
                  borderRadius: 999,
                  border: `1px solid ${t.accent}33`,
                  color: t.mute,
                  fontSize: 12,
                  letterSpacing: '0.08em',
                  textDecoration: 'none',
                }}
              >
                {p.title}
              </Link>
            ))}
          </div>
        </div>

        <p style={{ margin: '48px 0 0', fontSize: 12, color: t.mute, textAlign: 'center' }}>
          <Link href="/" style={{ color: t.accent, textDecoration: 'none' }}>
            thesundaychronicle.app
          </Link>
        </p>
      </div>
    </main>
  )
}
