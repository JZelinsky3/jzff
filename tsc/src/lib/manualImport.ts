// Parsing and validation for hand-entered season data.
//
// The importer accepts whatever a commissioner can get out of a spreadsheet or
// an old screenshot: CSV, tab-separated (what you get pasting straight out of
// Excel or Google Sheets), or pipe-separated. Column order is not fixed and
// header wording varies wildly between platforms and people, so each stage
// declares the headers it understands and everything is matched loosely:
// lowercased, punctuation and spaces stripped.
//
// Nothing here touches the database. It turns text into typed rows plus a list
// of problems, so the import page can show a real preview before anything is
// written, and so this file can be reasoned about on its own.

export type ImportKind = 'standings' | 'drafts' | 'matchups'

export type ParseIssue = {
  // 1-based line number in the pasted text, counting the header, so the number
  // matches what the user sees in their spreadsheet.
  line: number
  message: string
}

export type StandingsRow = {
  team: string
  wins: number
  losses: number
  ties: number
  pointsFor: number | null
  pointsAgainst: number | null
  finalRank: number | null
  regularRank: number | null
}

export type DraftRow = {
  round: number
  pick: number
  team: string
  player: string
  position: string | null
  nflTeam: string | null
}

export type MatchupRow = {
  week: number
  teamA: string
  scoreA: number | null
  teamB: string
  scoreB: number | null
  isPlayoff: boolean
  isChampionship: boolean
}

export type ParsedImport =
  | { kind: 'standings'; rows: StandingsRow[]; issues: ParseIssue[]; teamNames: string[] }
  | { kind: 'drafts'; rows: DraftRow[]; issues: ParseIssue[]; teamNames: string[] }
  | { kind: 'matchups'; rows: MatchupRow[]; issues: ParseIssue[]; teamNames: string[] }

// ─── Text → grid ──────────────────────────────────────────────────────────

// Splits one delimited line, honoring double quotes so a team name like
// "Hangin' With Hernandez, Jr" survives a comma-separated file.
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      // A doubled quote inside a quoted field is a literal quote.
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuotes = !inQuotes
      continue
    }
    if (ch === delimiter && !inQuotes) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  out.push(cur)
  return out.map((c) => c.trim())
}

// Pick the delimiter by which one yields the most columns on the header line.
// Tabs first: a paste out of a spreadsheet is tab-separated and often contains
// commas inside team names, so guessing comma there would shred it.
function detectDelimiter(headerLine: string): string {
  const counts: Array<[string, number]> = [
    ['\t', headerLine.split('\t').length],
    [',', headerLine.split(',').length],
    ['|', headerLine.split('|').length],
    [';', headerLine.split(';').length],
  ]
  counts.sort((a, b) => b[1] - a[1])
  return counts[0][1] > 1 ? counts[0][0] : ','
}

const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Loose name key: case, spacing, punctuation and a leading "the" all ignored. */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]/g, '')
}

