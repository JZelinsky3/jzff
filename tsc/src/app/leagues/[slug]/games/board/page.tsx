// /leagues/<slug>/games/board?game=<id>&kind=best|career
//
// One leaderboard for the league, switchable by game.
//
// The per-game boards under /games/<id>/board/ each need a ?pool= before they
// mean anything, which inside a league is a question with one answer. This is
// the same board with the pool already known and the GAME moved into the
// tabs, so somebody who has just played three things on their league reads
// them in one place instead of navigating back out to the shelf twice.
//
// Boards are still never merged: loadBoard is called for exactly one
// (game, mode, pool) at a time, and the tabs switch which one. A combined
// ranking across games would be adding up a 17-0 lineup and a playoff run,
// which are not the same unit.

import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BackButton } from '@/components/BackButton'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { getViewMode } from '@/lib/viewMode'
import { loadBoard, isGameId, type BoardKind } from '@/lib/minigames/leaderboard'
import { BoardTable } from '@/app/games/BoardTable'
import { ClaimPrompt } from '@/app/games/ClaimPrompt'
import { MobileGameBar } from '@/app/games/MobileGameBar'
import { MobileGamesDock } from '@/app/games/MobileGamesDock'
import { GAMES } from '@/app/games/gameDefs'
import styles from '@/app/games/board.module.css'
import mobileStyles from '@/app/games/mobile.module.css'
import { gamesBase, loadLeagueGamesMeta } from '../leagueGames'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'The Board',
  description: 'Every run anyone has put up on this league, best first.',
  // A leaderboard changes every time somebody plays, so it is not a page
  // worth serving out of an index. The shelf is the stable content.
  robots: { index: false, follow: true },
}

const KINDS: { kind: BoardKind; label: string }[] = [
  { kind: 'best', label: 'Best runs' },
  { kind: 'career', label: 'Career' },
]

export default async function LeagueGamesBoard({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ game?: string; kind?: string }>
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams])

  // Only the games that keep a board. GameDef.hasBoard is the flag for "a run
  // verifier exists for this game" — a tab onto a game the server cannot
  // re-score would list nothing forever. Flipping hasBoard when a verifier
  // ships adds the tab here with no other change.
  const ranked = GAMES.filter((g) => g.hasBoard)
  const unranked = GAMES.filter((g) => !g.hasBoard)
  if (ranked.length === 0) notFound()

  const requested = (sp.game ?? '').trim().toLowerCase()
  const def = ranked.find((g) => g.id === requested) ?? ranked[0]
  if (!isGameId(def.id)) notFound()

  const kind: BoardKind = sp.kind === 'career' ? 'career' : 'best'

  const [league, supabase, mobile] = await Promise.all([
    loadLeagueGamesMeta(slug),
    createClient(),
    getViewMode().then((v) => v === 'mobile'),
  ])
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Mode is null the same way every shipped board passes null: neither game
  // with a verifier has more than one mode. When one does, this is where its
  // mode tabs go, not a merge.
  const board = await loadBoard(kind, { game: def.id, mode: null, poolId: slug }, user?.id ?? null)

  const base = gamesBase(slug)
  const boardHref = `${base}board/`
  const gameTab = (id: string) => `${boardHref}?game=${id}${kind === 'best' ? '' : `&kind=${kind}`}`
  const kindTab = (k: BoardKind) => `${boardHref}?game=${def.id}${k === 'best' ? '' : `&kind=${k}`}`
  const playHref = `${base}${def.id}/`

  return (
    <main className={mobile ? mobileStyles.root : undefined}>
      {mobile ? (
        <MobileGameBar
          left="back"
          backHref={base}
          backLabel="This league's games"
          kicker={league.name}
          title="The"
          titleEm="Board"
          signedIn={!!user}
        />
      ) : (
        <nav className="nav">
          <BackButton fallbackHref={base} ariaLabel="Back" />
          <div className="nav-center">
            <div className="nav-kicker">{league.name}</div>
            <div className="nav-title">
              The <em>Board</em>
            </div>
          </div>
          <div className="pricing-nav-right">
            <Link href={base} className="pricing-nav-link">
              <span className="pricing-nav-link-text">All games</span>
            </Link>
            <Link href={`/leagues/${slug}/`} className="pricing-nav-cta">
              Almanac
            </Link>
          </div>
        </nav>
      )}

      <div className={styles.wrap} style={{ '--accent': def.accent } as React.CSSProperties}>
        <div className={styles.head}>
          <div className={styles.kicker}>{league.name}</div>
          <h1 className={styles.title}>
            The <em>Board</em>
          </h1>
          <p className={styles.headSub}>
            {def.title} {def.titleEm}
            {' · '}
            <Link href={playHref} className={styles.headSwitch}>
              Play
            </Link>
          </p>
        </div>

        {/* Which game. Above the best/career tabs deliberately: it changes
            what is being ranked, where those two change how. */}
        <nav className={styles.tabs} aria-label="Game">
          {ranked.map((g) => (
            <Link
              key={g.id}
              href={gameTab(g.id)}
              className={`${styles.tab} ${g.id === def.id ? styles.tabOn : ''}`}
              style={{ '--accent': g.accent } as React.CSSProperties}
            >
              {g.shortName}
            </Link>
          ))}
        </nav>

        <nav className={styles.tabs} aria-label="Ranking">
          {KINDS.map((t) => (
            <Link
              key={t.kind}
              href={kindTab(t.kind)}
              className={`${styles.tab} ${t.kind === kind ? styles.tabOn : ''}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        {/* One league's board is the only place a wrong name is visible, so
            it is where the name gets set or corrected. Signed out too: the
            person who has just played three runs on this league is exactly
            who the question is for. */}
        <div className={styles.claimSlot}>
          <ClaimPrompt poolId={slug} />
        </div>

        <BoardTable board={board} game={def.id} viewerId={user?.id ?? null} />

        {unranked.length > 0 && (
          <p className={styles.note}>
            {unranked.map((g) => `${g.title} ${g.titleEm}`).join(', ')}{' '}
            {unranked.length === 1 ? 'is' : 'are'} playable but not ranked yet:
            a run only reaches a board once the server can re-score it, and
            those verifiers are still being written.
          </p>
        )}

        <div className={styles.foot}>
          <Link href={playHref} className={styles.btn}>
            Play a run
          </Link>
          <Link href={base} className={styles.btnGhost}>
            All games
          </Link>
        </div>
      </div>

      {mobile ? (
        <MobileGamesDock
          base={base}
          home={{ href: base, label: 'Shelf', icon: 'shelf' }}
          boardHref={boardHref}
          signedIn={!!user}
          leagueSlug={slug}
          leagueName={league.name}
        />
      ) : (
        <SiteFooter />
      )}
    </main>
  )
}
