// The League Cup's launch page, for a league with no Cup yet: the countdown
// to the draw, what the Cup is, when each round is, and the bracket as it
// would be drawn from the standings right now. Built to be sent to the
// group chat a week or two out so the league starts caring before round
// one: who has a bye, who's on the bubble, who'd play whom.
//
// Same house as the Cup itself (green board, cream tickets, brass), so the
// page people bookmark now is the page the bracket replaces on draw day.

import Link from 'next/link'
import type { CupPreview, CupPreviewTeam } from '@/lib/cup/preview'
import { CUP_LAUNCH, drawDayText, launchPhase } from '@/lib/cup/launch'
import { roundPoints, CHAMPION_BONUS } from '@/lib/cup/extras'
import { CUP_MAX_FIELD } from '@/lib/cup/bracket'
import { trophy } from '@/lib/cup/trophy'
import { ShareButton } from '../recap/ShareButton'
import { Countdown } from './Countdown'
import styles from './cup.module.css'
import pv from './preview.module.css'

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']

function gb(n: number): string {
  if (n === 0) return 'level on record'
  const whole = Math.floor(n)
  const half = n - whole >= 0.5
  if (!whole) return 'half a game back'
  return `${NUMBER_WORDS[whole] ?? whole}${half ? ' and a half' : ''} ${whole === 1 && !half ? 'game' : 'games'} back`
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

function Step({ n, head, body }: { n: number; head: string; body: string }) {
  return (
    <li className={pv.step}>
      <span className={pv.stepNum}>{n}</span>
      <span className={pv.stepText}>
        <span className={pv.stepHead}>{head}</span>
        <span className={pv.stepBody}>{body}</span>
      </span>
    </li>
  )
}

function TeamRow({ t, ppg }: { t: CupPreviewTeam; ppg: boolean }) {
  return (
    <div className={pv.team}>
      <span className={styles.medal}>{t.seed}</span>
      <span className={pv.teamWho}>
        <span className={pv.teamName}>{t.name}</span>
        <span className={pv.teamMeta}>
          {t.team && t.team !== t.name ? `${t.team} · ` : ''}
          {t.record}
        </span>
      </span>
      {ppg ? (
        <span className={pv.teamPpg}>
          {t.ppg.toFixed(1)}
          <small>ppg</small>
        </span>
      ) : null}
    </div>
  )
}

export function CupPreviewPage({ league, preview, pageUrl }: { league: { name: string; slug: string }; preview: CupPreview; pageUrl: string }) {
  const b = preview.bracket
  const byId = new Map(preview.teams.map((t) => [t.managerId, t]))
  const r1 = b.rounds[0]!
  const byes = [...r1.byes].sort((x, y) => x.seed - y.seed).map((e) => byId.get(e.managerId)!)
  const points = roundPoints(b.rounds.length)
  const phase = launchPhase()
  const day = drawDayText()
  const inAll = preview.teams.length <= CUP_MAX_FIELD

  return (
    <main className={styles.page}>
      <header className={styles.mast}>
        <div className={styles.mastInner}>
          <div className={styles.mastText}>
            <p className={styles.kicker}>
              {league.name} · {preview.year}
            </p>
            <h1 className={styles.title}>{CUP_LAUNCH.name}</h1>
            <p className={styles.status}>A knockout bracket inside your season. {phase === 'before' ? `The draw is ${day}.` : 'The draw is today.'}</p>
            <div className={styles.mastActions}>
              <span className={pv.comingChip}>Coming {day.replace(/^\w+, /, '')}</span>
              <span className={styles.mastMeta}>
                {b.field} teams · Weeks {b.startWeek} to {b.finalWeek}
              </span>
            </div>
          </div>
          <div className={styles.mastCup} aria-hidden>
            <span className={styles.mastHalo} />
            {trophy({ width: 120, brass: '#c8a35b', light: '#e6cb8e', dark: '#7d6230', plate: '#0d2a21' })}
          </div>
        </div>
      </header>

      <div className={pv.body}>
        {/* ── The countdown ── */}
        <section className={pv.ticket}>
          <p className={pv.ticketLabel}>{phase === 'before' ? 'The draw in' : 'Draw day'}</p>
          <Countdown at={CUP_LAUNCH.drawAt} done={phase === 'after' ? 'The draw is done. The bracket goes up any minute.' : 'The draw is today. The bracket goes up this morning.'} />
          <p className={pv.ticketFoot}>
            <b>{day}</b> · Seeds are the standings after week {CUP_LAUNCH.seededThrough}
          </p>
        </section>

        {/* ── How it works ── */}
        <section className={pv.section}>
          <h2 className={pv.head}>How it works</h2>
          <ol className={pv.steps}>
            <Step
              n={1}
              head="Seeded from the standings"
              body={`${inAll ? `All ${preview.teams.length} teams are in` : `The top ${CUP_MAX_FIELD} after week ${CUP_LAUNCH.seededThrough} are in`}.${r1.byes.length ? ` The top ${NUMBER_WORDS[r1.byes.length] ?? r1.byes.length} skip round one.` : ''}`}
            />
            <Step n={2} head="One round a week" body="Your real score that week is your Cup score. Outscore your Cup opponent to move on, whoever you play in the league. A tie goes to the higher seed." />
            <Step n={3} head="Pick who wins each game" body="Every manager in the Cup picks every game, knocked out or not. Tap the team you think wins; picks lock Thursday night." />
            <Step n={4} head="Nothing to sign up for" body="Your week counts on its own. Just set your lineup." />
          </ol>
        </section>

        {/* ── The schedule ── */}
        <section className={pv.section}>
          <h2 className={pv.head}>The schedule</h2>
          <ol className={pv.rail}>
            <li className={pv.railDraw}>
              <span className={pv.railDot} />
              <span className={pv.railName}>The draw</span>
              <span className={pv.railWhen}>{day.replace(/^\w+, /, '')}</span>
            </li>
            {b.rounds.map((r) => (
              <li key={r.round}>
                <span className={pv.railDot} />
                <span className={pv.railName}>{r.short}</span>
                <span className={pv.railWhen}>Week {r.week}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* ── If the draw were today ── */}
        <section className={pv.section}>
          <h2 className={pv.head}>{preview.final ? 'The draw' : 'If the draw were today'}</h2>
          <p className={pv.sub}>
            {preview.final
              ? `The standings after week ${preview.throughWeek}. These are the seeds.`
              : `Standings through week ${preview.throughWeek}. Seeds lock after week ${CUP_LAUNCH.seededThrough}.`}
          </p>

          {byes.length ? (
            <>
              <h3 className={pv.label}>Byes into the {b.rounds[1]?.name.toLowerCase() ?? 'second round'}</h3>
              <div className={pv.byes}>
                {byes.map((t) => (
                  <span key={t.managerId} className={pv.bye}>
                    <span className={`${styles.medal} ${pv.byeMedal}`}>{t.seed}</span>
                    <span className={pv.byeText}>
                      <span className={pv.byeName}>{t.name}</span>
                      <span className={pv.byeRec}>{t.record}</span>
                    </span>
                  </span>
                ))}
              </div>
            </>
          ) : null}

          <h3 className={pv.label}>{r1.name} · week {r1.week}</h3>
          <div className={pv.games}>
            {r1.matches.map((m, i) => {
              const a = m.a.kind === 'team' ? byId.get(m.a.entrant.managerId) : null
              const c = m.b.kind === 'team' ? byId.get(m.b.entrant.managerId) : null
              if (!a || !c) return null
              return (
                <article key={m.id} className={`${styles.game} ${pv.game}`}>
                  <header className={styles.gameHead}>
                    <span className={styles.gameNum}>Game {i + 1}</span>
                    {m.sameGame ? <span className={styles.flag}>Also their league game</span> : null}
                  </header>
                  <div className={pv.sides}>
                    <TeamRow t={a} ppg />
                    <span className={styles.vs} aria-hidden>
                      <span>v</span>
                    </span>
                    <TeamRow t={c} ppg />
                  </div>
                </article>
              )
            })}
          </div>

          {preview.firstOut || preview.byeRace || inAll ? (
            <div className={pv.bubble}>
              {inAll ? (
                <p>
                  <span className={pv.bubbleTag}>Everyone&apos;s in</span>
                  All {preview.teams.length} teams make the Cup. The race now is for seeding.
                </p>
              ) : preview.firstOut ? (
                <p>
                  <span className={pv.bubbleTag}>First out</span>
                  {preview.firstOut.name}, {ordinal(preview.firstOut.seed)}, {gb(preview.firstOut.gb)} of the last spot.
                </p>
              ) : null}
              {preview.byeRace ? (
                <p>
                  <span className={pv.bubbleTag}>Bye race</span>
                  {preview.byeRace.next} is {gb(preview.byeRace.gb)} of {preview.byeRace.last} for the last bye.
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* ── The bracket challenge ── */}
        <section className={pv.section}>
          <h2 className={pv.head}>The bracket challenge</h2>
          <p className={pv.sub}>Pick the winner of every Cup game. Points for each one you get right, more as the rounds go on, and a bonus if your champion wins it all.</p>
          <ol className={styles.ladder} aria-label="Points">
            {points.map((p, i) => (
              <li key={i}>
                <span className={styles.ladderPts}>{p}</span>
                <span className={styles.ladderName}>{b.rounds[i]!.short}</span>
              </li>
            ))}
            <li className={styles.ladderChamp}>
              <span className={styles.ladderPts}>+{CHAMPION_BONUS}</span>
              <span className={styles.ladderName}>Champion</span>
            </li>
          </ol>
        </section>
      </div>

      <footer className={styles.foot}>
        <p className={styles.footNote}>Send it to the league so nobody misses the draw.</p>
        <div className={styles.footActions}>
          <ShareButton className={styles.btnGold} url={pageUrl} title={`${CUP_LAUNCH.name} · ${league.name}`} label="Share the preview" />
          <Link className={styles.btnGhost} href={`/leagues/${league.slug}/`}>
            View the league
          </Link>
        </div>
        <Link href="/" className={styles.footLink}>
          The Sunday Chronicle
        </Link>
      </footer>
    </main>
  )
}
