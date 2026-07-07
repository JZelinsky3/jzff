'use client'

// THE GAME ROOM: one matchup's own page, for the member who came to watch
// their game and nothing else. A produced hero (identity glows, the two
// sides at full size, everything contested in the middle), the booth's
// preview and live columns directly beneath, then both complete lineups,
// the wire scoped to this game, and the news that names either roster.
// Runs its own lightweight poll; no SlProvider, no desk state.

import type { SlLeague, SlMatchup, SlNewsItem, SlSide } from '@/lib/sundayLive/types'
import type { SlWeekContext } from '@/lib/sundayLive/seasonContext'
import { useSlPoll, type Demo } from '../../_lib/useSlPoll'
import { fmtPts, fmtSince } from '../../_lib/format'
import { demoQuery } from '../../_lib/demoParam'
import { FeaturedSide, voteCounts, pickedSide, standingsRanks } from '../desk/FeaturedSide'
import { WpMeter } from '../desk/WpMeter'
import { SeriesBlock, seriesLines, ScoreBoard } from '../desk/Stage'
import { buildGameNotes, type Note } from '../desk/GameNotes'
import { StarterTable } from '../desk/StarterTable'

function NotePanel({ label, notes, bullet }: { label: string; notes: Note[]; bullet: string }) {
  return (
    <div className="sl-hoverable sl-panel overflow-hidden">
      <div className="sl-slate">
        <span className="sl-kicker text-sl-cream!">{label}</span>
      </div>
      {notes.length === 0 ? (
        <p className="px-4 py-5 text-center text-[12px] text-sl-dim">The booth has nothing yet.</p>
      ) : (
        <ul className="space-y-3 px-4 py-3.5">
          {notes.map((n) => (
            <li key={n.key} className="flex items-baseline gap-2.5">
              <span className={`shrink-0 text-[10px] ${bullet}`} aria-hidden>
                ✦
              </span>
              <span className="sl-display min-w-0 text-[14px] leading-snug text-sl-text">{n.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function BenchTable({ side }: { side: SlSide }) {
  const bench = side.players.filter((p) => !p.isStarter).sort((a, b) => b.points - a.points)
  if (bench.length === 0) return null
  return (
    <div className="sl-hoverable sl-panel overflow-hidden">
      <div className="sl-slate">
        <span className="sl-kicker">THE BENCH</span>
      </div>
      {bench.map((p, i) => (
        <div
          key={p.playerId}
          className={`flex items-baseline gap-2.5 px-3.5 py-2 ${i % 2 === 1 ? 'bg-sl-panel-2/40' : ''}`}
        >
          <span className="sl-num w-8 shrink-0 text-[10px] text-sl-mute">{p.position ?? ''}</span>
          <span className="sl-display min-w-0 flex-1 truncate text-[14px] text-sl-text">{p.name}</span>
          <span className="shrink-0 text-[10.5px] text-sl-dim">{p.team ?? ''}</span>
          <span className="sl-num w-11 shrink-0 text-right text-[13px] text-sl-mute">
            {fmtPts(p.points)}
          </span>
        </div>
      ))}
    </div>
  )
}

function GameWire({ frame, m }: { frame: SlLeague; m: SlMatchup }) {
  const bulletins = frame.storylines
    .filter((s) => s.refs.matchupId === m.matchupId)
    .sort((a, b) => Date.parse(b.firstSeenAt) - Date.parse(a.firstSeenAt))
  return (
    <div className="sl-hoverable sl-panel overflow-hidden">
      <div className="sl-slate">
        <span className="sl-kicker text-sl-cream!">THE WIRE ON THIS GAME</span>
      </div>
      {bulletins.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12px] text-sl-dim">
          Holding for bulletins on this one.
        </p>
      ) : (
        bulletins.map((s) => (
          <div key={s.id} className="border-b border-sl-line/50 px-4 py-2.5 last:border-b-0">
            <div className="flex items-baseline justify-between gap-3">
              <p className="sl-display min-w-0 text-[14.5px] leading-snug text-sl-text">{s.headline}</p>
              <span className="sl-num shrink-0 text-[8.5px] tracking-[0.14em] text-sl-dim">
                {s.kind.replace(/-/g, ' ').toUpperCase()}
              </span>
            </div>
            {s.subline && <p className="mt-0.5 text-[11.5px] leading-snug text-sl-mute">{s.subline}</p>}
          </div>
        ))
      )}
    </div>
  )
}

function TeamNewsColumn({ side, items }: { side: SlSide; items: SlNewsItem[] }) {
  return (
    <div className="min-w-0">
      <span className="sl-kicker">{side.ownerName.toUpperCase()}&apos;S PLAYERS</span>
      {items.length === 0 ? (
        <p className="mt-2 text-[12px] text-sl-dim">Nothing on the wire about this roster today.</p>
      ) : (
        <div className="mt-2 space-y-3">
          {items.map((n) => (
            <div key={n.id}>
              <div className="flex items-baseline justify-between gap-3">
                {n.link ? (
                  <a
                    href={n.link}
                    target="_blank"
                    rel="noreferrer"
                    className="sl-display min-w-0 text-[14px] leading-snug text-sl-text transition-colors hover:text-sl-glow"
                  >
                    {n.headline}
                  </a>
                ) : (
                  <span className="sl-display min-w-0 text-[14px] leading-snug text-sl-text">
                    {n.headline}
                  </span>
                )}
                <span className="sl-num shrink-0 text-[9.5px] text-sl-dim">{fmtSince(n.published)}</span>
              </div>
              {n.leagueTag && (
                <span className="sl-num text-[9.5px] tracking-[0.1em] text-sl-glow">
                  {n.leagueTag.playerName.toUpperCase()}
                </span>
              )}
              <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-sl-mute">{n.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// News that names a player on this side's roster, newest first.
function newsFor(side: SlSide, news: SlNewsItem[]): SlNewsItem[] {
  const names = new Set(side.players.map((p) => p.name))
  return news
    .filter((n) => n.leagueTag && names.has(n.leagueTag.playerName))
    .sort((a, b) => Date.parse(b.published) - Date.parse(a.published))
    .slice(0, 5)
}

export function GameRoom({
  slug,
  initialFrame,
  initialDemo,
  matchupId,
  weekContext,
}: {
  slug: string
  initialFrame: SlLeague
  initialDemo: Demo | null
  matchupId: number
  weekContext: SlWeekContext | null
}) {
  const { frame } = useSlPoll(slug, initialFrame, initialDemo)
  const m = frame.matchups.find((x) => x.matchupId === matchupId)
  const deskHref = `/leagues/${slug}/sunday-live/${demoQuery(initialDemo)}`

  if (!m) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <p className="sl-kicker mb-2">NO SIGNAL</p>
        <p className="mb-6 text-sm text-sl-mute">This game is not on this week&apos;s slate.</p>
        <a href={deskHref} className="sl-chip transition-colors hover:text-sl-text">
          BACK TO THE DESK
        </a>
      </div>
    )
  }

  const final = m.status === 'final'
  const aWinning = m.a.score >= m.b.score
  const wc = weekContext?.matchups[m.matchupId] ?? null
  const series = seriesLines(m, wc)
  const notes = buildGameNotes(m, frame.storylines, frame.wpBounds?.[String(m.matchupId)], wc, {
    long: true,
  })
  const preNotes = notes.filter((n) => n.scope === 'pre')
  const liveNotes = notes.filter((n) => n.scope === 'live')
  const votes = voteCounts(m)
  const fav = pickedSide(m)
  const ranks = standingsRanks(frame, weekContext)
  const newsA = newsFor(m.a, frame.news)
  const newsB = newsFor(m.b, frame.news)

  return (
    <div className="mx-auto max-w-[1300px] space-y-4 px-4 py-5">
      {/* Room chrome: the way back, the billing, the state */}
      <div className="flex items-center justify-between gap-3">
        <a href={deskHref} className="sl-chip shrink-0 transition-colors hover:text-sl-text">
          BACK TO THE DESK
        </a>
        <div className="min-w-0 text-center">
          <div className="sl-display truncate text-[20px] leading-tight text-sl-text">
            {m.a.ownerName} <span className="italic text-sl-dim">vs</span> {m.b.ownerName}
          </div>
          <span className="sl-kicker">WEEK {frame.league.week} · {frame.league.name.toUpperCase()}</span>
        </div>
        <div className="flex shrink-0 items-center justify-end">
          {m.status === 'live' ? (
            <span className="sl-chip border-sl-live/40 text-sl-live!">
              <span className="sl-live-dot" style={{ width: 5, height: 5 }} /> LIVE
            </span>
          ) : (
            <span className="sl-kicker">{final ? 'FINAL' : 'UP NEXT'}</span>
          )}
        </div>
      </div>

      {/* The hero: both sides at full size under their own studio light */}
      <div className="sl-hoverable sl-panel-raised relative overflow-hidden p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(620px 320px at 10% -10%, color-mix(in srgb, var(--sl-gold) 11%, transparent), transparent 70%), radial-gradient(620px 320px at 90% -10%, color-mix(in srgb, var(--sl-navy) 20%, transparent), transparent 70%)',
          }}
        />
        <div className="relative grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,auto)_minmax(0,1fr)]">
          <FeaturedSide
            side={m.a}
            dim={final && !aWinning}
            record={wc?.recordA ?? null}
            power={wc?.powerA ?? null}
            votes={votes?.a ?? null}
            picked={fav === 'A'}
            form={wc?.formA ?? null}
            standing={ranks.get(m.a.rosterId) ?? null}
            avatarPx={92}
            namePx={27}
          />
          <div className="flex flex-col items-center">
            <ScoreBoard
              a={
                <span className={`sl-num text-[56px] leading-none ${final && !aWinning ? 'text-sl-dim' : ''}`} style={final && !aWinning ? undefined : { color: 'var(--sl-heading, var(--sl-text))' }}>
                  {fmtPts(m.a.score)}
                </span>
              }
              vs={<span className="sl-display pb-2 text-[17px] italic text-sl-dim">vs</span>}
              b={
                <span className={`sl-num text-[56px] leading-none ${final && aWinning ? 'text-sl-dim' : ''}`} style={final && aWinning ? undefined : { color: 'var(--sl-heading, var(--sl-text))' }}>
                  {fmtPts(m.b.score)}
                </span>
              }
              projA={m.a.projected}
              projB={m.b.projected}
            />
            <div className="mt-3.5 w-full max-w-[360px]">
              <WpMeter matchup={m} />
            </div>
            {series && <SeriesBlock series={series} />}
          </div>
          <FeaturedSide
            side={m.b}
            dim={final && aWinning}
            record={wc?.recordB ?? null}
            power={wc?.powerB ?? null}
            votes={votes?.b ?? null}
            picked={fav === 'B'}
            form={wc?.formB ?? null}
            standing={ranks.get(m.b.rosterId) ?? null}
            avatarPx={92}
            namePx={27}
            right
          />
        </div>
      </div>

      {/* The booth's read, preview and live side by side */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <NotePanel label="THE PREVIEW" notes={preNotes} bullet="text-sl-mute" />
        <NotePanel label="LIVE" notes={liveNotes} bullet="text-sl-gold" />
      </div>

      {/* Full lineups: every player both managers are carrying */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="space-y-3">
          <StarterTable side={m.a} />
          <BenchTable side={m.a} />
        </div>
        <div className="space-y-3">
          <StarterTable side={m.b} />
          <BenchTable side={m.b} />
        </div>
      </div>

      {/* This game's wire next to this game's news: no dead width */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <GameWire frame={frame} m={m} />
        <div className="sl-hoverable sl-panel overflow-hidden">
          <div className="sl-slate">
            <span className="sl-kicker text-sl-cream!">TEAM NEWS</span>
          </div>
          <div className="grid grid-cols-1 gap-x-8 gap-y-5 px-4 py-3.5 md:grid-cols-2">
            <TeamNewsColumn side={m.a} items={newsA} />
            <TeamNewsColumn side={m.b} items={newsB} />
          </div>
        </div>
      </div>
    </div>
  )
}
