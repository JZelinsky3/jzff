// Monte Carlo season simulator for power-rankings projections.
//
// Plays out the remaining regular-season schedule many times. Each game draws
// both teams' scores from a normal distribution around their expected
// points-per-game; higher score wins. After each run the final standings are
// seeded (wins, then points-for) to decide playoff / bye / division-winner
// outcomes. Aggregating across runs yields the projection percentages.

export type SimTeam = {
  teamId: string
  division: number | null
  ppg: number // expected points per game
  startWins: number
  startLosses: number
  startPf: number
}

export type TeamProjection = {
  proj_wins: number
  proj_losses: number
  playoff_pct: number
  bye_pct: number
  conf_win_pct: number
}

export type SimOptions = {
  scoreSd: number
  playoffTeams: number
  byeTeams: number
  runs: number
}

// Box-Muller normal sample.
function gauss(mean: number, sd: number): number {
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function simulateSeason(
  teams: SimTeam[],
  remaining: { a: string; b: string }[],
  opts: SimOptions,
): Map<string, TeamProjection> {
  const ppg = new Map(teams.map((t) => [t.teamId, t.ppg]))
  const remainingCount = new Map<string, number>()
  for (const m of remaining) {
    remainingCount.set(m.a, (remainingCount.get(m.a) ?? 0) + 1)
    remainingCount.set(m.b, (remainingCount.get(m.b) ?? 0) + 1)
  }

  const tally = new Map<string, { wins: number; playoff: number; bye: number; confWin: number }>()
  for (const t of teams) tally.set(t.teamId, { wins: 0, playoff: 0, bye: 0, confWin: 0 })

  const runs = Math.max(1, opts.runs)
  for (let r = 0; r < runs; r++) {
    const wins = new Map<string, number>()
    const pf = new Map<string, number>()
    for (const t of teams) {
      wins.set(t.teamId, t.startWins)
      pf.set(t.teamId, t.startPf)
    }

    for (const m of remaining) {
      const sa = gauss(ppg.get(m.a) ?? 100, opts.scoreSd)
      const sb = gauss(ppg.get(m.b) ?? 100, opts.scoreSd)
      pf.set(m.a, (pf.get(m.a) ?? 0) + sa)
      pf.set(m.b, (pf.get(m.b) ?? 0) + sb)
      if (sa >= sb) wins.set(m.a, (wins.get(m.a) ?? 0) + 1)
      else wins.set(m.b, (wins.get(m.b) ?? 0) + 1)
    }

    // Seed final standings: wins desc, then points-for desc.
    const standings = [...teams].sort((x, y) => {
      const dw = (wins.get(y.teamId) ?? 0) - (wins.get(x.teamId) ?? 0)
      if (dw !== 0) return dw
      return (pf.get(y.teamId) ?? 0) - (pf.get(x.teamId) ?? 0)
    })

    standings.forEach((t, i) => {
      const acc = tally.get(t.teamId)!
      acc.wins += wins.get(t.teamId) ?? 0
      if (i < opts.playoffTeams) acc.playoff++
      if (i < opts.byeTeams) acc.bye++
    })

    // Division winner: best seed within each division.
    const seenDiv = new Set<number>()
    for (const t of standings) {
      if (t.division == null) continue
      if (seenDiv.has(t.division)) continue
      seenDiv.add(t.division)
      tally.get(t.teamId)!.confWin++
    }
  }

  const out = new Map<string, TeamProjection>()
  for (const t of teams) {
    const acc = tally.get(t.teamId)!
    const totalGames = t.startWins + t.startLosses + (remainingCount.get(t.teamId) ?? 0)
    const projWins = acc.wins / runs
    out.set(t.teamId, {
      proj_wins: Math.round(projWins),
      proj_losses: Math.max(0, totalGames - Math.round(projWins)),
      playoff_pct: Math.round((acc.playoff / runs) * 1000) / 10,
      bye_pct: Math.round((acc.bye / runs) * 1000) / 10,
      conf_win_pct: Math.round((acc.confWin / runs) * 1000) / 10,
    })
  }
  return out
}
