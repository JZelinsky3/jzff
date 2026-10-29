// The Weekly Recap promo card: a real edition of the demo league's paper
// lying on the desk, tilted, with a rubber stamp on its corner. The old card
// was the cream ranked-list layout the stat posts use, which said "list", not
// "newspaper" (Joey), so this one draws the paper itself: masthead, headline,
// final scores, standings, the player of the week and the upset, all from the
// demo league's real Week 4 edition. Draws its whole 1080x1350 frame.
//
// Colours are the recap email's (lib/recap/email.ts): desk, paper, one red,
// the salmon quick-hits band.

import type { Card, RecapIssue } from '@/lib/social/content'

type RecapCard = Extract<Card, { template: 'recap' }>

const DESK = '#d9cdb2'
const DESK_HI = '#e6dcc5'
const PAPER = '#fbf7ec'
const INK = '#1c1915'
const INK_2 = '#463f35'
const MUTE = '#8a806f'
const RULE = '#d3c8ae'
const RED = '#a3302a'
const SALMON = '#f3dfcf'
const SALMON_RULE = '#dcbba3'
const UP = '#2f6b45'

const W = 1080
const H = 1350

function mono(text: string, size: number, color: string, opts: { bold?: boolean; spacing?: number } = {}) {
  return (
    <div style={{ display: 'flex', fontFamily: 'JetBrains', fontWeight: opts.bold ? 700 : 400, fontSize: size, letterSpacing: opts.spacing ?? 0, color }}>
      {text}
    </div>
  )
}

function serif(text: string, size: number, color: string, opts: { italic?: boolean; lh?: number } = {}) {
  return (
    <div style={{ display: 'flex', fontFamily: 'DMSerif', fontStyle: opts.italic ? 'italic' : 'normal', fontSize: size, lineHeight: opts.lh ?? 1.1, color }}>
      {text}
    </div>
  )
}

const pts = (n: number) => n.toFixed(2)

function scores(issue: RecapIssue) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1.2, paddingRight: 30, borderRight: `1px solid ${RULE}` }}>
      {mono('FINAL SCORES', 16, RED, { bold: true, spacing: 3 })}
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 10 }}>
        {issue.games.map((g, i) => {
          const [w, l] = g.winner === 'a' ? [g.a, g.b] : [g.b, g.a]
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', borderTop: `1px solid ${RULE}`, padding: '10px 0' }}>
              <div style={{ display: 'flex', flex: 1, fontFamily: 'DMSerif', fontSize: 28, color: INK }}>{w.name}</div>
              <div style={{ display: 'flex', width: 92, justifyContent: 'flex-end', marginRight: 22 }}>{mono(pts(w.score), 20, INK, { bold: true })}</div>
              <div style={{ display: 'flex', flex: 1, fontFamily: 'DMSerif', fontSize: 28, color: MUTE }}>{l.name}</div>
              <div style={{ display: 'flex', width: 82, justifyContent: 'flex-end' }}>{mono(pts(l.score), 20, MUTE)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function standings(issue: RecapIssue) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingLeft: 30 }}>
      {mono('STANDINGS', 16, RED, { bold: true, spacing: 3 })}
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 10 }}>
        {issue.standings.map((s) => (
          <div key={s.rank} style={{ display: 'flex', alignItems: 'baseline', borderTop: `1px solid ${RULE}`, padding: '10px 0' }}>
            <div style={{ display: 'flex', width: 30 }}>{mono(String(s.rank), 18, MUTE, { bold: true })}</div>
            <div style={{ display: 'flex', flex: 1, fontFamily: 'DMSerif', fontSize: 28, color: INK }}>{s.name}</div>
            <div style={{ display: 'flex', width: 52 }}>{mono(s.record, 19, INK_2)}</div>
            <div style={{ display: 'flex', width: 40, justifyContent: 'flex-end' }}>
              {mono(s.change > 0 ? `+${s.change}` : s.change < 0 ? `-${-s.change}` : '·', 17, s.change > 0 ? UP : s.change < 0 ? RED : MUTE, { bold: true })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function hit(kicker: string, big: string, small: string, last = false) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '18px 24px', borderRight: last ? 'none' : `1px solid ${SALMON_RULE}` }}>
      {mono(kicker, 15, RED, { bold: true, spacing: 3 })}
      <div style={{ display: 'flex', marginTop: 8 }}>{serif(big, 30, INK)}</div>
      <div style={{ display: 'flex', marginTop: 4 }}>{mono(small, 17, INK_2)}</div>
    </div>
  )
}

