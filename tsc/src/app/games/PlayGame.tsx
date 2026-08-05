// One game, dealt for one pool, rendered.
//
// The six games each ship a page under /games/<id>/ that does the same four
// things in the same order: read ?pool= and ?seed=, call that game's dealer,
// hand the result to its client component, and fall back to the lobby when no
// pool was named. The league tree (/leagues/<slug>/games/) needs three of
// those four and never the fourth — inside a league the pool is the league,
// which is the entire point of the section being there — so the shared middle
// lives here rather than being copied six more times.
//
// The /games/* pages are deliberately NOT refactored onto this. They carry
// per-game metadata, share-card generateMetadata, and one-off copy above the
// board; folding those into a switch would trade six clear files for one
// clever one. This is the dealer and the render, which is the part that
// genuinely repeats.

import { dealGame } from '@/lib/minigames/deal'
import { dealGauntlet } from '@/lib/minigames/gauntletDeal'
import { dealGuessDraft } from '@/lib/minigames/guessDraftDeal'
import { dealMultiverse } from '@/lib/minigames/multiverseDeal'
import { dealOverUnder } from '@/lib/minigames/overUnderDeal'
import { dealRedraft } from '@/lib/minigames/redraftDeal'
import { isGauntletMode } from '@/lib/minigames/gauntlet'
import { isRedraftMode } from '@/lib/minigames/redraft'

import { RosterRoulette } from './roulette/RosterRoulette'
import { GuessTheDraft } from './guess-the-draft/GuessTheDraft'
import { TheGauntlet } from './gauntlet/TheGauntlet'
import { OverUnder } from './over-under/OverUnder'
import { Redraft } from './redraft/Redraft'
import { MultiverseDraft } from './multiverse/MultiverseDraft'

export type PlayableGameId =
  | 'roulette'
  | 'guess-the-draft'
  | 'gauntlet'
  | 'over-under'
  | 'redraft'
  | 'multiverse'

export async function PlayGame({
  game,
  pool,
  seed,
  mode,
  signedIn,
  mobile,
}: {
  game: PlayableGameId
  /** Always a real pool here. The caller decides what it is; inside a league
      it is that league's slug and there is no picker to reach. */
  pool: string
  seed: string | null
  mode: string | null
  signedIn: boolean
  mobile: boolean
}) {
  // A run opened off a shared ?seed= is a replay of a deal somebody else has
  // already played, which is the definition of a run that cannot be ranked.
  // The games that keep a board say so themselves; this just passes the flag.
  const shared = !!seed

  switch (game) {
    case 'roulette': {
      const dealt = await dealGame(pool, seed)
      return (
        <RosterRoulette
          initialDeal={dealt.ok ? dealt : null}
          initialError={dealt.ok ? null : dealt.error}
          signedIn={signedIn}
          initialShared={shared}
        />
      )
    }
    case 'guess-the-draft': {
      const dealt = await dealGuessDraft(pool, seed)
      return (
        <GuessTheDraft
          initialDeal={dealt.ok ? dealt : null}
          initialError={dealt.ok ? null : dealt.error}
          signedIn={signedIn}
        />
      )
    }
    case 'gauntlet': {
      // The card of ten is the default: sudden death can be over in four
      // seconds, which is a rough way to meet a game.
      const dealt = await dealGauntlet(pool, isGauntletMode(mode) ? mode : 'ten', seed)
      return (
        <TheGauntlet
          initialDeal={dealt.ok ? dealt : null}
          initialError={dealt.ok ? null : dealt.error}
          signedIn={signedIn}
        />
      )
    }
    case 'over-under': {
      const dealt = await dealOverUnder(pool, seed)
      return (
        <OverUnder
          initialDeal={dealt.ok ? dealt : null}
          initialError={dealt.ok ? null : dealt.error}
          signedIn={signedIn}
        />
      )
    }
    case 'redraft': {
      // Whole draft is the default: your opponent is a person rather than a
      // round, which is the version worth arguing about.
      const dealt = await dealRedraft(pool, isRedraftMode(mode) ? mode : 'manager', seed)
      return (
        <Redraft
          initialDeal={dealt.ok ? dealt : null}
          initialError={dealt.ok ? null : dealt.error}
          signedIn={signedIn}
        />
      )
    }
    case 'multiverse': {
      const dealt = await dealMultiverse(pool, seed)
      return (
        <MultiverseDraft
          initialDeal={dealt.ok ? dealt : null}
          initialError={dealt.ok ? null : dealt.error}
          signedIn={signedIn}
          shared={shared}
          // Layout is handled in CSS; this is for COPY. A phone gets the
          // short version of every caption.
          mobile={mobile}
        />
      )
    }
  }
}
