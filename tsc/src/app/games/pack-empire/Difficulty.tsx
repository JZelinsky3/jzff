'use client'

// Picking how hard to play: the three difficulties, and Versus's two formats.
// Shared by Empire Builder and the Versus lobby so a difficulty means the same
// thing everywhere it's offered.

import { BUILDER_FORMATS, DIFFICULTIES, DIFFICULTY_LOOK, FORMAT_LOOK, type BuilderFormat, type Difficulty } from '@/lib/packEmpire/rules'
import type { VersusFormat } from '@/lib/packEmpire/versus'

export function DifficultyPicker({ value, onChange }: { value: Difficulty; onChange: (d: Difficulty) => void }) {
  return (
    <div className="pe-pick" role="radiogroup" aria-label="Difficulty">
      {DIFFICULTIES.map((d) => (
        <button
          key={d}
          type="button"
          role="radio"
          aria-checked={d === value}
          className={`pe-pick-item${d === value ? ' on' : ''}`}
          data-d={d}
          onClick={() => onChange(d)}
        >
          <b>{DIFFICULTY_LOOK[d].label}</b>
          <span>{DIFFICULTY_LOOK[d].line}</span>
        </button>
      ))}
      <p className="pe-pick-line">{DIFFICULTY_LOOK[value].line}</p>
    </div>
  )
}

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

const FORMATS: { id: VersusFormat; label: string; line: string }[] = [
  { id: 'classic', label: 'Classic', line: 'Your own eleven packs and a captain each. The better pulls win.' },
  { id: 'even', label: 'Even', line: 'The same eleven packs, no captain. Chemistry and three Battles decide it.' },
  { id: 'mystery', label: 'Mystery', line: 'Your own captain, then ten packs of mixed positions. Plan for what you need.' },
]

export function FormatPicker({ value, onChange }: { value: VersusFormat; onChange: (f: VersusFormat) => void }) {
  return (
    <div className="pe-pick pe-pick--three" role="radiogroup" aria-label="Format">
      {FORMATS.map((f) => (
        <button
          key={f.id}
          type="button"
          role="radio"
          aria-checked={f.id === value}
          className={`pe-pick-item${f.id === value ? ' on' : ''}`}
          onClick={() => onChange(f.id)}
        >
          <b>{f.label}</b>
          <span>{f.line}</span>
        </button>
      ))}
      <p className="pe-pick-line">{FORMATS.find((f) => f.id === value)?.line}</p>
    </div>
  )
}
