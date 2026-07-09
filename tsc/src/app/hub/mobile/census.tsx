import Link from 'next/link'
import type { HubCensus } from '@/lib/hub/data'
import { CountUp, DnaFill, Reveal } from '../bits'

// Pocket Clubhouse — the Census. The desktop stat wall becomes one marquee
// counter, a two-across tile ledger, and the Network DNA card stacked for
// one thumb. Same numbers, same hourly count.

export function MobileCensus({ c }: { c: HubCensus }) {
  const span =
    c.earliestYear && c.latestYear
      ? c.earliestYear === c.latestYear
        ? String(c.earliestYear)
        : `${c.earliestYear} – ${c.latestYear}`
      : '—'

  return (
    <main className="mhb">
      <section className="mhb-hero">
        <div className="mhb-hero-sup">★ Wing III · The counting house ★</div>
        <h1 className="mhb-hero-title">
          The <em>Census.</em>
        </h1>
        <p className="mhb-hero-sub">
          Every synced league pools into one ledger. No names, no league IDs. Counted fresh
          every hour.
        </p>
        <div className="mhb-hero-meta">
          <span>Seasons {span}</span>
          <span>{c.seasons.toLocaleString()} league-seasons on file</span>
        </div>
      </section>

      {/* ── §01 The big board ── */}
      <section className="mhb-sec">
        <div className="mhb-sec-head">
          <div>
            <span className="mhb-sec-num">§ 01 · The big board</span>
            <span className="mhb-sec-title">What the network has put up</span>
          </div>
        </div>
        <Reveal>
          <div className="mhb-marquee">
            <div className="mhb-marquee-lbl">Total fantasy points scored</div>
            <div className="mhb-marquee-val">
              <CountUp value={Math.round(c.totalPoints)} duration={2400} />
              <span className="unit">pts</span>
            </div>
            <div className="mhb-marquee-det">
              Every starter, every week, every season of every league synced to TSC.
            </div>
          </div>
        </Reveal>
        <Reveal delay={100}>
          <div className="mhb-tiles" style={{ marginTop: '.55rem' }}>
            <div className="mhb-tile">
              <div className="mhb-tile-lbl">Games decided</div>
              <div className="mhb-tile-val"><CountUp value={c.games} /></div>
              <div className="mhb-tile-det">
                <strong>{c.playoffGames.toLocaleString()}</strong> in the playoffs.
              </div>
            </div>
            <div className="mhb-tile">
              <div className="mhb-tile-lbl">Wins banked</div>
              <div className="mhb-tile-val"><CountUp value={c.totalWins} /></div>
              <div className="mhb-tile-det">
                Against {c.totalLosses.toLocaleString()} losses.
              </div>
            </div>
            <div className="mhb-tile">
              <div className="mhb-tile-lbl">Draft picks</div>
              <div className="mhb-tile-val"><CountUp value={c.draftPicks} /></div>
              <div className="mhb-tile-det">Every card turned in.</div>
            </div>
            <div className="mhb-tile">
              <div className="mhb-tile-lbl">Trades executed</div>
              <div className="mhb-tile-val"><CountUp value={c.trades} /></div>
              <div className="mhb-tile-det">Handshakes and heists.</div>
            </div>
            <div className="mhb-tile">
              <div className="mhb-tile-lbl">Championships</div>
              <div className="mhb-tile-val"><CountUp value={c.championships} /></div>
              <div className="mhb-tile-det">One ring per league-season.</div>
            </div>
            <div className="mhb-tile">
              <div className="mhb-tile-lbl">Managers</div>
              <div className="mhb-tile-val"><CountUp value={c.managers} /></div>
              <div className="mhb-tile-det">Each with a record and a rival.</div>
            </div>
            <div className="mhb-tile">
              <div className="mhb-tile-lbl">Player-weeks</div>
              <div className="mhb-tile-val"><CountUp value={c.playerWeeks} /></div>
              <div className="mhb-tile-det">Every lineup slot we watch.</div>
            </div>
            <div className="mhb-tile">
              <div className="mhb-tile-lbl">Seasons archived</div>
              <div className="mhb-tile-val"><CountUp value={c.seasons} /></div>
              <div className="mhb-tile-det">
                Back to <strong>{c.earliestYear ?? '—'}</strong>.
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── §02 Game character ── */}
      <section className="mhb-sec">
        <div className="mhb-sec-head">
          <div>
            <span className="mhb-sec-num">§ 02 · Game character</span>
            <span className="mhb-sec-title">How the games play</span>
          </div>
          <span className="mhb-sec-side">Final scores only</span>
        </div>
        <Reveal>
          <div className="mhb-tiles">
            <div className="mhb-tile">
              <div className="mhb-tile-lbl">Avg game total</div>
              <div className="mhb-tile-val">
                {c.avgGameTotal !== null ? <CountUp value={c.avgGameTotal} decimals={1} /> : '—'}
                <span className="unit">pts</span>
              </div>
              <div className="mhb-tile-det">Both teams combined.</div>
            </div>
            <div className="mhb-tile">
              <div className="mhb-tile-lbl">Avg margin</div>
              <div className="mhb-tile-val">
                {c.avgMargin !== null ? <CountUp value={c.avgMargin} decimals={1} /> : '—'}
                <span className="unit">pts</span>
              </div>
              <div className="mhb-tile-det">Handshake to heartbreak.</div>
            </div>
            <div className="mhb-tile">
              <div className="mhb-tile-lbl">Blowout rate</div>
              <div className="mhb-tile-val">
                {c.blowoutPct !== null ? <CountUp value={c.blowoutPct} decimals={1} /> : '—'}
                <span className="unit">%</span>
              </div>
              <div className="mhb-tile-det">Decided by 40 or more.</div>
            </div>
            <div className="mhb-tile">
              <div className="mhb-tile-lbl">Photo finishes</div>
              <div className="mhb-tile-val">
                {c.photoFinishPct !== null ? <CountUp value={c.photoFinishPct} decimals={1} /> : '—'}
                <span className="unit">%</span>
              </div>
              <div className="mhb-tile-det">Decided by fewer than 3.</div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── §03 Network DNA ── */}
      <section className="mhb-sec">
        <div className="mhb-sec-head">
          <div>
            <span className="mhb-sec-num">§ 03 · Network DNA</span>
            <span className="mhb-sec-title">One archetype for all of it</span>
          </div>
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
        <p className="mhb-fine">
          Same math as Manager DNA, run across every synced league at once. Totals are
          anonymous; named records live in <Link href="/hub/records">the Hall</Link>.
        </p>
      </section>
    </main>
  )
}
