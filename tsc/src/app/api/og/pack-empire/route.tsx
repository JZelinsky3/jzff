// Every Pack Empire link preview, one route, one picture per state of the game.
//
//   ?c=home|builder|versus|mega|league|daily|board|binder|profile   a mode's page
//   ?c=vs&id=      a challenge: invite, waiting on a score, live or final
//   ?c=mg&id=      a Mega Draft: open seat, live or final
//   ?c=lg&id=      a league: joining, in season or finished
//   ?c=run&id=     a Builder score
//   ?c=day&r=      a Daily score, off its signed link
//   ?c=fr&t=       a friend invite
//
// The room's own type: DM Serif for the words and Orbitron for the numbers, on a
// dark ground in each mode's colour. Text left, object right. The game cards sit
// on a stage rendered once into public/og/pack-empire: real cards bursting out of
// the real torn pack (scripts/pack-empire-fx/og-stages.mjs). Everything else gets
// rays.png over its colour.
//
// iMessage lays a bar over the bottom of the card (title and link) and tints it
// from the picture. So nothing that matters goes in the bottom 84px, and that
// strip is the top bar's colour, solid: the bar has to read as its own colour.
// It used to fade into the ground, and the bar melted into the middle of the card.
//
// Satori traps, all hit on other cards: every helper here is CALLED, never used
// as a <Component>, because a component returning mapped children hangs the
// renderer. A fragment counts as one flex child. Thin bars need flexShrink: 0.
// A style set to undefined throws, so optional styles are spread in. Glyphs must
// exist in the fonts loaded here.

import { readFile } from 'fs/promises'
import path from 'path'
import { ImageResponse } from 'next/og'
import { loadBoard } from '@/lib/minigames/leaderboard'
import { inviteOwner } from '@/lib/friends'
import { dailyScoreLine, dailySpec, longDate } from '@/lib/packEmpire/daily'
import { loadFaces } from '@/lib/packEmpire/faces'
import { getMega } from '@/lib/packEmpire/mega'
import { getVersus } from '@/lib/packEmpire/versus'
import { leagueView } from '@/lib/packEmpire/league'
import { POOL_SIZE } from '@/lib/packEmpire/pool'
import {
  DIFFICULTY_LOOK,
  PHASE_LABEL,
  RARITY_LOOK,
  REGULAR_WEEKS,
  tierFor,
  type Player,
  type Rarity,
} from '@/lib/packEmpire/rules'
import { loadRun, readDaily } from '@/lib/packEmpire/share'

export const runtime = 'nodejs'

const W = 1200
const H = 630
const BAR_TOP = 12
const BAR_FOOT = 84

const CREAM = '#f4ead6'
const MUTE = '#a79d8b'
const DIM = '#6f675a'
const AMBER = '#e8a84b'
const GREEN = '#68c88a'

const MODE = {
  builder: AMBER,
  versus: '#e2725b',
  mega: '#5fb3e8',
  league: '#b48cf0',
  daily: '#4fc3b0',
  board: AMBER,
  binder: '#e0b65c',
  friends: '#e8a84b',
}

const FONT_DIR = path.join(process.cwd(), 'public', 'og', 'fonts')
const ART_DIR = path.join(process.cwd(), 'public', 'og', 'pack-empire')

let fontsLoaded: Promise<NonNullable<ConstructorParameters<typeof ImageResponse>[1]>['fonts']> | null = null

function loadFonts() {
  fontsLoaded ??= (async () => {
    const file = (f: string) => readFile(path.join(FONT_DIR, f))
    const [serif, serifItalic, mono, monoBold, orbitron, barlow] = await Promise.all([
      file('DMSerifDisplay-Regular.ttf'),
      file('DMSerifDisplay-Italic.ttf'),
      file('JetBrainsMono-Regular.ttf'),
      file('JetBrainsMono-Bold.ttf'),
      file('Orbitron-ExtraBold.ttf'),
      file('BarlowCondensed-Bold.ttf'),
    ])
    return [
      { name: 'Serif', data: serif, style: 'normal' as const, weight: 400 as const },
      { name: 'Serif', data: serifItalic, style: 'italic' as const, weight: 400 as const },
      { name: 'Mono', data: mono, style: 'normal' as const, weight: 400 as const },
      { name: 'Mono', data: monoBold, style: 'normal' as const, weight: 700 as const },
      { name: 'Orbitron', data: orbitron, style: 'normal' as const, weight: 800 as const },
      { name: 'Barlow', data: barlow, style: 'normal' as const, weight: 700 as const },
    ]
  })()
  return fontsLoaded
}

