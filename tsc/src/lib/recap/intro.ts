// The words on top of a recap: the subject line and the two or three
// sentences that open it.
//
// Both lead with history when there is any, because history is the one
// thing the platforms' own recaps can't say. The subject is always built
// here from the facts, never by a model: it is the one line everybody reads.
//
// The intro is written by Groq, but on a short leash. The model sees only the
// fact lines below, and its answer is thrown away (in favour of a template
// built from the same facts) if it contains a single number that is not in
// those lines, or breaks the house rules on punctuation. A model that is
// down, rate limited or decommissioned (it has happened, see groq.ts) costs a
// slightly plainer email, never a wrong one.

import { groqChatJson, DEFAULT_GROQ_MODEL } from '@/lib/groq'
import { ordinal, pts, recordStr, seriesLine, type RecapFacts, type RecapGame } from './facts'

const winnerOf = (g: RecapGame) => (g.winner === 'a' ? g.a : g.b)
const loserOf = (g: RecapGame) => (g.winner === 'a' ? g.b : g.a)

function leagueLabel(f: RecapFacts): string {
  return f.league.name.length > 24 && f.league.abbr ? f.league.abbr : f.league.name
}

// ── Subject ───────────────────────────────────────────────────────────────

export function recapSubject(f: RecapFacts): string {
  const who = leagueLabel(f)
  const hooks = f.hooks ?? []
  const title = hooks.find((h) => h.endsWith(' title'))
  if (title) return `${title}. ${who}, week ${f.week}`

  const lead = f.phase === 'playoffs' ? `Playoffs, week ${f.week}` : `Week ${f.week}`
  const fallback = f.top ? [`${f.top.name} puts up ${pts(f.top.score)}`] : []
  const bits = hooks.length ? hooks.slice(0, 2) : fallback
  const full = `${lead} in ${who}: ${bits.join(', ')}`
  return full.length > 80 && bits.length > 1 ? `${lead} in ${who}: ${bits[0]}` : full
}

// ── Template intro ────────────────────────────────────────────────────────

// Used whenever the model's version is missing or fails a check. It has to
// read fine on its own, because some weeks it is all anybody sees.
export function templateIntro(f: RecapFacts): string {
  const parts: string[] = []
  const final = f.games.find((g) => g.kind === 'championship' && (g.winner === 'a' || g.winner === 'b'))
  if (final) {
    parts.push(`${winnerOf(final).name} is the ${f.year} champion, beating ${loserOf(final).name} by ${pts(final.margin)}.`)
  }
  if (f.records?.length) parts.push(f.records[0])
  const snap = f.games.find((g) => g.seriesNote && / snaps | has now won /.test(g.seriesNote))
  if (snap?.seriesNote) parts.push(snap.seriesNote)
  if (f.upset && parts.length < 3) {
    parts.push(`${f.upset.winner} came in at ${f.upset.winnerRecord} and beat ${f.upset.loser}, who came in at ${f.upset.loserRecord}.`)
  }
  if (f.top && parts.length < 3) {
    const card = f.teams.find((t) => t.managerId === f.top!.managerId)
    const note = card?.note && /since|Career/.test(card.note) ? ` ${card.note.replace(/\.$/, '')} for ${f.top.name}.` : ''
    parts.push(`${f.top.name} put up ${pts(f.top.score)}, the best score of week ${f.week}.${note}`)
  }
  if (f.closest && parts.length < 3) {
    parts.push(`${winnerOf(f.closest).name} beat ${loserOf(f.closest).name} by ${pts(f.closest.margin)}, the closest game of the week.`)
  }
  return parts.slice(0, 3).join(' ')
}

// ── Model intro ───────────────────────────────────────────────────────────

