// How close today's bonus pack is. Wins from any Locker game count.

export function WinMeter({ wins, need, bonus }: { wins: number; need: number; bonus: 'earning' | 'waiting' | 'opened' }) {
  const line =
    bonus === 'earning' ? `${Math.min(wins, need)} of ${need} wins today` : bonus === 'waiting' ? 'Bonus Pack earned' : 'Bonus Pack opened, back tomorrow'
  return (
    <div className="pe-lk-meter" data-done={bonus === 'earning' ? undefined : ''}>
      <span className="pe-lk-meter-line">{line}</span>
      <span className="pe-lk-pips" aria-hidden>
        {Array.from({ length: need }, (_, i) => (
          <i key={i} data-on={i < wins ? '' : undefined} />
        ))}
      </span>
    </div>
  )
}
