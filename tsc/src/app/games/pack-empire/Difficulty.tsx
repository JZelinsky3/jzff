'use client'

// Switching difficulty and format at Empire Builder's table. Each pair keeps
// its own run, so these are thin tabs, not a menu.

import { BUILDER_FORMATS, DIFFICULTIES, DIFFICULTY_LOOK, FORMAT_LOOK, type BuilderFormat, type Difficulty } from '@/lib/packEmpire/rules'

/** Once a run is going: each difficulty keeps its own run, so changing is
    free, and a thin row of tabs is all it needs. */
export function DifficultyTabs({ value, onChange }: { value: Difficulty; onChange: (d: Difficulty) => void }) {
  return (
    <div className="pe-pick-tabs" role="radiogroup" aria-label="Difficulty">
      {DIFFICULTIES.map((d) => (
        <button
          key={d}
          type="button"
          role="radio"
          aria-checked={d === value}
          className={d === value ? 'on' : undefined}
          onClick={() => onChange(d)}
        >
          {DIFFICULTY_LOOK[d].label}
        </button>
      ))}
    </div>
  )
}

/** Empire Builder's table: Classic or Mystery, then the difficulty. Each pair keeps
    its own run, so switching is free. The full menu is on the Builder page. */
export function BuilderTabs({
  difficulty,
  format,
  onChange,
}: {
  difficulty: Difficulty
  format: BuilderFormat
  onChange: (d: Difficulty, f: BuilderFormat) => void
}) {
  return (
    <div className="pe-btabs">
      <div className="pe-btabs-fmt" role="radiogroup" aria-label="Format">
        {BUILDER_FORMATS.map((f) => (
          <button key={f} type="button" role="radio" aria-checked={f === format} data-f={f} onClick={() => onChange(difficulty, f)}>
            {FORMAT_LOOK[f].label}
          </button>
        ))}
      </div>
      <DifficultyTabs value={difficulty} onChange={(d) => onChange(d, format)} />
    </div>
  )
}