// Column aliases per field. First match in the header wins.
const ALIASES: Record<string, string[]> = {
  team: ['team', 'teamname', 'manager', 'owner', 'franchise', 'name', 'draftedby', 'managername'],
  // A standings table usually has either W / L / T columns or one packed
  // "10-4" record column; both are read.
  record: ['record', 'wl', 'wlt', 'winloss', 'recordwlt', 'overall'],
  wins: ['wins', 'w', 'win'],
  losses: ['losses', 'l', 'loss', 'lost'],
  ties: ['ties', 't', 'tie', 'd', 'draws'],
  pointsFor: ['pointsfor', 'pf', 'points', 'pointsscored', 'ptsfor', 'scored'],
  pointsAgainst: ['pointsagainst', 'pa', 'ptsagainst', 'againstpoints', 'allowed'],
  finalRank: ['finalrank', 'finish', 'place', 'finalplace', 'standing', 'rank'],
  regularRank: ['regularrank', 'regrank', 'seed', 'regularseasonrank', 'regseasonrank'],
  round: ['round', 'rd', 'rnd'],
  pick: ['pick', 'overall', 'overallpick', 'picknumber', 'no', 'num'],
  player: ['player', 'playername', 'selection', 'pick', 'drafted'],
  position: ['position', 'pos'],
  nflTeam: ['nflteam', 'nfl', 'proteam', 'protm', 'realteam', 'nfltm'],
  week: ['week', 'wk', 'w'],
  teamA: ['teama', 'team1', 'home', 'hometeam', 'awayteam1', 'left'],
  scoreA: ['scorea', 'score1', 'homescore', 'pointsa', 'ptsa'],
  teamB: ['teamb', 'team2', 'away', 'awayteam', 'right'],
  scoreB: ['scoreb', 'score2', 'awayscore', 'pointsb', 'ptsb'],
  isPlayoff: ['isplayoff', 'playoff', 'playoffs', 'postseason'],
  isChampionship: ['ischampionship', 'championship', 'final', 'title', 'titlegame'],
}

type ColumnMap = Record<string, number>

function mapColumns(headers: string[]): ColumnMap {
  const normalized = headers.map(normalizeHeader)
  const map: ColumnMap = {}
  for (const [field, aliases] of Object.entries(ALIASES)) {
    for (const alias of aliases) {
      const idx = normalized.indexOf(alias)
      if (idx !== -1 && !Object.values(map).includes(idx)) { map[field] = idx; break }
    }
  }
  // 'pick' is an alias of both the pick number and the player selected. If both
  // claimed it, the numeric meaning wins only when a dedicated player column
  // exists; otherwise the column holding names is the player.
  if (map.pick !== undefined && map.player === map.pick) delete map.player
  return map
}

const cell = (cols: string[], idx: number | undefined): string =>
  idx === undefined ? '' : (cols[idx] ?? '').trim()

