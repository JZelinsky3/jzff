'use client'

// Starting a league, the way Versus and Mega Draft start a game (MatchSetup):
// switches on top, then the league they make as a card with the ways to start.
//
// The first switch is which League Mode (Joey, 2026-11-07):
//   Weekly  a pack draft every week, keepers, Standings Packs (league.ts)
//   Season  draft once, eight games against eight defenses at your own pace,
//           a bench, subs, a stat book (season.ts)
// Season can also be played solo against eleven CPU teams, with no account.

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { LEAGUE_SIZES, playoffFieldSize, playoffOptions, type Player } from '@/lib/packEmpire/rules'
import { SEASON_SIZES, defaultPlayoffs, seasonPlayoffOptions } from '@/lib/packEmpire/seasonRules'
import { SetupSwitch } from '../SetupSwitch'
import { TableArt } from '../TableArt'

type Format = 'weekly' | 'season'

const FORMATS: { id: Format; label: string; line: string }[] = [
  { id: 'weekly', label: 'Weekly', line: 'A pack draft every week for eight weeks. Keep a player from each, chase the Standings Packs, then a Gauntlet and a Final.' },
  { id: 'season', label: 'Season', line: 'Draft once, then eight games against eight defenses, played at your own pace. A bench, subs, a stat book, then the playoffs.' },
]

const COLOR = '#7fd3fa'

