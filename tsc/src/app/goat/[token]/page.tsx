import {
  ROUNDS, currentRound, winnerOf, buildBracket, finalGame, finishLine, label, pathTo, pts, record,
  settledScores, vsLeague,
  type GoatTeam, type ResolvedGame,
} from '@/lib/greatestTeam'
import { PAMS_ROSTER } from '@/lib/winBallot'
import { leagueForToken, readBracket, readVotes, votedNames } from '../actions'
import { BracketView } from '../bracket-view'
import { FinalPreview } from '../final'
import { Next2026 } from '../recap'
import { VoteClient } from '../vote-client'
import '../goat.css'

export const dynamic = 'force-dynamic'

const ROSTER = PAMS_ROSTER.map((m) => m.name)

/**
 * The unfurl in the group chat. Follows the state, so a link pasted in round
 * one and again in the final says two different true things.
 */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const league = await leagueForToken(token)
  if (!league) {
    // Still carries a card: the image route renders a "wrong door" of its own,
    // which beats a dead link unfurling into nothing at all.
    const dead = `/api/og/goat/${encodeURIComponent(token)}`
    return {
      title: 'Wrong door',
      description: 'This bracket link is not the live one. Ask Joey for the one he sent the group.',
      robots: { index: false, follow: false },
      openGraph: { type: 'website', title: 'Wrong door', images: [{ url: dead, width: 1200, height: 630 }] },
      twitter: { card: 'summary_large_image' as const, title: 'Wrong door', images: [dead] },
    }
  }

  const state = await readBracket(league.id)
  const metaBracket = buildBracket(state.results)
  const champion = winnerOf(metaBracket)
  const roundName = state.openRound ? ROUNDS.find((r) => r.id === state.openRound)?.name : null
  const metaFinal = finalGame(metaBracket)
  const tie = !champion && metaFinal?.home && metaFinal?.away
    ? `${label(metaFinal.home)} vs ${label(metaFinal.away)}`
    : null

  const copy = champion
    ? {
        title: `${label(champion)} · greatest team in PA Milk Society history`,
        description: 'Sixteen team-seasons, four rounds, and the room settled it.',
      }
    : tie
    ? {
        title: `The Final · ${tie}`,
        description:
          state.openRound === 'final'
            ? 'One game left for the greatest team in league history. Voting is open.'
            : 'Fourteen teams are out. One call decides the greatest team in league history.',
      }
    : roundName
    ? {
        title: `${roundName} · greatest team in PAMS history`,
        description: 'Voting is open. Sixteen of the best team-seasons since 2019, and only one gets out.',
      }
    : {
        title: 'The greatest team in PAMS history',
        description: 'Sixteen team-seasons since 2019, seeded by resume. The room decides the rest.',
      }

  // The token rides into the image route, which resolves it again itself
  // rather than trusting a phase in a query string.
  const image = `/api/og/goat/${encodeURIComponent(token)}`
  return {
    title: copy.title,
    description: copy.description,
    robots: { index: false, follow: false },
    openGraph: {
      type: 'website',
      title: copy.title,
      description: copy.description,
      siteName: 'The Sunday Chronicle',
      images: [{ url: image, width: 1200, height: 630, alt: copy.title }],
    },
    twitter: {
      card: 'summary_large_image' as const,
      title: copy.title,
      description: copy.description,
      images: [image],
    },
  }
}