// Numbers arrive with commas, stray currency-ish characters, and sometimes a
// trailing asterisk from a copied table. Blank stays blank rather than 0, so a
// missing points column is reported as unknown instead of silently zeroed.
function toNumber(raw: string): number | null {
  if (!raw) return null
  const cleaned = raw.replace(/[^0-9.\-]/g, '')
  if (!cleaned || cleaned === '-' || cleaned === '.') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

const toInt = (raw: string): number | null => {
  const n = toNumber(raw)
  return n === null ? null : Math.trunc(n)
}

const toBool = (raw: string): boolean => {
  const v = raw.trim().toLowerCase()
  return v === 'y' || v === 'yes' || v === 'true' || v === '1' || v === 'x'
}

// A "W-L-T" or "10-4" record packed into one column, which is how most
// standings screenshots are laid out.
function parseRecord(raw: string): { wins: number; losses: number; ties: number } | null {
  const m = raw.match(/^(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?$/)
  if (!m) return null
  return { wins: Number(m[1]), losses: Number(m[2]), ties: m[3] ? Number(m[3]) : 0 }
}

// ─── Public entry point ───────────────────────────────────────────────────

export function parseImport(kind: ImportKind, text: string): ParsedImport {
  const issues: ParseIssue[] = []
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0)

  if (lines.length === 0) {
    return { kind, rows: [], issues: [{ line: 0, message: 'Nothing to import.' }], teamNames: [] } as ParsedImport
  }

  const delimiter = detectDelimiter(lines[0])
  const headers = splitLine(lines[0], delimiter)
  const cols = mapColumns(headers)
  const body = lines.slice(1)

  if (body.length === 0) {
    issues.push({ line: 1, message: 'Found a header row but no data rows under it.' })
  }

  const teamNames = new Set<string>()
  const seen = (name: string) => { if (name) teamNames.add(name) }

  if (kind === 'standings') {
    const rows: StandingsRow[] = []
    if (cols.team === undefined) {
      issues.push({ line: 1, message: `No team column found. Headers read: ${headers.join(', ') || '(none)'}` })
    }
    body.forEach((line, i) => {
      const lineNo = i + 2
      const c = splitLine(line, delimiter)
      const team = cell(c, cols.team)
      if (!team) { issues.push({ line: lineNo, message: 'Row has no team name; skipped.' }); return }

      // Either W / L / T columns, or one packed "10-4" record column, which
      // may be headed "record" or may simply be what the wins column holds.
      let wins = toInt(cell(c, cols.wins))
      let losses = toInt(cell(c, cols.losses))
      let ties = toInt(cell(c, cols.ties)) ?? 0
      const packed = parseRecord(cell(c, cols.record)) ?? parseRecord(cell(c, cols.wins))
      if (packed) { wins = packed.wins; losses = packed.losses; ties = packed.ties }

      if (wins === null || losses === null) {
        issues.push({ line: lineNo, message: `${team}: could not read a win-loss record; skipped.` })
        return
      }
      seen(team)
      rows.push({
        team,
        wins,
        losses,
        ties,
        pointsFor: toNumber(cell(c, cols.pointsFor)),
        pointsAgainst: toNumber(cell(c, cols.pointsAgainst)),
        finalRank: toInt(cell(c, cols.finalRank)),
        regularRank: toInt(cell(c, cols.regularRank)),
      })
    })

    const dupes = duplicates(rows.map((r) => nameKey(r.team)))
    for (const d of dupes) issues.push({ line: 0, message: `Team "${d}" appears more than once; only the last row will be kept.` })
    return { kind, rows, issues, teamNames: [...teamNames] }
  }

  if (kind === 'drafts') {
    const rows: DraftRow[] = []
    if (cols.team === undefined) issues.push({ line: 1, message: `No team column found. Headers read: ${headers.join(', ') || '(none)'}` })
    if (cols.player === undefined) issues.push({ line: 1, message: 'No player column found.' })

    let running = 0
    body.forEach((line, i) => {
      const lineNo = i + 2
      const c = splitLine(line, delimiter)
      const team = cell(c, cols.team)
      const player = cell(c, cols.player)
      if (!team || !player) { issues.push({ line: lineNo, message: 'Row is missing a team or a player; skipped.' }); return }
      running++
      // Pick and round both fall back to the order rows were given in, which is
      // how a copied draft board usually reads: top to bottom, snake included.
      const pick = toInt(cell(c, cols.pick)) ?? running
      const round = toInt(cell(c, cols.round)) ?? 0
      seen(team)
      rows.push({
        round,
        pick,
        team,
        player,
        position: cell(c, cols.position) || null,
        nflTeam: cell(c, cols.nflTeam) || null,
      })
    })

    // Rounds left blank are derived once the roster size is known: the number of
    // distinct teams is the round length for a normal draft.
    if (rows.length > 0 && rows.every((r) => r.round === 0)) {
      const teamCount = new Set(rows.map((r) => nameKey(r.team))).size
      if (teamCount > 0) for (const r of rows) r.round = Math.floor((r.pick - 1) / teamCount) + 1
    }
    const dupePicks = duplicates(rows.map((r) => String(r.pick)))
    for (const p of dupePicks) issues.push({ line: 0, message: `Pick ${p} appears more than once; only the last one will be kept.` })
    return { kind, rows, issues, teamNames: [...teamNames] }
  }

  const rows: MatchupRow[] = []
  for (const field of ['week', 'teamA', 'teamB'] as const) {
    if (cols[field] === undefined) {
      issues.push({ line: 1, message: `No ${field === 'week' ? 'week' : field === 'teamA' ? 'first team' : 'second team'} column found. Headers read: ${headers.join(', ') || '(none)'}` })
    }
  }
  body.forEach((line, i) => {
    const lineNo = i + 2
    const c = splitLine(line, delimiter)
    const week = toInt(cell(c, cols.week))
    const teamA = cell(c, cols.teamA)
    const teamB = cell(c, cols.teamB)
    if (week === null) { issues.push({ line: lineNo, message: 'Row has no week number; skipped.' }); return }
    if (!teamA || !teamB) { issues.push({ line: lineNo, message: `Week ${week}: row is missing a team; skipped.` }); return }
    if (nameKey(teamA) === nameKey(teamB)) {
      issues.push({ line: lineNo, message: `Week ${week}: "${teamA}" is listed against itself; skipped.` })
      return
    }
    seen(teamA); seen(teamB)
    rows.push({
      week,
      teamA,
      scoreA: toNumber(cell(c, cols.scoreA)),
      teamB,
      scoreB: toNumber(cell(c, cols.scoreB)),
      isPlayoff: toBool(cell(c, cols.isPlayoff)),
      isChampionship: toBool(cell(c, cols.isChampionship)),
    })
  })
  const titleGames = rows.filter((r) => r.isChampionship)
  if (titleGames.length > 1) {
    issues.push({ line: 0, message: `${titleGames.length} games are marked as the championship; only one can be.` })
  }
  return { kind, rows, issues, teamNames: [...teamNames] }
}

function duplicates(keys: string[]): string[] {
  const count = new Map<string, number>()
  for (const k of keys) count.set(k, (count.get(k) ?? 0) + 1)
  return [...count.entries()].filter(([, n]) => n > 1).map(([k]) => k)
}

// ─── Name matching ────────────────────────────────────────────────────────

export type KnownManager = {
  id: string
  displayName: string
  teamName: string | null
  /** Every team name this manager has used, across seasons. */
  aliases: string[]
}

export type NameMatch = {
  name: string
  managerId: string | null
  /** How the match was made, so the UI can flag the guesses. */
  via: 'team' | 'display' | 'alias' | 'none'
}

/**
 * Resolves each imported team name to an existing manager. Exact-ish matching
 * only (see nameKey): a fuzzy match that silently attributes a season to the
 * wrong manager is far worse than asking, so anything unmatched comes back
 * with managerId null for the user to map by hand.
 */
export function matchNames(names: string[], managers: KnownManager[]): NameMatch[] {
  const byTeam = new Map<string, string>()
  const byDisplay = new Map<string, string>()
  const byAlias = new Map<string, string>()
  for (const m of managers) {
    if (m.teamName) byTeam.set(nameKey(m.teamName), m.id)
    byDisplay.set(nameKey(m.displayName), m.id)
    for (const a of m.aliases) if (a) byAlias.set(nameKey(a), m.id)
  }
  return names.map((name) => {
    const key = nameKey(name)
    const team = byTeam.get(key)
    if (team) return { name, managerId: team, via: 'team' as const }
    const display = byDisplay.get(key)
    if (display) return { name, managerId: display, via: 'display' as const }
    const alias = byAlias.get(key)
    if (alias) return { name, managerId: alias, via: 'alias' as const }
    return { name, managerId: null, via: 'none' as const }
  })
}

// ─── Templates ────────────────────────────────────────────────────────────

/** The header row plus one example, offered as a download on the import page. */
export const TEMPLATES: Record<ImportKind, string> = {
  standings: [
    'team,wins,losses,ties,points_for,points_against,final_rank,regular_rank',
    'Rafi Bombs,10,4,0,1600.04,1372.56,1,2',
  ].join('\n'),
  drafts: [
    'round,pick,team,player,position,nfl_team',
    '1,1,Rafi Bombs,Christian McCaffrey,RB,SF',
  ].join('\n'),
  matchups: [
    'week,team_a,score_a,team_b,score_b,playoff,championship',
    '1,Rafi Bombs,112.4,WingIT,98.2,,',
  ].join('\n'),
}

export const KIND_LABELS: Record<ImportKind, string> = {
  standings: 'Season standings',
  drafts: 'Draft board',
  matchups: 'Weekly matchups',
}