const artCache = new Map<string, Promise<string>>()

function art(file: string, type: string): Promise<string> {
  let hit = artCache.get(file)
  if (!hit) {
    hit = readFile(path.join(ART_DIR, file)).then((b) => `data:image/${type};base64,${b.toString('base64')}`)
    artCache.set(file, hit)
  }
  return hit
}

type Stage = 'home' | 'builder' | 'versus' | 'mega' | 'league' | 'daily'

const stage = (name: Stage) => art(`stage-${name}.jpg`, 'jpeg')

/** A card photo as something satori can draw: PNG or JPEG, whatever the
    host's URL or content type claims (NFL.com serves webp to anyone who'll
    take it, and our own uploads are webp). */
async function photo(url: string | null | undefined): Promise<string | null> {
  if (!url) return null
  try {
    const res = await fetch(url.replace('f_auto,q_auto', 'f_png,q_auto'), { signal: AbortSignal.timeout(3500) })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf[0] === 0x89 && buf[1] === 0x50) return `data:image/png;base64,${buf.toString('base64')}`
    if (buf[0] === 0xff && buf[1] === 0xd8) return `data:image/jpeg;base64,${buf.toString('base64')}`
    const sharp = (await import('sharp')).default
    const png = await sharp(buf).png().toBuffer()
    return `data:image/png;base64,${png.toString('base64')}`
  } catch {
    return null
  }
}

function mix(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/** A colour sunk toward black, as a solid. */
function steep(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const at = (v: number, under: number) => Math.round(under + (v - under) * amount)
  return `rgb(${at((n >> 16) & 255, 9)}, ${at((n >> 8) & 255, 10)}, ${at(n & 255, 12)})`
}

/** The card's ground, the plates on it and their hairlines, all in its colour. */
const ground = (accent: string) => steep(accent, 0.07)
const plate = (accent: string) => steep(accent, 0.13)
const rule = (accent: string) => steep(accent, 0.34)

const num = (n: number) => n.toLocaleString('en-US')

/** Anything a person typed, shown large to whoever gets the link. */
function clean(raw: string | null | undefined, max = 28): string {
  return (raw ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
}

// ── Pieces ───────────────────────────────────────────────────

/** The biggest size where every word fits the column and the whole thing fits
    in three lines. DM Serif runs about half an em a letter. */
function headSize(text: string, width: number, most: number): number {
  const widest = Math.max(...text.split(' ').map((w) => w.length))
  for (const size of [96, 88, 80, 72, 64, 56, 48, 42].filter((n) => n <= most)) {
    const perLine = width / (size * 0.5)
    if (widest <= perLine && Math.ceil(text.length / perLine) + 0.5 <= 3) return size
  }
  return 42
}

/** A headline: word by word so it wraps, with `em` set in italic and the mode's
    colour. */
function head(text: string, em: string | null, accent: string, width = 590, most = 96) {
  const size = headSize(text, width, most)
  const emWords = new Set((em ?? '').split(' ').filter(Boolean))
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        width,
        columnGap: size * 0.22,
        rowGap: 0,
        fontFamily: 'Serif',
        fontSize: size,
        lineHeight: 1.06,
        color: CREAM,
      }}
    >
      {text.split(' ').map((w, i) => (
        <span key={i} style={emWords.has(w) ? { color: accent, fontStyle: 'italic' } : {}}>
          {w}
        </span>
      ))}
    </div>
  )
}

function sub(text: string, width = 584) {
  return (
    <div style={{ display: 'flex', width, marginTop: 20, fontFamily: 'Mono', fontSize: 24, lineHeight: 1.42, color: MUTE }}>
      {text}
    </div>
  )
}

