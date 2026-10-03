// Per-league visit counting, shared by the almanac route's inline script
// and <LeagueVisitPing />. Client-safe: no server imports.

// The browser's anonymous id, kept in localStorage. Same origin for the
// almanac and the React league pages, so one browser is one visitor across
// both.
export const LEAGUE_VISIT_KEY = 'tsc_vid'

// Inline script for the static almanac pages. Same behaviour as
// LeagueVisitPing: skip entirely when storage is unavailable.
export function leagueVisitScript(slug: string): string {
  const s = JSON.stringify(slug).replace(/</g, '\\u003c')
  return (
    `<script>(function(){var v;try{v=localStorage.getItem('${LEAGUE_VISIT_KEY}');` +
    `if(!v){v=crypto.randomUUID?crypto.randomUUID():(Date.now().toString(36)+Math.random().toString(36).slice(2));` +
    `localStorage.setItem('${LEAGUE_VISIT_KEY}',v)}}catch(e){return}` +
    `fetch('/api/visit/league',{method:'POST',headers:{'Content-Type':'application/json'},` +
    `body:JSON.stringify({slug:${s},vid:v}),keepalive:true}).catch(function(){})})()</script>`
  )
}