function paper(issue: RecapIssue) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: PAPER,
        padding: '36px 40px 34px',
        transform: 'rotate(-1.6deg)',
        boxShadow: '0 22px 46px rgba(52,38,16,0.30), 0 2px 6px rgba(52,38,16,0.18)',
      }}
    >
      {/* Masthead */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {mono(`WEEK ${issue.week} · ${issue.year}`, 15, MUTE, { bold: true, spacing: 3 })}
        {mono('TUESDAY EDITION', 15, MUTE, { bold: true, spacing: 3 })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>{serif(issue.league, 64, INK, { lh: 1 })}</div>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 14 }}>
        <div style={{ display: 'flex', height: 3, background: INK }} />
        <div style={{ display: 'flex', height: 1, background: INK, marginTop: 3 }} />
      </div>

      <div style={{ display: 'flex', marginTop: 20 }}>{serif(issue.headline, issue.headline.length > 34 ? 42 : 50, INK, { lh: 1.04 })}</div>

      <div style={{ display: 'flex', marginTop: 22 }}>
        {scores(issue)}
        {standings(issue)}
      </div>

      <div style={{ display: 'flex', background: SALMON, marginTop: 22 }}>
        {hit('PLAYER OF THE WEEK', issue.star.player, `${issue.star.pos} · ${issue.star.points.toFixed(1)} for ${issue.star.manager}`)}
        {hit('THE UPSET', `${issue.upset.winner} over ${issue.upset.loser}`, `${issue.upset.winnerRecord} beat ${issue.upset.loserRecord}`, true)}
      </div>
    </div>
  )
}

export function recapCard(card: RecapCard) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: W,
        height: H,
        padding: '60px 72px 52px',
        background: DESK,
        backgroundImage: `radial-gradient(circle at 30% 0%, ${DESK_HI} 0%, ${DESK} 62%)`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', background: RED, color: PAPER, fontFamily: 'JetBrains', fontWeight: 700, fontSize: 26, letterSpacing: 4, padding: '10px 18px' }}>
          THE WEEKLY RECAP
        </div>
        {mono('SLEEPER · ESPN · YAHOO', 22, INK, { bold: true, spacing: 3 })}
      </div>
      <div style={{ display: 'flex', marginTop: 34 }}>{serif(card.title, 80, INK, { lh: 1 })}</div>
      <div style={{ display: 'flex', marginTop: 12 }}>{serif(card.dek, 38, INK_2, { italic: true })}</div>

      <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', marginTop: 40 }}>
        {paper(card.issue)}
        {/* The rubber stamp, over the paper's corner */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            right: 26,
            bottom: -62,
            transform: 'rotate(-9deg)',
            border: `5px solid ${RED}`,
            padding: 6,
            background: 'rgba(251,247,236,0.88)',
          }}
        >
          <div style={{ display: 'flex', border: `2px solid ${RED}`, padding: '10px 22px' }}>
            {mono(card.stamp.toUpperCase(), 34, RED, { bold: true, spacing: 5 })}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto' }}>
        <div style={{ display: 'flex', height: 2, background: INK }} />
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: 18 }}>
          {serif('The Sunday Chronicle.', 40, INK)}
          {mono('thesundaychronicle.app', 22, INK_2, { spacing: 2 })}
        </div>
      </div>
    </div>
  )
}
