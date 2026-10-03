'use client'

// A line in the recap section about next week's Game of the Week. The
// Tuesday recap's look at the week ahead leads with it, so one set early is
// one more thing in the paper and a game for the league to talk about all
// week. "Set week N" flips the picker above to that week and scrolls to it
// (GotwPicker listens for the event).

export const GOTW_WEEK_EVENT = 'tsc:gotw-week'

export function GotwTip({
  week,
  matchup,
  variant = 'desktop',
}: {
  week: number
  // "A vs B" when that week's game is already set.
  matchup: string | null
  variant?: 'desktop' | 'mobile'
}) {
  const cls = variant === 'mobile' ? 'mrc-tip' : 'lo-rc-tip'

  function go() {
    window.dispatchEvent(new CustomEvent(GOTW_WEEK_EVENT, { detail: week }))
    document.getElementById('gotw')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (matchup) {
    return (
      <div className={`${cls} set`}>
        <span>
          <b>Week {week} Game of the Week:</b> {matchup}.{' '}
          {variant === 'mobile' ? 'The recap leads with it.' : 'The recap leads its look at the week ahead with it.'}
        </span>
      </div>
    )
  }
  return (
    <div className={cls}>
      <span>
        <b>No Game of the Week for week {week} yet.</b>{' '}
        {variant === 'mobile'
          ? 'Set it early and the recap leads with it.'
          : 'Set it ahead of time and the Tuesday recap leads its look at the week ahead with it, which gives the league one game to talk about all week.'}
      </span>
      <button type="button" className="lo-btn-ghost xs" onClick={go}>
        Set week {week}
      </button>
    </div>
  )
}
