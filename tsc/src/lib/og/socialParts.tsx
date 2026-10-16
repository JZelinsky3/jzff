// Shared pieces of the social cards: the paper stocks and the masthead flag.

export type Stock = {
  bg: string
  ink: string
  mute: string
  rule: string
  accent: string
  /** The flag's text, on the accent. */
  onAccent: string
  /** Gridlines on the chart stocks. */
  grid: string
}

// Newsprint: cream paper, ink, one red.
export const CREAM: Stock = { bg: '#f2e9d6', ink: '#16130f', mute: '#6b5d44', rule: '#cdbf9f', accent: '#a3271d', onAccent: '#f2e9d6', grid: '#e2d6bb' }
// The salmon of a sports section.
export const SALMON: Stock = { bg: '#f3d3bf', ink: '#1f1410', mute: '#7a5444', rule: '#d8ad97', accent: '#a11d14', onAccent: '#f6e3d6', grid: '#e9c0aa' }
// The night edition: ink paper, cream type, a warm red and a gold.
export const NIGHT: Stock = { bg: '#15120e', ink: '#f2e9d6', mute: '#a5967a', rule: '#3b3328', accent: '#e2694f', onAccent: '#15120e', grid: '#2a241c' }
// Chart paper: pale green-grey with a fine grid.
export const GRAPH: Stock = { bg: '#eceee4', ink: '#16130f', mute: '#5c6354', rule: '#c4cbb6', accent: '#a3271d', onAccent: '#eceee4', grid: '#d9ddcd' }
// Navy, for the season-by-season columns.
export const NAVY: Stock = { bg: '#13213a', ink: '#ece4ce', mute: '#8e9bb3', rule: '#2c3c5c', accent: '#e2694f', onAccent: '#13213a', grid: '#22324f' }

export const GOLD = '#e0b45c'

export function flag(s: Stock, label: string, right?: string) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', background: s.accent, color: s.onAccent, fontFamily: 'JetBrains', fontWeight: 700, fontSize: 26, letterSpacing: 4, padding: '10px 18px' }}>
        {label.toUpperCase()}
      </div>
      {right ? (
        <div style={{ display: 'flex', fontFamily: 'JetBrains', fontWeight: 700, fontSize: 26, letterSpacing: 4, color: s.ink }}>{right.toUpperCase()}</div>
      ) : null}
    </div>
  )
}

export function doubleRule(s: Stock) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginTop: 26 }}>
      <div style={{ display: 'flex', height: 4, background: s.ink }} />
      <div style={{ display: 'flex', height: 1, background: s.ink, marginTop: 4 }} />
    </div>
  )
}

