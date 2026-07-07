// NFL team accent colors, keyed by canonical abbr (see normTeam in nflLive).
// Used for player chips and NFL strip tinting when the ESPN payload doesn't
// carry a color (demo mode synthesizes games without them).

const COLORS: Record<string, string> = {
  ARI: '#97233f', ATL: '#a71930', BAL: '#241773', BUF: '#00338d',
  CAR: '#0085ca', CHI: '#0b162a', CIN: '#fb4f14', CLE: '#311d00',
  DAL: '#041e42', DEN: '#fb4f14', DET: '#0076b6', GB: '#203731',
  HOU: '#03202f', IND: '#002c5f', JAX: '#006778', KC: '#e31837',
  LAC: '#0080c6', LAR: '#003594', LV: '#a5acaf', MIA: '#008e97',
  MIN: '#4f2683', NE: '#002244', NO: '#d3bc8d', NYG: '#0b2265',
  NYJ: '#125740', PHI: '#004c54', PIT: '#ffb612', SEA: '#69be28',
  SF: '#aa0000', TB: '#d50a0a', TEN: '#4b92db', WAS: '#5a1414',
}

export function teamColor(abbr: string | null | undefined): string {
  if (!abbr) return '#3b82ff'
  return COLORS[abbr.toUpperCase()] ?? '#3b82ff'
}