async function post(path: 'league' | 'season', body: Record<string, unknown>) {
  const res = await fetch(`/api/games/pack-empire/${path}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const out = await res.json().catch(() => null)
  if (!res.ok || !out?.ok) throw new Error(out?.error ?? 'Something went wrong.')
  return out as { id: string }
}

export function LeagueSetup({ signedIn, hands }: { signedIn: boolean; hands: Record<Format, Player[]> }) {
  const router = useRouter()
  const [format, setFormat] = useState<Format>('season')
  const [size, setSize] = useState(12)
  const [weeklyPlayoff, setWeeklyPlayoff] = useState('half')
  const [seasonPlayoff, setSeasonPlayoff] = useState<number | null>(null)
  const [visibility, setVisibility] = useState<'invite' | 'public'>('invite')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sizes = format === 'season' ? SEASON_SIZES : LEAGUE_SIZES
  const teams = sizes.includes(size) ? size : sizes[sizes.length - 1]
  const weeklyOpts = playoffOptions(teams)
  const weeklyPick = weeklyOpts.includes(weeklyPlayoff) ? weeklyPlayoff : 'half'
  const seasonPick = seasonPlayoff != null && seasonPlayoff <= teams ? seasonPlayoff : defaultPlayoffs(teams)
  const field = format === 'season' ? seasonPick : playoffFieldSize(weeklyPick, teams)
  const picked = FORMATS.find((f) => f.id === format)!

  const go = async (key: string, run: () => Promise<string>) => {
    setBusy(key)
    setError(null)
    try {
      router.push(await run())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start it.')
      setBusy(null)
    }
  }

  const create = () =>
    go('create', async () => {
      if (format === 'weekly') {
        const out = await post('league', { action: 'create', name, visibility, maxPlayers: teams, playoffSize: weeklyPick })
        return `/games/pack-empire/league/${out.id}/`
      }
      const out = await post('season', { action: 'create', kind: 'league', name, visibility, maxPlayers: teams, playoffSize: seasonPick })
      return `/games/pack-empire/league/season/${out.id}/`
    })

  const solo = () =>
    go('solo', async () => {
      const out = await post('season', { action: 'create', kind: 'solo', name: name.trim() || undefined, playoffSize: seasonPick })
      return `/games/pack-empire/league/season/${out.id}/`
    })

  const playoffLine =
    format === 'season'
      ? `${field} of ${teams} make it${2 ** Math.ceil(Math.log2(field)) > field ? ', the top seeds with byes' : ''}. Each round, both teams face the same elite defense.`
      : `${field} of ${teams} make it. ${field <= 2 ? 'Straight to the Final.' : 'One Gauntlet week halves them, then the Final.'}`

  return (
    <section className="pe-sec">
      <div className="pe-sec-head">
        <span className="pe-sec-num">§ New League</span>
        <span className="pe-sec-title">Set The League</span>
      </div>

      <div className="pe-match" style={{ '--fc': COLOR, '--fc-soft': `color-mix(in srgb, ${COLOR} 10%, transparent)` } as React.CSSProperties}>
        <div className="pe-match-pick">
          <SetupSwitch label="League" options={FORMATS} value={format} onChange={setFormat} />
          <SetupSwitch
            label="Teams"
            square
            options={sizes.map((n) => ({ id: String(n), label: String(n) }))}
            value={String(teams)}
            onChange={(v) => setSize(Number(v))}
          />
          {format === 'season' ? (
            <SetupSwitch
              label="Playoffs"
              square
              options={seasonPlayoffOptions(teams).map((n) => ({ id: String(n), label: String(n) }))}
              value={String(seasonPick)}
              onChange={(v) => setSeasonPlayoff(Number(v))}
            />
          ) : (
            <SetupSwitch
              label="Playoffs"
              square
              options={weeklyOpts.map((o) => ({ id: o, label: o === 'half' ? 'Half' : o }))}
              value={weeklyPick}
              onChange={setWeeklyPlayoff}
            />
          )}
          <SetupSwitch
            label="Joining"
            options={[
              { id: 'invite', label: 'Invite Code' },
              { id: 'public', label: 'Anyone' },
            ]}
            value={visibility}
            onChange={(v) => setVisibility(v as 'invite' | 'public')}
          />
        </div>

        <article className="pe-bp-card pe-match-card">
          <div className="pe-bp-info">
            <header className="pe-bp-card-head">
              <span className="pe-bp-card-kick">League Mode</span>
              <h2>
                {picked.label} <em>{teams} Teams</em>
              </h2>
              <dl className="pe-match-spec">
                <div>
                  <dt>Format</dt>
                  <dd>{picked.line}</dd>
                </div>
                <div>
                  <dt>Playoffs</dt>
                  <dd>{playoffLine}</dd>
                </div>
                <div>
                  <dt>Joining</dt>
                  <dd>{visibility === 'invite' ? 'By the code you send round.' : 'Listed below for anyone to join.'} Open seats can be filled with CPU teams.</dd>
                </div>
              </dl>
            </header>
            <label className="pe-field-label pe-setup-name">
              Name
              <input className="pe-input" value={name} maxLength={40} placeholder="The League" onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="pe-match-go">
              {signedIn ? (
                <button type="button" className="pe-push" disabled={!!busy || name.trim().length < 3} onClick={create}>
                  {busy === 'create' ? 'Creating' : 'Create The League'}
                </button>
              ) : (
                <a className="pe-push" href="/login?next=%2Fgames%2Fpack-empire%2Fleague%2F">
                  Sign In For A League
                </a>
              )}
              {format === 'season' && (
                <button type="button" className="pe-push pe-push--steel" disabled={!!busy} onClick={solo}>
                  {busy === 'solo' ? 'Dealing' : 'Play Solo vs 11 CPUs'}
                </button>
              )}
            </div>
            {format === 'season' && <p className="pe-note">{signedIn ? 'A solo season can go unnamed.' : 'Solo needs no account, or a name. Sign in later and the season comes with you.'}</p>}
            {error && <div className="pe-error">{error}</div>}
          </div>
          <TableArt key={format} cards={hands[format]} seats={['You', format === 'season' ? 'The League' : 'Your Friends']} tag={format === 'season' ? '8 Games · 8 Defenses' : '8 Weeks · 8 Drafts'} />
        </article>
      </div>
    </section>
  )
}

/** A code from a commissioner: Weekly and Season codes look the same, so try both. */
export function JoinAnyCode() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const clean = code.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6)

  const join = async () => {
    setBusy(true)
    setError(null)
    try {
      const out = await post('season', { action: 'join', code: clean })
      router.push(`/games/pack-empire/league/season/${out.id}/`)
      return
    } catch {
      // Not a Season code: a Weekly one, or nothing.
    }
    try {
      const out = await post('league', { action: 'join', code: clean })
      router.push(`/games/pack-empire/league/${out.id}/`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join.')
      setBusy(false)
    }
  }

  return (
    <div className="pe-panel">
      <div className="pe-kicker">Join</div>
      <div className="pe-panel-title">Have a code?</div>
      <p className="pe-panel-text">Six characters from your commissioner. Leagues take new teams until the season starts.</p>
      <div className="pe-panel-foot">
        <input
          className="pe-input pe-input--code"
          placeholder="CODE"
          aria-label="League code"
          value={clean}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && clean.length === 6 && join()}
        />
        <button type="button" className="pe-act" disabled={busy || clean.length !== 6} onClick={join}>
          Join
        </button>
        {error && <div className="pe-error">{error}</div>}
      </div>
    </div>
  )
}
