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
import { pts, type RecapFacts, type RecapGame } from './facts'

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

// ── Written intro ─────────────────────────────────────────────────────────

// The default intro: two or three sentences picked from the facts by how
// strong a story they are, then put back in reading order. Every word comes
// from this file and every number from facts.ts, so it can't misstate
// anything. (The model version below kept doing exactly that: "Connie
// snapping CAT's run" when Connie extended her own; "a personal best" for a
// best-since-2024.)
export function templateIntro(f: RecapFacts): string {
  type Line = { text: string; weight: number; order: number }
  const lines: Line[] = []
  const final = f.games.find((g) => g.kind === 'championship' && (g.winner === 'a' || g.winner === 'b'))
  if (final) {
    lines.push({
      text: `${winnerOf(final).name} won the ${f.year} title, beating ${loserOf(final).name} ${pts(winnerOf(final).score)} to ${pts(loserOf(final).score)}.`,
      weight: 100,
      order: 0,
    })
  }
  const leagueRecord = (f.records ?? []).find((r) => /in league history/.test(r))
  if (leagueRecord) lines.push({ text: leagueRecord, weight: 88, order: 1 })

  if (f.top) {
    const card = f.teams.find((t) => t.managerId === f.top!.managerId)
    const note = card?.note ?? ''
    const extra = /^Career high/.test(note)
      ? `, a career high for ${f.top.name}`
      : /^Best score since/.test(note)
        ? `, ${f.top.name}'s best since ${note.replace(/\D+/g, '')}`
        : ''
    const covered = !!leagueRecord && leagueRecord.startsWith(`${f.top.name}'s`)
    if (!covered) {
      lines.push({ text: `${f.top.name} put up ${pts(f.top.score)}, the best score of week ${f.week}${extra}.`, weight: extra ? 60 : 25, order: 2 })
    }
  }

  const snap = f.games.find((g) => g.seriesNote && / snaps /.test(g.seriesNote))
  if (snap?.seriesNote) lines.push({ text: snap.seriesNote, weight: 72, order: 3 })
  const run = f.games.find((g) => g.seriesNote && / has now won /.test(g.seriesNote))
  if (run?.seriesNote) lines.push({ text: run.seriesNote, weight: 45, order: 4 })

  if (f.upset) {
    lines.push({
      text: `${f.upset.winner} came in at ${f.upset.winnerRecord} and beat ${f.upset.loser}, who came in at ${f.upset.loserRecord}.`,
      weight: 50,
      order: 5,
    })
  }
  const start = (f.records ?? []).find((r) => /teams that started/.test(r))
  if (start) lines.push({ text: start, weight: 40, order: 6 })

  if (f.closest && f.closest.margin < 2) {
    lines.push({
      text: `${winnerOf(f.closest).name} beat ${loserOf(f.closest).name} by ${pts(f.closest.margin)}.`,
      weight: 35,
      order: 7,
    })
  }

  return lines
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .sort((a, b) => a.order - b.order)
    .map((l) => l.text)
    .join(' ')
}

// ── Model intro ───────────────────────────────────────────────────────────

