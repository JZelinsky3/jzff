'use client'

// The broadcast desk: the default mode, now the command center format that
// won the lab bench. Production layout:
//
//   [ NFL strip ............................................. ]
//   [ The wire | NOW SHOWING + box scores | The monitor wall  ]
//   [ The leaders ........................................... ]
//
// The bottom ticker is mounted by SundayLiveApp so it stays fixed across
// modes. The monitor rides the 45s storyline-boosted rotation from
// SundayLiveApp; clicking a wall set or a wire bulletin pins that game,
// hovering the center column holds the rotation.

import { useSl } from '../SlProvider'
import { NflStrip } from './NflStrip'
import { CommandCenter } from './CommandCenter'
import { demoQuery } from '../../_lib/demoParam'

export function Desk() {
  const {
    frame,
    weekContext,
    featured,
    pinned,
    setPinned,
    setStageHover,
    playerDelta,
    scoreDelta,
    setView,
    demo,
  } = useSl()
  return (
    <div className="mx-auto max-w-[1840px] space-y-3 px-4 pt-3">
      <NflStrip />
      <CommandCenter
        frame={frame}
        weekContext={weekContext}
        featured={featured}
        pinned={pinned != null}
        onWatch={setPinned}
        onTogglePin={() => setPinned(pinned != null ? null : featured)}
        onHover={setStageHover}
        playerDelta={playerDelta}
        scoreDelta={scoreDelta}
        onLeaders={() => setView('leaders')}
        gameHref={(id) => `/leagues/${frame.league.slug}/sunday-live/matchup/${id}/${demoQuery(demo)}`}
      />
    </div>
  )
}
