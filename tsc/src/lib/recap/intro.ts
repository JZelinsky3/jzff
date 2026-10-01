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
import type { RecapFacts } from './facts'
import { leagueLabel, writeEdition } from './story'

// ── Subject ───────────────────────────────────────────────────────────────

// The paper's own headline, so the inbox and the page lead with the same
// story.
export function recapSubject(f: RecapFacts): string {
  const who = leagueLabel(f)
  const headline = writeEdition(f).front.headline
  if (/ wins the \d{4} title$/.test(headline)) return `${headline}. ${who}, week ${f.week}`
  const lead = f.phase === 'playoffs' ? `Playoffs, week ${f.week}` : `Week ${f.week}`
  return `${lead} in ${who}: ${headline}`
}

// ── Written intro ─────────────────────────────────────────────────────────

// The default intro: the opening paragraph of the paper's lead story
// (./story.ts). It is what the page's link preview and the stored recap
// carry, so the inbox, the preview and the page all open on the same words.
export function templateIntro(f: RecapFacts): string {
  return writeEdition(f).front.paragraphs[0] ?? ''
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
  const front = writeEdition(f).front
  return front.paragraphs
    .flatMap((p) => p.split(/(?<=\.)\s+(?=[A-Z0-9])/))
    .filter((l) => !/^Up next/.test(l))
    .slice(0, 7)
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
