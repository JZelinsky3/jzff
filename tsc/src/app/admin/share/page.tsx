// Private index of the share links. Admin-only, same gate as /admin.
//
// The pages it lists (/see/<key>) are public on purpose, since the people
// Joey sends them to have no account. This page is just the shelf he picks
// from: each row previews the card and gives him the link to copy.

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isSiteAdmin } from '@/lib/siteAdmin'
import { SHARE_PAGES, type SharePage } from '@/lib/sharePages'
import { CopyLinkButton } from './copy'

export const metadata = {
  title: 'Share links · The Sunday Chronicle',
  robots: { index: false, follow: false },
}

export default async function ShareHub() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!(await isSiteAdmin(user.id))) notFound()

  const groups: Array<SharePage['group']> = ['The almanac', 'The live season']

  return (
    <main style={{ minHeight: '100dvh', background: '#0e1620', color: '#f4ebd8', padding: '48px 24px 80px' }}>
      <div style={{ maxWidth: 1040, margin: '0 auto' }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.32em', textTransform: 'uppercase', color: '#e8c889' }}>
          The Sunday Chronicle
        </p>
        <h1 style={{ margin: '12px 0 0', fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: 42 }}>
          Share links
        </h1>
        <p style={{ margin: '12px 0 0', maxWidth: 640, color: '#9fb0c4', fontSize: 15, lineHeight: 1.55 }}>
          One themed landing page per chapter. Send any of these to someone outside your league and they
          land on a page in that chapter&rsquo;s own colours, with the card as the hero and two ways out:
          start their own, or read the demo. These links need no account. This index does.
        </p>

        {groups.map((g) => (
          <section key={g} style={{ margin: '44px 0 0' }}>
            <h2
              style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.3em',
                textTransform: 'uppercase',
                color: '#e8c889',
              }}
            >
              {g}
            </h2>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: 20,
                margin: '18px 0 0',
              }}
            >
              {SHARE_PAGES.filter((p) => p.group === g).map((p) => (
                <article
                  key={p.key}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    background: '#16202c',
                    border: '1px solid #24303f',
                    borderRadius: 10,
                    overflow: 'hidden',
                  }}
                >
                  <Link href={`/see/${p.key}`} style={{ display: 'block', lineHeight: 0 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.og} alt="" width={1200} height={630} style={{ width: '100%', height: 'auto' }} />
                  </Link>
                  <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                    <strong style={{ fontFamily: 'Georgia, serif', fontSize: 18, fontWeight: 400 }}>{p.title}</strong>
                    <span style={{ fontSize: 13, color: '#9fb0c4', lineHeight: 1.45 }}>{p.deck}</span>
                    <code style={{ fontSize: 12, color: '#8fa3c0', wordBreak: 'break-all' }}>/see/{p.key}</code>
                    <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 6, flexWrap: 'wrap' }}>
                      <CopyLinkButton path={`/see/${p.key}`} />
                      <Link
                        href={`/see/${p.key}`}
                        style={{
                          padding: '7px 12px',
                          border: '1px solid #24303f',
                          borderRadius: 6,
                          color: '#9fb0c4',
                          fontSize: 11,
                          letterSpacing: '0.12em',
                          textTransform: 'uppercase',
                          textDecoration: 'none',
                        }}
                      >
                        Open
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}

        <p style={{ margin: '48px 0 0' }}>
          <Link href="/admin" style={{ color: '#e8c889', fontSize: 13 }}>
            Back to admin
          </Link>
        </p>
      </div>
    </main>
  )
}
