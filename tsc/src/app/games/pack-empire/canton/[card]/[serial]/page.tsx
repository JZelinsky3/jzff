// /games/pack-empire/canton/[card]/[serial]
//
// One numbered Canton on show: the card standing in its case, lit from above, on
// a plinth with its number engraved, and beside it what it is, who pulled it,
// when, and the other numbers of it they hold. Public, so a shared link opens for
// anyone; the owner gets the share button, everyone else the way to pull their own.

import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { cantonPath, cantonShowcase } from '@/lib/packEmpire/cantonCase'
import { peMeta } from '@/lib/packEmpire/meta'
import { CANTON_CARDS, POOL_LABEL } from '@/lib/packEmpire/rules'
import mobileStyles from '../../../../mobile.module.css'
import { PackCard } from '../../../cards'
import { PeChrome, PeDock } from '../../../chrome'
import { peFonts } from '../../../fonts'
import { ShareButton } from '../../../share'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#141311', width: 'device-width', initialScale: 1 }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function longDay(iso: string): string {
  const d = new Date(iso)
  const n = d.getUTCDate()
  const v = n % 100
  const suffix = v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${MONTHS[d.getUTCMonth()]} ${n}${suffix}, ${d.getUTCFullYear()}`
}

function ordinal(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}

type Params = { card: string; serial: string }

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { card, serial } = await params
  const show = await cantonShowcase(card, Number(serial), null)
  if (!show) return peMeta({ title: 'Canton · Pack Empire', card: { c: 'binder' }, alt: 'A Canton', robots: { index: false, follow: true } })
  const who = show.owner?.name
  return peMeta({
    title: `${who ? `${who}'s Canton` : 'A Canton'}: ${show.card.name} ${show.card.year ?? ''} · Pack Empire`,
    description: `No. ${show.serial} of ${show.total} ever pulled. One of ${CANTON_CARDS} Canton cards in Pack Empire.`,
    card: { c: 'ct', id: show.card.id, n: show.serial, t: show.total },
    alt: `${show.card.name}, Canton No. ${show.serial}`,
    url: cantonPath(show.card.id, show.serial),
    robots: { index: false, follow: true },
  })
}

export default async function CantonPage({ params }: { params: Promise<Params> }) {
  const { card, serial } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const show = await cantonShowcase(card, Number(serial), user?.id ?? null)
  if (!show) notFound()
  const mobile = (await getViewMode()) === 'mobile'
  const p = show.card
  const mine = !!show.owner?.you
  const owner = show.owner?.name ?? 'A collector'

  return (
    <main className={`pe-theme ${peFonts} ${mobile ? mobileStyles.root : ''}`.trim()}>
      <PeChrome
        active="binder"
        mobile={mobile}
        signedIn={!!user}
        back={mine ? '/games/pack-empire/binder/' : '/games/pack-empire/'}
        backLabel={mine ? 'Your binder' : 'Pack Empire'}
        kicker="Canton"
        title={p.name}
      />

      <div className="pe-wrap">
        <section className="pe-tc" aria-label={`${p.name} ${p.year}, Canton No. ${show.serial}`}>
          <div className="pe-tc-stage">
            <span className="pe-tc-beam" aria-hidden />
            <div className="pe-tc-case">
              <span className="pe-tc-bracket tl" aria-hidden />
              <span className="pe-tc-bracket tr" aria-hidden />
              <span className="pe-tc-bracket bl" aria-hidden />
              <span className="pe-tc-bracket br" aria-hidden />
              <div className="pe-tc-card">
                <PackCard player={p} revealed serial={[show.serial, show.total]} />
              </div>
              <span className="pe-tc-glass" aria-hidden />
            </div>
            <div className="pe-tc-plinth" aria-hidden>
              <span />
            </div>
            <div className="pe-tc-plate">
              <span className="pe-tc-plate-k">Pack Empire · Canton</span>
              <b>{p.name}</b>
              <span>
                {p.year} {p.club ?? p.team}
              </span>
              <span className="pe-tc-plate-no">
                No. {show.serial} of {show.total}
              </span>
            </div>
          </div>

          <div className="pe-tc-info">
            <div className="pe-kicker">
              Canton · No. {show.serial} of {show.total}
            </div>
            <h1 className="pe-tc-name">{p.name}</h1>
            <p className="pe-tc-club">
              {p.year} {p.club ?? p.team} · {POOL_LABEL[p.pos]}
            </p>
            <div className="pe-tc-score">
              <b>{p.score.toLocaleString()}</b>
              <small>Accolades</small>
            </div>
            {p.accolades.length > 0 && (
              <ul className="pe-tc-acc">
                {p.accolades.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}

            <dl className="pe-tc-facts">
              <div>
                <dt>Pulled by</dt>
                <dd>{mine ? `${owner} (you)` : owner}</dd>
              </div>
              <div>
                <dt>On</dt>
                <dd>{longDay(show.pulledAt)}</dd>
              </div>
              <div>
                <dt>Number</dt>
                <dd>
                  {show.serial === 1 ? 'The first ever pulled' : `The ${ordinal(show.serial)} ever pulled`}, of {show.total}
                </dd>
              </div>
              {show.copies.length > 1 && (
                <div>
                  <dt>{mine ? 'You hold' : 'They hold'}</dt>
                  <dd>{show.copies.map((n) => `No. ${n}`).join(' · ')}</dd>
                </div>
              )}
              <div>
                <dt>Cantons</dt>
                <dd>
                  {CANTON_CARDS} in the game{show.others.length ? `, ${show.others.length + 1} of them ${mine ? 'yours' : 'theirs'}` : ''}
                </dd>
              </div>
            </dl>

            <div className="pe-tc-acts">
              {mine ? (
                <>
                  <ShareButton
                    path={cantonPath(p.id, show.serial)}
                    title={`${p.name} ${p.year} · Canton`}
                    text={`My Canton: ${p.name} ${p.year}, No. ${show.serial} of ${show.total}`}
                  />
                  <Link href="/games/pack-empire/binder/" className="pe-act">
                    Back to your binder
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/games/pack-empire/builder/" className="pe-push">
                    Pull your own Canton
                  </Link>
                  <Link href="/games/pack-empire/" className="pe-act">
                    Play Pack Empire
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>

        {show.others.length > 0 && (
          <section className="pe-sec">
            <div className="pe-sec-head">
              <span className="pe-sec-num">§ The Hall</span>
              <span className="pe-sec-title">{mine ? 'Your Other Cantons' : `${owner}'s Other Cantons`}</span>
              <span className="pe-sec-meta">{show.others.length}</span>
            </div>
            <div className="pe-tc-others">
              {show.others.map((o) => (
                <Link key={o.card.id} href={cantonPath(o.card.id, o.serial)} className="pe-tc-other">
                  <b>{o.card.name}</b>
                  <span>
                    {o.card.year} · No. {o.serial}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>

      {mobile ? <PeDock signedIn={!!user} /> : <SiteFooter />}
    </main>
  )
}
