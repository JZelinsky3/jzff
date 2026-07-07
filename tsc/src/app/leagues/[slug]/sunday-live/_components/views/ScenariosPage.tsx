'use client'

// The full scenario room: the live "if the day ended now" table with
// flippable winners. Same frame, same poll as the desk; the machine keeps
// its own flips locally so playing with scenarios never touches the data.

import { NflStrip } from '../desk/NflStrip'
import { ScenarioMachine, canRunScenarios } from '../desk/ScenarioMachine'
import { useSl } from '../SlProvider'
import type { ScenarioFlips } from '../../_lib/scenarioFlips'

export function ScenariosPage({ initialFlips }: { initialFlips?: ScenarioFlips }) {
  const { frame, weekContext } = useSl()
  const ready = weekContext != null && canRunScenarios(frame, weekContext)
  return (
    <div className="space-y-3 pt-3">
      <div className="mx-auto max-w-[1840px] px-4">
        <NflStrip />
      </div>
      <div className="mx-auto max-w-[1100px] space-y-3 px-4">
        <div className="flex items-baseline justify-between">
          <h1 className="sl-display text-2xl text-sl-text">The Scenario Machine</h1>
          <span className="sl-kicker">IF THE DAY ENDED NOW</span>
        </div>
        {ready && weekContext ? (
          <ScenarioMachine frame={frame} weekContext={weekContext} initialFlips={initialFlips} />
        ) : (
          <p className="sl-panel px-4 py-8 text-center text-[13px] text-sl-dim">
            The machine needs season records for every team; it wakes up once the league has a
            week in the books.
          </p>
        )}
      </div>
    </div>
  )
}