// Deliberately NOT under /league/[slug]: that layout redirects signed-out
// visitors to /login, and the whole point of this link is that twelve people
// can open it without an account. The token in the path is both the address
// and the authorization.
//
// One link, two faces, decided by league state rather than by the URL:
//   a round is open  -> a card to fill in
//   nothing open     -> the bracket as it stands
export default async function GoatPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const league = await leagueForToken(token)
  if (!league) {
    return (
      <div className="gt">
        <div className="gt-shell">
          <div className="gt-head">
            <div className="gt-kicker">PA Milk Society</div>
            <h1>Wrong <em>door.</em></h1>
            <div className="gt-sub">This link isn&apos;t the live one</div>
          </div>
          <div className="gt-stage">
            <p className="gt-note">
              The bracket is open by invitation only, and this link either
              expired or was never the current one.
            </p>
            <p className="gt-note">Ask Joey for the link he sent the group and open that instead.</p>
          </div>
          <div className="gt-foot">PA Milk Society</div>
        </div>
      </div>
    )
  }

  const state = await readBracket(league.id)

  if (state.openRound) {
    const already = await votedNames(league.id, state.openRound)
    // Only settled games carry a score, so the live round stays sealed even
    // though every card the room has ever cast passes through here.
    const settled = settledScores(
      buildBracket(state.results),
      await readVotes(league.id),
      state.openRound,
    )
    return (
      <VoteClient
        leagueId={league.id}
        token={token}
        round={state.openRound}
        results={state.results}
        roster={ROSTER}
        alreadyVoted={already}
        scores={settled}
      />
    )
  }

  const votes = await readVotes(league.id)
  const bracket = buildBracket(state.results)
  const next = currentRound(state.results)
  const nextName = next ? ROUNDS.find((r) => r.id === next)?.name : null
  const started = Object.keys(state.results).length > 0
  const champion = winnerOf(bracket)
  const final = finalGame(bracket)

  // The last round and the result it produced both get the dark room. Once
  // the semifinals are settled this link stops being a bracket tracker and
  // becomes a fight poster, and it should not look like the earlier rounds.
  const dressed = next === 'final' || !!champion

  return (
    <div className={`gt${dressed ? ' is-final' : ''}`}>
      <div className="gt-shell">
        <div className="gt-head">
          <div className="gt-kicker">
            {dressed ? 'PA Milk Society · the championship' : 'PA Milk Society'}
          </div>
          {dressed ? (
            <h1>The <em>Final</em></h1>
          ) : (
            <h1>The <em>greatest</em> team we&apos;ve had</h1>
          )}
          <div className="gt-sub">
            {champion ? 'Settled' : nextName ? `${nextName} opens next` : 'Settled'}
          </div>
        </div>
        <div className="gt-stage">
          {champion && <Coronation champion={champion} bracket={bracket} />}

          {!champion && next === 'final' && final?.home && final?.away && (
            <>
              <div className="gt-standby">
                <div className="gt-kicker">The field is down to two</div>
                <h2>The final is set.</h2>
                <p>
                  When Joey opens it, this same link turns into one card with one
                  game on it. Fourteen teams are already out.
                </p>
              </div>
              <FinalPreview
                bracket={bracket}
                game={final}
                scores={settledScores(bracket, votes)}
              />
            </>
          )}

          {!champion && next !== 'final' && nextName && (
            <div className="gt-standby">
              <div className="gt-kicker">Nothing to vote on yet</div>
              <h2>{started ? `${nextName} hasn't opened.` : 'The bracket is set.'}</h2>
              <p>
                {started
                  ? `Voting is closed between rounds. When Joey opens ${nextName.toLowerCase()}, this same link turns into the card. Nothing to do until then.`
                  : `Sixteen team-seasons, seeded on resume. When Joey opens ${nextName.toLowerCase()}, this same link turns into the card and you call all eight games.`}
              </p>
            </div>
          )}

          <BracketView
            results={state.results}
            votes={votes}
            revealed={state.revealed}
            openRound={null}
          />

          {/* The bracket is the offseason's last act, so the page hands off to
              what comes after it rather than just ending. */}
          {(dressed || champion) && <Next2026 />}
        </div>
        <div className="gt-foot">
          {dressed ? 'Sixteen went in · two are left · one is the answer' : 'PA Milk Society · sixteen teams · one winner'}
        </div>
      </div>
    </div>
  )
}

/**
 * The result, given the room it earned. Not the compact `gt-champ` strip the
 * bracket carries below: that reads as a row in a table, and this is the only
 * answer the league is ever going to give to the question.
 */
function Coronation({ champion, bracket }: { champion: GoatTeam; bracket: ResolvedGame[] }) {
  const road = pathTo(bracket, champion.seed)
  return (
    <div className="gt-crown">
      <div className="gt-crown-rule"><span>✦</span></div>
      <div className="gt-kicker">The greatest team in league history</div>
      <h2>{label(champion)}</h2>
      <div className="gt-crown-team">&ldquo;{champion.team}&rdquo;</div>
      <div className="gt-crown-figs">
        <span><b>{record(champion)}</b><em>record</em></span>
        <span><b>{pts(champion.ppg)}</b><em>a week</em></span>
        <span><b>{vsLeague(champion.index)}</b><em>vs league avg</em></span>
        <span><b>{champion.seed}</b><em>seed</em></span>
      </div>
      <div className="gt-crown-road">
        {road.map((step) => (
          <span key={step.round}>{label(step.beat)}</span>
        ))}
      </div>
      <p className="gt-crown-note">
        {finishLine(champion)}. Four rounds put to the room, and it came through
        all four.
      </p>
      <div className="gt-crown-rule"><span>✦</span></div>
    </div>
  )
}