// What the model is allowed to know: the handful of strongest facts, each a
// complete sentence that stands on its own. It used to get every result,
// award and series line as well, and with that much in front of it, it
// started fusing them ("Connie snapping CAT's run" when Connie had extended
// her own). A model can't misread a fact it was never shown. Every number in
// here is formatted the way the email prints it, which is what lets
// checkIntro compare the model's numbers against these as plain strings.
export function factLines(f: RecapFacts): string[] {
  const out: string[] = []
  const final = f.games.find((g) => g.kind === 'championship' && (g.winner === 'a' || g.winner === 'b'))
  if (final) {
    out.push(`${winnerOf(final).name} won the ${f.year} championship, beating ${loserOf(final).name} ${pts(winnerOf(final).score)} to ${pts(loserOf(final).score)}.`)
  }
  for (const r of (f.records ?? []).slice(0, 2)) out.push(r)
  for (const g of f.games) {
    if (out.length >= 4) break
    if (g.seriesNote && / snaps | has now won /.test(g.seriesNote)) out.push(g.seriesNote)
  }
  const marks = f.teams
    .filter((t) => t.note && /Career|since/.test(t.note))
    .slice(0, 2)
    .map((t) => {
      const note = t.note!.replace(/\.$/, '')
      return /^Career/.test(note)
        ? `${t.name} scored ${pts(t.score)}, ${t.name}'s own ${note.toLowerCase()}.`
        : `${t.name} scored ${pts(t.score)}, ${t.name}'s own ${note.charAt(0).toLowerCase()}${note.slice(1)}.`
    })
  out.push(...marks)
  if (f.upset) {
    out.push(`The upset: ${f.upset.winner}, ${f.upset.winnerRecord} going in, beat ${f.upset.loser}, ${f.upset.loserRecord} going in, ${pts(f.upset.winnerScore)} to ${pts(f.upset.loserScore)}.`)
  }
  if (f.top && !out.some((l) => l.startsWith(`${f.top!.name} scored`))) {
    out.push(`${f.top.name} had the top score of the week, ${pts(f.top.score)}.`)
  }
  if (f.closest && out.length < 6) {
    out.push(`The closest game: ${winnerOf(f.closest).name} beat ${loserOf(f.closest).name} by ${pts(f.closest.margin)}.`)
  }
  return out.slice(0, 7)
}

const SYSTEM = [
  "You write the first paragraph of a fantasy football league's weekly recap email.",
  "The league's commissioner reads it and forwards it to the league group chat.",
  '',
  'Rules:',
  '- Two or three sentences, under 60 words in total.',
  '- Use only the facts given, and keep each one exactly as true as it is written. Rephrase, never reinterpret.',
  '- Do not combine two facts into a claim that neither of them makes. If a fact says someone extended a run, they did not snap one.',
  '- Only call a game an upset, or a run snapped, when a fact says so in those words.',
  '- Lead with league history when the facts have any.',
  '- Any number you use must appear in the facts exactly as written there. Write numbers as digits.',
  "- Use the managers' names exactly as given. Do not use he, she, his or her; repeat the name instead.",
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

// Claims a model likes to make that the facts may not support. Each one is
// only allowed when the facts themselves use one of the listed words.
const CLAIMS: { said: RegExp; facts: RegExp }[] = [
  { said: /personal (best|worst)|personal-best|lifetime/i, facts: /(?!)/ },
  { said: /career[- ](high|low|best|worst)/i, facts: /Career (high|low)|career high|career low/i },
  { said: /\b(snap|snaps|snapped|snapping|broke|ended|ending|ends)\b/i, facts: /\bsnaps\b/ },
  { said: /\bupset\b/i, facts: /\bupset\b/i },
  { said: /\b(record|all-time|ever|history|historic)\b/i, facts: /league history|record/ },
  { said: /\b(streak|straight|in a row)\b/i, facts: /straight|run/ },
  { said: /\bfirst time\b/i, facts: /(?!)/ },
]

export function checkClaims(text: string, lines: string[]): string | null {
  const facts = lines.join(' ')
  for (const c of CLAIMS) {
    const m = text.match(c.said)
    if (m && !c.facts.test(facts)) return `intro claims "${m[0]}", which no fact supports`
  }
  return null
}

// Off unless RECAP_AI_INTRO=on. When on, the model gets the short fact list,
// and its answer must pass the number check and the claim check, or the
// written intro is used instead.
export async function writeIntro(
  f: RecapFacts,
): Promise<{ text: string; source: 'ai' | 'template'; note?: string }> {
  if ((process.env.RECAP_AI_INTRO ?? '').toLowerCase() !== 'on') return { text: templateIntro(f), source: 'template' }
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
      // Reasoning tokens count against this; 900 ran out on longer fact lists
      // and came back as json_validate_failed.
      maxTokens: 1400,
      seed: f.year * 100 + f.week,
      maxRetries: 2,
    })
    const checked = checkIntro(typeof data.intro === 'string' ? data.intro : '', lines)
    if (!checked.ok) return { text: templateIntro(f), source: 'template', note: checked.reason }
    const claim = checkClaims(checked.text, lines)
    if (claim) return { text: templateIntro(f), source: 'template', note: claim }
    return { text: checked.text, source: 'ai' }
  } catch (e) {
    return { text: templateIntro(f), source: 'template', note: (e as Error).message.slice(0, 200) }
  }
}
