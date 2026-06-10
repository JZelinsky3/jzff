import Link from 'next/link'
import { getHubCensus } from '@/lib/hub/data'
import { CountUp, DnaFill, Reveal } from '../bits'

export const metadata = { title: 'The Clubhouse · The Census' }

export default async function CensusPage() {
  const c = await getHubCensus()

  const span =
    c.earliestYear && c.latestYear
      ? c.earliestYear === c.latestYear
        ? String(c.earliestYear)
        : `${c.earliestYear} – ${c.latestYear}`
      : '—'

  return (
    <main>
      <section className="hub-hero">
        <div className="hub-hero-sup">★ Wing III · The counting house ★</div>
        <h1 className="hub-hero-title">
          The <em>Census.</em>
        </h1>
        <p className="hub-hero-sub">
          Every synced league pools into one ledger — no names, no league IDs, just the
          combined weight of all that football. Counted fresh every hour.
        </p>
        <div className="hub-hero-meta">
          <span>Seasons spanning {span}</span>
          <span>·</span>
          <span>{c.seasons.toLocaleString()} league-seasons on file</span>
        </div>
      </section>

      {/* ─── §01 The big board ────────────────────────────── */}
      <div className="hub-section">
        <div className="hub-section-header">
          <span className="hub-section-num">§ 01 · The big board</span>
          <span className="hub-section-title">What the network has put up —</span>
          <span className="hub-section-meta">All platforms combined</span>
        </div>
        <Reveal>
          <div className="hub-stat-grid">
            <div className="hub-stat is-marquee">
              <div className="hub-stat-label">Total fantasy points scored</div>
              <div className="hub-stat-value">
                <CountUp value={Math.round(c.totalPoints)} duration={2400} />
                <span className="unit">pts</span>
              </div>
              <div className="hub-stat-detail">
                Every starter, every week, every season of every league synced to TSC.
              </div>
            </div>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <div className="hub-stat-grid" style={{ marginTop: '1.1rem' }}>
            <div className="hub-stat">
              <div className="hub-stat-label">Games decided</div>
              <div className="hub-stat-value"><CountUp value={c.games} /></div>
              <div className="hub-stat-detail">
                <strong>{c.playoffGames.toLocaleString()}</strong> in the playoffs ·{' '}
                <strong>{c.championshipGames.toLocaleString()}</strong> for a title.
              </div>
            </div>
            <div className="hub-stat">
              <div className="hub-stat-label">Wins banked</div>
              <div className="hub-stat-value"><CountUp value={c.totalWins} /></div>
              <div className="hub-stat-detail">
                Balanced — as wins always are — by {c.totalLosses.toLocaleString()} losses
                {c.totalTies > 0 ? ` and ${c.totalTies.toLocaleString()} ties nobody enjoyed` : ''}.
              </div>
            </div>
            <div className="hub-stat">
              <div className="hub-stat-label">Draft picks made</div>
              <div className="hub-stat-value"><CountUp value={c.draftPicks} /></div>
              <div className="hub-stat-detail">Every card turned in since the earliest draft on file.</div>
            </div>
            <div className="hub-stat">
              <div className="hub-stat-label">Trades executed</div>
              <div className="hub-stat-value"><CountUp value={c.trades} /></div>
              <div className="hub-stat-detail">Handshakes, heists, and a few both sides regret.</div>
            </div>
            <div className="hub-stat">
              <div className="hub-stat-label">Championships decided</div>
              <div className="hub-stat-value"><CountUp value={c.championships} /></div>
              <div className="hub-stat-detail">One ring per league-season; dynasties counted in the Hall.</div>
            </div>
            <div className="hub-stat">
              <div className="hub-stat-label">Managers chronicled</div>
              <div className="hub-stat-value"><CountUp value={c.managers} /></div>
              <div className="hub-stat-detail">Each with a record, a rival, and an opinion about it.</div>
            </div>
            <div className="hub-stat">
              <div className="hub-stat-label">Player-weeks tracked</div>
              <div className="hub-stat-value"><CountUp value={c.playerWeeks} /></div>
              <div className="hub-stat-detail">Every lineup slot we watch for bench regret and Best Coach math.</div>
            </div>
            <div className="hub-stat">
              <div className="hub-stat-label">Seasons archived</div>
              <div className="hub-stat-value"><CountUp value={c.seasons} /></div>
              <div className="hub-stat-detail">Reaching back to <strong>{c.earliestYear ?? '—'}</strong>.</div>
            </div>
          </div>
        </Reveal>
      </div>

      {/* ─── §02 Game character ───────────────────────────── */}
      <div className="hub-section">
        <div className="hub-section-header">
          <span className="hub-section-num">§ 02 · Game character</span>
          <span className="hub-section-title">How the games actually play —</span>
          <span className="hub-section-meta">From final scores only</span>
        </div>
        <Reveal>
          <div className="hub-stat-grid">
            <div className="hub-stat">
              <div className="hub-stat-label">Average game total</div>
              <div className="hub-stat-value">
                {c.avgGameTotal !== null ? <CountUp value={c.avgGameTotal} decimals={1} /> : '—'}
                <span className="unit">pts</span>
              </div>
              <div className="hub-stat-detail">Both teams combined, league average across the network.</div>
            </div>
            <div className="hub-stat">
              <div className="hub-stat-label">Average margin</div>
              <div className="hub-stat-value">
                {c.avgMargin !== null ? <CountUp value={c.avgMargin} decimals={1} /> : '—'}
                <span className="unit">pts</span>
              </div>
              <div className="hub-stat-detail">The typical gap between handshake and heartbreak.</div>
            </div>
            <div className="hub-stat">
              <div className="hub-stat-label">Blowout rate</div>
              <div className="hub-stat-value">
                {c.blowoutPct !== null ? <CountUp value={c.blowoutPct} decimals={1} /> : '—'}
                <span className="unit">%</span>
              </div>
              <div className="hub-stat-detail">Games decided by 40 or more. No mercy rule in fantasy.</div>
            </div>
            <div className="hub-stat">
              <div className="hub-stat-label">Photo finishes</div>
              <div className="hub-stat-value">
                {c.photoFinishPct !== null ? <CountUp value={c.photoFinishPct} decimals={1} /> : '—'}
                <span className="unit">%</span>
              </div>
              <div className="hub-stat-detail">
                Decided by fewer than 3 — the Monday-night stomach aches.
              </div>
            </div>
          </div>
        </Reveal>
      </div>

      {/* ─── §03 Network DNA ──────────────────────────────── */}
      <div className="hub-section">
        <div className="hub-section-header">
          <span className="hub-section-num">§ 03 · Network DNA</span>
          <span className="hub-section-title">One archetype for all of it —</span>
          <span className="hub-section-meta">Same math as Manager DNA</span>
        </div>
        <Reveal>
          <div className="hub-dna">
            <div className="hub-dna-kicker">★ The network reads as ★</div>
            <div className="hub-dna-arch">{c.dna.archetype}</div>
            <p className="hub-dna-blurb">{c.dna.blurb}</p>
            <div className="hub-dna-rows">
              {c.dna.traits.map((t) => (
                <div key={t.key} className="hub-dna-row">
                  <div className="hub-dna-row-label">
                    <div className="lbl">{t.label}</div>
                    <div className="reading">{t.reading}</div>
                  </div>
                  <div className="hub-dna-track">
                    <DnaFill pct={t.pct} />
                  </div>
                  <div className="hub-dna-row-detail">{t.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
        <p
          style={{
            maxWidth: '720px', margin: '1.4rem auto 0', textAlign: 'center',
            fontSize: '.8rem', lineHeight: 1.6, color: 'var(--hb-mute)',
          }}
        >
          Manager DNA distills one manager&apos;s habits into an archetype. The Census runs the
          same idea across every synced league at once — scores, margins, trade volume, and
          archive depth, weighed together. Totals are anonymous; named records live in{' '}
          <Link href="/hub/records" style={{ color: 'var(--hb-gold)' }}>the Hall</Link>.
        </p>
      </div>
    </main>
  )
}