function chips(list: string[], accent: string) {
  return (
    <div style={{ display: 'flex', gap: 12, marginTop: 26 }}>
      {list.map((c, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            padding: '9px 16px',
            border: `2px solid ${i === 0 ? accent : rule(accent)}`,
            borderRadius: 8,
            fontFamily: 'Mono',
            fontWeight: 700,
            fontSize: 19,
            letterSpacing: 1.5,
            color: i === 0 ? accent : MUTE,
          }}
        >
          {c.toUpperCase()}
        </div>
      ))}
    </div>
  )
}

function bigScore(score: number, color: string) {
  return (
    <div style={{ display: 'flex', fontFamily: 'Orbitron', fontWeight: 800, fontSize: 104, lineHeight: 1, letterSpacing: -2, color }}>
      {num(score)}
    </div>
  )
}

/** rays.png, read in GET: what goes over a card with no stage of its own. */
let RAYS = ''

/** The room, the brand line, the column of words, and either a stage or an
    object on the right. */
function room(accent: string, kicker: string, left: React.ReactNode, right: React.ReactNode, backdrop?: string) {
  return (
    <div
      style={{
        width: W,
        height: H,
        display: 'flex',
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: ground(accent),
        ...(backdrop
          ? {}
          : { backgroundImage: `radial-gradient(circle at 78% 42%, ${mix(accent, 0.42)} 0%, ${mix(accent, 0.2)} 36%, ${mix(accent, 0.06)} 64%, ${mix(accent, 0)} 92%)` }),
        color: CREAM,
      }}
    >
      {backdrop ? (
        <img src={backdrop} alt="" width={W} height={H} style={{ position: 'absolute', left: 0, top: 0 }} />
      ) : RAYS ? (
        <img src={RAYS} alt="" width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, opacity: 0.4 }} />
      ) : (
        <div style={{ display: 'flex' }} />
      )}
      <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: BAR_TOP, background: accent, display: 'flex' }} />
      {right ? <div style={{ position: 'absolute', left: 660, top: 0, width: 540, height: H, display: 'flex' }}>{right}</div> : <div style={{ display: 'flex' }} />}
      {/* What the bar under the card picks its colour from. Solid, and over the
          stage, so a pack stands on it. */}
      <div style={{ position: 'absolute', left: 0, bottom: 0, width: W, height: BAR_FOOT, display: 'flex', background: accent }} />
      <div style={{ position: 'absolute', left: 64, top: 48, bottom: BAR_FOOT + 16, width: 660, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
          <div style={{ display: 'flex', fontFamily: 'Orbitron', fontWeight: 800, fontSize: 25, letterSpacing: 3, color: AMBER }}>
            PACK EMPIRE
          </div>
          <div style={{ display: 'flex', width: 2, height: 22, background: rule(accent), flexShrink: 0 }} />
          <div style={{ display: 'flex', fontFamily: 'Mono', fontWeight: 700, fontSize: 19, letterSpacing: 2, color: MUTE }}>
            {kicker.toUpperCase()}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', marginTop: 8 }}>{left}</div>
      </div>
    </div>
  )
}

/** A wall of face-down cards with a few turned over: Mega's board, the Binder's
    page. The same fixed scatter every time, so a card doesn't shimmer between
    scrapes, and it only ever reads as texture. */
function tiles(cols: number, rows: number, w: number, gap: number, accent: string, up: Record<number, Rarity>) {
  const h = Math.round(w * 1.36)
  return (
    <div
      style={{
        position: 'absolute',
        left: 270 - (cols * w + (cols - 1) * gap) / 2,
        top: 26 + (530 - (rows * h + (rows - 1) * gap)) / 2,
        width: cols * w + (cols - 1) * gap,
        display: 'flex',
        flexWrap: 'wrap',
        gap,
      }}
    >
      {Array.from({ length: cols * rows }, (_, i) => {
        const r = up[i]
        const c = r ? RARITY_LOOK[r].color : null
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: w,
              height: h,
              borderRadius: 8,
              border: `2px solid ${c ?? rule(accent)}`,
              backgroundColor: c ? mix(c, 0.18) : plate(accent),
              ...(c ? { boxShadow: `0 0 26px ${mix(c, 0.55)}` } : {}),
            }}
          >
            <div
              style={{
                display: 'flex',
                width: w * 0.3,
                height: w * 0.3,
                borderRadius: 99,
                backgroundColor: c ?? mix(accent, 0.14),
              }}
            />
          </div>
        )
      })}
    </div>
  )
}