// Everything the model is allowed to know, one fact per line, history first.
// Every number in here is formatted exactly the way the email prints it,
// which is what lets checkIntro compare the model's numbers against these as
// plain strings.
export function factLines(f: RecapFacts): string[] {
  const out: string[] = []
  out.push(`League: ${f.league.name}. Week ${f.week} of the ${f.year} season${f.phase === 'playoffs' ? ', playoffs' : ''}.`)

  const final = f.games.find((g) => g.kind === 'championship' && (g.winner === 'a' || g.winner === 'b'))
  if (final) out.push(`${winnerOf(final).name} won the ${f.year} championship over ${loserOf(final).name}.`)
  for (const r of f.records ?? []) out.push(r)
  for (const g of f.games) if (g.seriesNote && !g.seriesNote.startsWith('First meeting')) out.push(g.seriesNote)
  for (const t of f.teams) {
    if (t.note && /Career|since/.test(t.note)) out.push(`${t.name} scored ${pts(t.score)}: ${t.note}`)
  }
  if (f.upset) {
    out.push(`Upset: ${f.upset.winner} (${f.upset.winnerRecord} going in) beat ${f.upset.loser} (${f.upset.loserRecord} going in).`)
  }

  for (const g of f.games) {
    const label =
      g.kind === 'championship' ? 'Championship: ' : g.kind === 'playoff' ? 'Playoff: ' : g.kind === 'consolation' ? 'Consolation: ' : ''
    if (g.leg?.n === 1) {
      out.push(`${label}first leg of a two-week round, ${g.a.name} ${pts(g.a.score)}, ${g.b.name} ${pts(g.b.score)}. Not decided until next week.`)
    } else if (g.winner === 'tie') {
      out.push(`${label}tie, ${g.a.name} ${pts(g.a.score)} and ${g.b.name} ${pts(g.b.score)}.`)
    } else if (g.winner) {
      const w = winnerOf(g)
      const l = loserOf(g)
      const totals =
        g.leg?.n === 2 && g.leg.totalA != null && g.leg.totalB != null
          ? ` Two-week total ${pts(g.winner === 'a' ? g.leg.totalA : g.leg.totalB)} to ${pts(g.winner === 'a' ? g.leg.totalB : g.leg.totalA)}.`
          : ''
      const series = g.series ? ` Series: ${seriesLine(g.a.name, g.b.name, g.series)}.` : ''
      out.push(`${label}${w.name} ${pts(w.score)} beat ${l.name} ${pts(l.score)}, margin ${pts(g.margin)}.${totals}${series}`)
    }
  }

  for (const a of f.awards) out.push(`${a.title}: ${a.who}, ${a.value}.`)
  for (const s of f.streaks) out.push(`${s.name} has ${s.kind === 'W' ? 'won' : 'lost'} ${s.length} straight.`)
  if (f.standings?.length) {
    const s = f.standings[0]
    out.push(`First place: ${s.name}, ${recordStr(s.wins, s.losses, s.ties)}.`)
  }
  if (f.power?.length) {
    const up = [...f.power].sort((a, b) => b.delta - a.delta)[0]
    if (up && up.delta > 0) out.push(`Power rankings: ${up.name} climbed ${up.delta} to ${ordinal(up.rank)}.`)
  }
  if (f.lineups?.efficiency) {
    const w = f.lineups.efficiency.worst
    out.push(`${w.name} left ${pts(w.left)} points on the bench.`)
  }
  const gotw = f.next?.games.find((g) => g.gotw) ?? null
  if (gotw) out.push(`Next week's game of the week: ${gotw.a.name} against ${gotw.b.name}.`)
  return out
}

const SYSTEM = [
  "You write the first paragraph of a fantasy football league's weekly recap email.",
  "The league's commissioner reads it and forwards it to the league group chat.",
  '',
  'Rules:',
  '- Two or three sentences, under 70 words in total.',
  '- Lead with league history when the facts have any (a record, a snapped run in a matchup, a career high, a best score in years). That is the part people have not already seen in their app.',
  '- Use only the facts given. Do not invent players, injuries, history, rivalries or anything else.',
  '- Any number you use must appear in the facts exactly as written there. Write numbers as digits.',
  "- Use the managers' names exactly as given.",
  '- Say things plainly, like a league-mate who read the box score. Dry humour is fine, hype is not.',
  '- No em dashes, no exclamation marks, no emojis, no hashtags, no questions.',
  '',
  'Return JSON: {"intro": "..."}',
].join('\n')

const NUMBER = /\d+(?:\.\d+)?/g

// The model's paragraph, or the reason it was rejected.
export function checkIntro(raw: string, lines: string[]): { ok: true; text: string } | { ok: false; reason: string } {
  let text = raw.replace(/\s+/g, ' ').trim()
  // The model writes scores and records with non-breaking and figure hyphens
  // ("156.5‑103.9"). Make them the plain hyphen the rest of the email uses,
  // BEFORE the dash rule below, which would otherwise turn "3–0" into "3, 0".
  text = text.replace(/(\d)\s*[‐‑‒–]\s*(\d)/g, '$1-$2').replace(/[‐‑‒]/g, '-')
  // The house rule is no em dashes anywhere. Commas are what they replace.
  text = text.replace(/\s*[—–]\s*/g, ', ').replace(/!/g, '.')
  if (text.length < 40) return { ok: false, reason: 'intro too short' }
  if (text.length > 520) return { ok: false, reason: 'intro too long' }
  if (/\p{Extended_Pictographic}/u.test(text)) return { ok: false, reason: 'intro has an emoji' }
  if (/[?#]/.test(text)) return { ok: false, reason: 'intro has a question or hashtag' }

  const allowed = new Set(lines.join(' ').match(NUMBER) ?? [])
  for (const n of text.match(NUMBER) ?? []) {
    if (!allowed.has(n)) return { ok: false, reason: `intro used a number that is not in the facts: ${n}` }
  }
  return { ok: true, text }
}

export async function writeIntro(
  f: RecapFacts,
): Promise<{ text: string; source: 'ai' | 'template'; note?: string }> {
  const key = process.env.GROQ_API_KEY_RECAPS
  if (!key) return { text: templateIntro(f), source: 'template', note: 'GROQ_API_KEY_RECAPS is not set' }

  const lines = factLines(f)
  try {
    const { data } = await groqChatJson<{ intro?: unknown }>({
      apiKey: key,
      model: process.env.GROQ_MODEL_RECAP || DEFAULT_GROQ_MODEL,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Facts:\n${lines.map((l) => `- ${l}`).join('\n')}` },
      ],
      temperature: 0.5,
      maxTokens: 900,
      seed: f.year * 100 + f.week,
      maxRetries: 2,
    })
    const checked = checkIntro(typeof data.intro === 'string' ? data.intro : '', lines)
    if (checked.ok) return { text: checked.text, source: 'ai' }
    return { text: templateIntro(f), source: 'template', note: checked.reason }
  } catch (e) {
    return { text: templateIntro(f), source: 'template', note: (e as Error).message.slice(0, 200) }
  }
}
