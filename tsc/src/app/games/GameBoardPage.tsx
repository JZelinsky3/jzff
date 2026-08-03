// A game's leaderboard page, shared by every game.
//
// One board per (game, mode, pool), reached from that game's recap or from
// its lobby. The tabs are two different questions and are never merged:
// `best` is the high-score board people came for, `career` is who is
// actually good over every run they have played.
//
// The weekly board is not listed yet — the weekly entry point is still to be
// built, and a tab onto an empty board would read as broken rather than as
// unfinished.

import Link from 'next/link'
import { BackButton } from '@/components/BackButton'
import { SiteFooter } from '@/components/SiteFooter'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getViewMode } from '@/lib/viewMode'
import { loadBoard, type BoardKind, type GameId } from '@/lib/minigames/leaderboard'
import { soleLeagueSlug } from '@/lib/minigames/boardIdentity'
import { DEMO_POOL_ID, DEMO_POOL_LABEL } from '@/lib/minigames/demoPool'
import { BoardTable } from './BoardTable'
import { ClaimPrompt } from './ClaimPrompt'
import { MobileGameBar } from './MobileGameBar'
import type { GameDef } from './gameDefs'
import styles from './board.module.css'
import mobileStyles from './mobile.module.css'

const TABS: { kind: BoardKind; label: string }[] = [
  { kind: 'best', label: 'Best runs' },
  { kind: 'career', label: 'Career' },
]

/**
 * What the board calls the pool it belongs to.
 *
 * Deliberately a bare lookup rather than a call through the dealer: a board
 * needs the league's NAME, not its squads, and dealing a whole wheel to
 * render a page of scores would be minutes of work for one string.
 */
async function poolLabel(poolId: string): Promise<string> {
  if (poolId === 'site') return 'The Whole Site'
  if (poolId === DEMO_POOL_ID) return DEMO_POOL_LABEL

  const slugs = poolId.split(',').filter(Boolean)
  if (!slugs.every((s) => /^[a-z0-9-]{1,80}$/.test(s))) return 'Unknown league'

  const db = createAdminClient()
  const { data } = await db.from('leagues').select('slug, name').in('slug', slugs)
  const names = slugs.map((s) => (data ?? []).find((l) => l.slug === s)?.name as string | undefined)
  const known = names.filter(Boolean) as string[]
  if (known.length === 0) return 'Unknown league'
  if (known.length === 1) return known[0]
  return known.length <= 2 ? known.join(' + ') : `${known.length} leagues, combined`
}

export async function GameBoardPage({
  game,
  def,
  poolId,
  mode,
  kind,
}: {
  game: GameId
  def: GameDef
  poolId: string
  mode: string | null
  kind: BoardKind
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [board, label] = await Promise.all([
    loadBoard(kind, { game, mode, poolId }, user?.id ?? null),
    poolLabel(poolId),
  ])

  const playHref = `${def.href}?pool=${encodeURIComponent(poolId)}`
  const tabHref = (k: BoardKind) =>
    `${def.href}board/?pool=${encodeURIComponent(poolId)}${k === 'best' ? '' : `&kind=${k}`}`

  const mobile = (await getViewMode()) === 'mobile'

  return (
    // The board used to be a page with no masthead at all, reachable only
    // from the line under a finished run — which was survivable while that
    // was the only way in, and isn't now that the game links to it. Same
    // chrome the game wears, so leaving a board and leaving a wheel are the
    // same gesture.
    <main className={mobile ? mobileStyles.boardRoot : undefined}>
      {mobile ? (
        <MobileGameBar
          left="back"
          kicker={def.title}
          title="The"
          titleEm="Board"
          signedIn={!!user}
        />
      ) : (
        <nav className="nav">
          <BackButton fallbackHref={playHref} ariaLabel="Back" />
          <div className="nav-center">
            <div className="nav-kicker">The Games Page</div>
            <div className="nav-title">
              {def.title} <em>{def.titleEm}</em>
            </div>
          </div>
          <div className="pricing-nav-right">
            <Link href="/games/" className="pricing-nav-link">
              <span className="pricing-nav-link-text">All games</span>
            </Link>
            <Link href={user ? '/dashboard' : '/login'} className="pricing-nav-cta">
              {user ? 'Library' : 'Login'}
            </Link>
          </div>
        </nav>
      )}

      <div className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.kicker}>
          {def.title} {def.titleEm}
        </div>
        <h1 className={styles.title}>
          The <em>Board</em>
        </h1>
        <p className={styles.headSub}>
          {label}
          {' · '}
          <Link href={playHref} className={styles.headSwitch}>
            Play
          </Link>
        </p>
      </div>

      <nav className={styles.tabs}>
        {TABS.map((t) => (
          <Link
            key={t.kind}
            href={tabHref(t.kind)}
            className={`${styles.tab} ${t.kind === kind ? styles.tabOn : ''}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {/* The board is where a wrong name is actually visible, so it is also
          where the name gets set or corrected. Only on a single league's
          board and only when signed in: everywhere else there is no manager
          to claim. The component itself renders nothing until it has an
          answer worth showing. */}
      {user && soleLeagueSlug(poolId) && (
        <div className={styles.claimSlot}>
          <ClaimPrompt poolId={poolId} />
        </div>
      )}

      <BoardTable board={board} game={game} viewerId={user?.id ?? null} />

      <div className={styles.foot}>
        <Link href={playHref} className={styles.btn}>
          Play a run
        </Link>
        <Link href="/games/" className={styles.btnGhost}>
          All games
        </Link>
      </div>
      </div>

      {/* The phone gets the bar's back button and nothing else down there;
          a full site footer under a leaderboard is a second page. */}
      {!mobile && <SiteFooter />}
    </main>
  )
}