/** A card, dealt into the fan on the right. */
function card(p: Player, face: string | null, x: number, y: number, spin: number) {
  const look = RARITY_LOOK[p.rarity]
  const w = 214
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: 306,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 16,
        border: `3px solid ${look.color}`,
        backgroundColor: '#191612',
        backgroundImage: `linear-gradient(170deg, ${mix(look.color, 0.34)} 0%, #191612 62%)`,
        boxShadow: `0 0 34px ${mix(look.color, 0.5)}`,
        overflow: 'hidden',
        transform: `rotate(${spin}deg)`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 12px 0', fontFamily: 'Mono', fontWeight: 700, fontSize: 15, letterSpacing: 1 }}>
        <span style={{ color: CREAM }}>{p.pos}</span>
        <span style={{ color: look.color }}>{look.label.toUpperCase()}</span>
      </div>
      <div style={{ display: 'flex', position: 'relative', height: 182, justifyContent: 'center', alignItems: 'flex-end', overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            top: 26,
            left: 0,
            width: w - 6,
            display: 'flex',
            justifyContent: 'center',
            fontFamily: 'Orbitron',
            fontWeight: 800,
            fontSize: 62,
            color: mix(look.color, 0.2),
          }}
        >
          {p.year ?? ''}
        </div>
        {face ? (
          <img src={face} alt="" width={224} height={160} style={{ objectFit: 'cover', objectPosition: 'top' }} />
        ) : (
          <div style={{ display: 'flex' }} />
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', padding: '6px 12px 0', borderTop: `2px solid ${mix(look.color, 0.5)}` }}>
        <div style={{ display: 'flex', fontFamily: 'Barlow', fontWeight: 700, fontSize: 27, lineHeight: 1.12, color: CREAM, whiteSpace: 'nowrap' }}>
          {clean(p.name, 19)}
        </div>
        <div style={{ display: 'flex', fontFamily: 'Orbitron', fontWeight: 800, fontSize: 29, color: look.color }}>{num(p.score)}</div>
      </div>
    </div>
  )
}

async function fan(lineup: (Player | null)[]) {
  const top = lineup
    .filter((p): p is Player => !!p)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
  if (top.length === 0) return null
  const faces = await loadFaces().catch((): Record<string, string | undefined> => ({}))
  const shots = await Promise.all(top.map((p) => photo(faces[p.id] ?? p.img)))
  // Best card in the middle. Satori has no z-index, so it's drawn last.
  const seats: [number, number, number][] = [
    [180, 110, 0],
    [40, 148, -8],
    [316, 148, 8],
  ]
  return (
    <div style={{ display: 'flex', position: 'relative', width: 540, height: H }}>
      {top
        .map((p, i) => card(p, shots[i], seats[i][0], seats[i][1], seats[i][2]))
        .reverse()}
    </div>
  )
}

/** A final: two rows, the winner lit. */
function scoreboard(
  rows: { name: string; score: number; tier?: string | null; win: boolean; color?: string }[],
  accent: string
) {
  return (
    <div style={{ position: 'absolute', left: 16, top: 40, width: 500, height: 510, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18 }}>
      {rows.map((r, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '20px 26px 22px',
            borderRadius: 14,
            border: `2px solid ${r.win ? accent : rule(accent)}`,
            backgroundColor: r.win ? mix(accent, 0.14) : plate(accent),
            ...(r.win ? { boxShadow: `0 0 44px ${mix(accent, 0.34)}` } : {}),
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', fontFamily: 'Barlow', fontWeight: 700, fontSize: 38, color: r.win ? CREAM : MUTE, whiteSpace: 'nowrap' }}>
              {clean(r.name.replace(/^the /, ''), 20)}
            </div>
            {r.win && (
              <div style={{ display: 'flex', fontFamily: 'Mono', fontWeight: 700, fontSize: 19, letterSpacing: 2, color: GREEN }}>WINNER</div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 2 }}>
            <div style={{ display: 'flex', fontFamily: 'Orbitron', fontWeight: 800, fontSize: 62, color: r.win ? accent : DIM }}>{num(r.score)}</div>
            {r.tier && (
              <div style={{ display: 'flex', fontFamily: 'Mono', fontWeight: 700, fontSize: 17, letterSpacing: 1, color: r.win ? (r.color ?? MUTE) : DIM }}>
                {r.tier.toUpperCase()}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Ranked names, for the board and a league's table. */
function table(rows: { name: string; score: number }[], accent: string, title: string) {
  return (
    <div style={{ position: 'absolute', left: 16, top: 40, width: 500, height: 510, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 }}>
      <div style={{ display: 'flex', fontFamily: 'Mono', fontWeight: 700, fontSize: 19, letterSpacing: 2, color: accent, marginBottom: 4 }}>
        {title.toUpperCase()}
      </div>
      {rows.map((r, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '14px 22px',
            borderRadius: 12,
            border: `2px solid ${i === 0 ? accent : rule(accent)}`,
            backgroundColor: i === 0 ? mix(accent, 0.14) : plate(accent),
          }}
        >
          <div style={{ display: 'flex', width: 46, fontFamily: 'Orbitron', fontWeight: 800, fontSize: 26, color: i === 0 ? accent : DIM }}>{i + 1}</div>
          <div style={{ display: 'flex', flexGrow: 1, fontFamily: 'Barlow', fontWeight: 700, fontSize: 34, color: i === 0 ? CREAM : MUTE, whiteSpace: 'nowrap' }}>
            {clean(r.name, 16)}
          </div>
          <div style={{ display: 'flex', fontFamily: 'Orbitron', fontWeight: 800, fontSize: 30, color: i === 0 ? accent : MUTE }}>{num(r.score)}</div>
        </div>
      ))}
    </div>
  )
}

// ── Scenes ───────────────────────────────────────────────────

async function modeScene(c: string, day: string | null) {
  if (c === 'builder') {
    return room(
      MODE.builder,
      'Solo',
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {head('Empire Builder.', 'Builder.', MODE.builder)}
        {sub('Pick a captain, open eleven packs and keep one player from each. The best offenses go on the board.')}
      </div>,
      null,
      await stage('builder')
    )
  }
  if (c === 'versus') {
    return room(
      MODE.versus,
      'Two players',
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {head('Versus Challenge.', 'Challenge.', MODE.versus)}
        {sub('Send a friend the link. You each draft your own eleven and the bigger total wins.')}
      </div>,
      null,
      await stage('versus')
    )
  }
  if (c === 'mega') {
    return room(
      MODE.mega,
      'Live draft',
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {head('Mega Draft.', 'Draft.', MODE.mega)}
        {sub('One shared board of thirty-six. A live snake draft, and every pick is one they don’t get.')}
      </div>,
      null,
      await stage('mega')
    )
  }
  if (c === 'league') {
    return room(
      MODE.league,
      '4 to 12 players',
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {head('League Mode.', 'Mode.', MODE.league)}
        {sub('Eight weeks of drafts with keepers, chemistry and boosted packs, then a Gauntlet and a Final.')}
      </div>,
      null,
      await stage('league')
    )
  }
  if (c === 'daily') {
    const spec = dailySpec(day)
    return room(
      MODE.daily,
      longDate(spec.day),
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {head('The Daily.', 'Daily.', MODE.daily)}
        {sub(`Today's rule: ${spec.title}. ${spec.line}`)}
        {chips(['One deal for everyone', 'One try'], MODE.daily)}
      </div>,
      null,
      await stage('daily')
    )
  }
  if (c === 'board') {
    const board = await loadBoard('best', { game: 'pack-empire', mode: 'offense', poolId: 'site' }, null, { limit: 5 }).catch(() => null)
    const rows = board?.kind === 'best' ? board.rows.slice(0, 5).map((r) => ({ name: r.name, score: r.score })) : []
    return room(
      MODE.board,
      'Empire Builder',
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {head('The Board.', 'Board.', MODE.board)}
        {sub('The best offenses anyone has opened, every pack re-dealt and checked.')}
      </div>,
      rows.length ? table(rows, MODE.board, 'All-Time Best') : null,
      rows.length ? undefined : await stage('builder')
    )
  }
  if (c === 'binder') {
    return room(
      MODE.binder,
      'Collection',
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {head('The Binder.', 'Binder.', MODE.binder)}
        {sub(`The card you keep from every pack goes in here. ${num(POOL_SIZE)} cards to find.`)}
      </div>,
      tiles(4, 3, 104, 16, MODE.binder, { 1: 'rare', 4: 'immortal', 6: 'common', 7: 'dynasty', 10: 'transcendent' })
    )
  }
  if (c === 'profile') {
    return room(
      MODE.friends,
      'Friends',
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {head('Games Profile.', 'Profile.', MODE.friends)}
        {sub('Your friends, your head-to-head records and your record book across the Games Page.')}
      </div>,
      seats('You', null)
    )
  }
  return room(
    AMBER,
    'The Sunday Chronicle',
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {head('Rip Packs. Build an Empire.', 'Empire.', AMBER)}
      {sub('Keep one player from each pack and build the best offense anyone has opened.')}
      {chips([`${num(POOL_SIZE)} cards`, 'Free to play'], AMBER)}
    </div>,
    null,
    await stage('home')
  )
}

/** A friend invite: the two of you, side by side. */
function seats(name: string, other: string | null) {
  const plate = (label: string, big: string, lit: boolean) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: 226,
        height: 316,
        borderRadius: 16,
        border: `3px ${lit ? 'solid' : 'dashed'} ${lit ? MODE.friends : DIM}`,
        backgroundColor: lit ? mix(MODE.friends, 0.12) : 'transparent',
        ...(lit ? { boxShadow: `0 0 44px ${mix(MODE.friends, 0.34)}` } : {}),
      }}
    >
      <div style={{ display: 'flex', fontFamily: 'Serif', fontSize: 118, lineHeight: 1, color: lit ? MODE.friends : DIM }}>{big}</div>
      <div style={{ display: 'flex', marginTop: 18, fontFamily: 'Barlow', fontWeight: 700, fontSize: 30, color: lit ? CREAM : MUTE, whiteSpace: 'nowrap' }}>
        {label}
      </div>
    </div>
  )
  return (
    <div style={{ display: 'flex', position: 'relative', width: 540, height: H, alignItems: 'center', justifyContent: 'center', gap: 22, paddingBottom: 60 }}>
      {plate(clean(name, 14), clean(name, 1).toUpperCase() || 'P', true)}
      {plate(other ?? 'You', '+', false)}
    </div>
  )
}

async function versusScene(id: string) {
  const v = await getVersus(id.toUpperCase(), null, null)
  if (!v) return null
  const c = MODE.versus
  const host = clean(v.host.name) || 'Someone'
  // The CPU's seat reads as a thing, not a name.
  const guest = v.bot ? 'the CPU' : clean(v.guest.name)
  const label = [v.format === 'even' ? 'Even' : 'Classic', DIFFICULTY_LOOK[v.difficulty].label]

  if (v.status === 'done' && v.host.score != null && v.guest.score != null) {
    const hs = v.host.score
    const gs = v.guest.score
    const hostWon = hs > gs
    const tied = hs === gs
    const winner = hostWon ? host : guest
    const loser = hostWon ? guest : host
    const rows = [
      { name: host, score: hs, tier: v.host.tier, win: !tied && hostWon, color: tierFor(hs).color },
      { name: guest, score: gs, tier: v.guest.tier, win: !tied && !hostWon, color: tierFor(gs).color },
    ].sort((a, b) => b.score - a.score)
    return room(
      c,
      'Versus · Final',
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {tied ? head(`${host} and ${guest} tied.`, 'tied.', c, 600) : head(`${winner} beat ${loser}.`, 'beat', c, 600)}
        {sub(tied ? 'Dead even. Run it back.' : `By ${num(Math.abs(hs - gs))}. Think you can do better?`, 580)}
        {chips(label, c)}
      </div>,
      scoreboard(rows, c)
    )
  }

  const duo = await stage('versus')

  // In, and waiting on the other seat. A guest who beat the host to it counts.
  const inSide = v.host.done ? v.host : v.guest.done ? v.guest : null
  if (inSide?.score != null) {
    const who = clean(inSide.name) || 'Someone'
    return room(
      c,
      'Versus Challenge',
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {head(`${who} put up`, 'put up', c, 590, 64)}
        <div style={{ display: 'flex', marginTop: 6 }}>{bigScore(inSide.score, c)}</div>
        {sub('Your move. Open eleven packs and beat it.')}
        {chips(label, c)}
      </div>,
      null,
      duo
    )
  }

  const reserved = v.reserved && guest
  const live = v.status !== 'open' && guest && !reserved
  return room(
    c,
    'Versus Challenge',
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {live
        ? head(`${host} vs ${guest}`, 'vs', c)
        : head(`${host} challenged ${reserved ? guest : 'you'}.`, 'challenged', c)}
      {sub(live ? 'Both drafting now. Eleven packs each.' : 'Eleven packs each. The bigger offense wins.')}
      {chips(label, c)}
    </div>,
    null,
    duo
  )
}

async function megaScene(id: string) {
  const v = await getMega(id.toUpperCase(), null, null)
  if (!v) return null
  const c = MODE.mega
  const [a, b] = v.seats
  const named = (seat: 0 | 1, n: string | null) => (v.botSeat === seat ? 'the CPU' : clean(n))
  const one = named(0, a.name)
  const two = named(1, b.name)

  if (v.status === 'done') {
    const tied = a.score === b.score
    const firstWon = a.score > b.score
    const rows = [
      { name: one, score: a.score, win: !tied && firstWon },
      { name: two, score: b.score, win: !tied && !firstWon },
    ].sort((x, y) => y.score - x.score)
    const winner = firstWon ? one : two
    const loser = firstWon ? two : one
    return room(
      c,
      'Mega Draft · Final',
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {tied ? head(`${one} and ${two} tied.`, 'tied.', c, 600) : head(`${winner} beat ${loser}.`, 'beat', c, 600)}
        {sub(tied ? 'One board, two drafts, dead even.' : `Same board, thirty-six cards, won by ${num(Math.abs(a.score - b.score))}.`, 580)}
      </div>,
      scoreboard(rows, c)
    )
  }
  if (v.status === 'live') {
    return room(
      c,
      'Mega Draft · Live',
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {head(`${one} vs ${two}`, 'vs', c)}
        {sub(`Live now, pick ${Math.min(v.pickNo + 1, 22)} of 22 off one shared board.`)}
      </div>,
      null,
      await stage('mega')
    )
  }
  const host = clean(v.hostName) || 'Someone'
  const reserved = clean(v.reservedFor)
  return room(
    c,
    'Mega Draft',
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {head(reserved ? `${host} wants to draft ${reserved}.` : `${host} saved you a seat.`, reserved ? 'draft' : 'seat.', c)}
      {sub('One board of thirty-six. A live snake draft. Every pick is one they don’t get.')}
    </div>,
    null,
    await stage('mega')
  )
}

async function leagueScene(id: string) {
  const v = await leagueView(id.toUpperCase(), null)
  if (!v) return null
  const c = MODE.league
  const name = clean(v.league.name, 34) || 'A Pack Empire League'
  const order = [...v.standings].sort((a, b) => b.total + b.playoff - (a.total + a.playoff))
  const top = order.slice(0, 4).map((s) => ({ name: s.team ?? s.name, score: s.total + s.playoff }))

  if (v.champion) {
    const champ = v.standings.find((s) => s.memberId === v.champion)
    return room(
      c,
      'League · Champion',
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {head(`${clean(champ?.team ?? champ?.name) || 'A team'} won it all.`, 'won it all.', c)}
        {sub(`${name}, season ${v.league.season_number}.`)}
      </div>,
      top.length ? table(top, c, 'Final Table') : <div style={{ display: 'flex' }} />
    )
  }
  if (v.league.phase === 'pregame') {
    return room(
      c,
      'League Invite',
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {head(name, null, c)}
        {sub('Eight weeks of pack drafts with keepers and chemistry, then a Gauntlet and a Final.')}
        {chips([`${v.standings.length} of ${v.league.max_players} teams`, 'Join now'], c)}
      </div>,
      null,
      await stage('league')
    )
  }
  const week = v.league.phase === 'regular' ? `Week ${v.league.current_week} of ${REGULAR_WEEKS}` : PHASE_LABEL[v.league.phase]
  return room(
    c,
    `League · ${week}`,
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {head(name, null, c)}
      {sub(top.length ? `${clean(top[0].name)} leads the table.` : 'Eight weeks of pack drafts, then a Gauntlet and a Final.')}
    </div>,
    top.length ? table(top, c, 'The Table') : <div style={{ display: 'flex' }} />
  )
}

async function runScene(id: string) {
  const run = await loadRun(id)
  if (!run) return null
  const c = run.tier.color
  const object = await fan(run.lineup)
  return room(
    c,
    `Empire Builder · ${DIFFICULTY_LOOK[run.difficulty].label}`,
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {head(`${clean(run.name)}'s Offense`, 'Offense', c, 560, 72)}
      <div style={{ display: 'flex', marginTop: 10 }}>{bigScore(run.score, c)}</div>
      <div style={{ display: 'flex', marginTop: 20 }}>{chips([run.tier.label], c)}</div>
    </div>,
    object,
    object ? undefined : await stage('builder')
  )
}

async function dailyScoreScene(token: string | null) {
  const s = readDaily(token)
  if (!s) return null
  const c = MODE.daily
  const line = dailyScoreLine(s.day)
  return room(
    c,
    `${DIFFICULTY_LOOK[s.version].label} · ${clean(s.name)}`,
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {bigScore(s.score, c)}
      <div style={{ display: 'flex', marginTop: 14 }}>{head(`on ${line[0].toUpperCase()}${line.slice(1)}`, 'Daily', c, 590, 64)}</div>
    </div>,
    null,
    await stage('daily')
  )
}

async function friendScene(token: string | null) {
  const owner = token ? await inviteOwner(token) : null
  const who = clean(owner?.name)
  if (!who) return null
  return room(
    MODE.friends,
    'Friend Invite',
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {head(`${who} wants you as a friend.`, 'friend.', MODE.friends)}
      {sub('Records side by side, and Pack Empire challenges whenever you want them.')}
    </div>,
    seats(who, null)
  )
}

async function scene(p: URLSearchParams): Promise<React.ReactElement | null> {
  const c = p.get('c') ?? 'home'
  const id = p.get('id')
  if (c === 'vs' && id) return versusScene(id)
  if (c === 'mg' && id) return megaScene(id)
  if (c === 'lg' && id) return leagueScene(id)
  if (c === 'run' && id) return runScene(id)
  if (c === 'day') return dailyScoreScene(p.get('r'))
  if (c === 'fr') return friendScene(p.get('t'))
  return modeScene(c, p.get('d'))
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  const [fonts, rays] = await Promise.all([loadFonts(), art('rays.png', 'png')])
  RAYS = rays
  // A broken preview is a link nobody clicks, so anything that goes wrong
  // (a reset invite, a deleted game, a slow database) is the front door instead.
  const element = (await scene(params).catch(() => null)) ?? (await modeScene('home', null))
  return new ImageResponse(element, {
    width: W,
    height: H,
    fonts,
    headers: { 'Cache-Control': 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400' },
  })
}
