// Link preview for a Progress Report: /api/og/report/<slug>/<week>/
//
// The page in miniature, in its own colours (report.module.css): the
// letterhead and the honor roll's circled grades on the card stock at left,
// the top of the playoff race on the navy board at right.
//
// Satori rules from the other og routes: no fragments inside flex rows, thin
// divs need flexShrink 0, every glyph must exist in the loaded fonts (the
// ▲ ▼ change marks are drawn as SVG), helpers are plain function calls.

import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import path from 'path'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadReportCached } from '@/lib/report/cached'
import type { Grade } from '@/lib/report/build'

export const runtime = 'nodejs'

const FONT_DIR = path.join(process.cwd(), 'public', 'og', 'fonts')

const STOCK = '#e3e9ed'
const SHEET = '#f6f8fa'
const RULE = '#bccbd6'
const INK = '#16243a'
const INK_2 = '#3f4f66'
const MUTE = '#6c7a8c'
const RED = '#c23a2c'
const BOARD = '#13233a'
const CHALK = '#e8eef4'
const CHALK_2 = '#aebdcd'
const BAR = '#8db6dc'
const UP = '#6cc59a'
const DOWN = '#f08a78'

async function loadFonts() {
  const [serif, serifItalic, mono, monoBold] = await Promise.all([
    readFile(path.join(FONT_DIR, 'DMSerifDisplay-Regular.ttf')),
    readFile(path.join(FONT_DIR, 'DMSerifDisplay-Italic.ttf')),
    readFile(path.join(FONT_DIR, 'JetBrainsMono-Regular.ttf')),
    readFile(path.join(FONT_DIR, 'JetBrainsMono-Bold.ttf')),
  ])
  return [
    {
      name: 'DMSerif',
      data: serif,
      style: 'normal' as const,
      weight: 400 as const,
    },
    {
      name: 'DMSerif',
      data: serifItalic,
      style: 'italic' as const,
      weight: 400 as const,
    },
    {
      name: 'JetBrains',
      data: mono,
      style: 'normal' as const,
      weight: 400 as const,
    },
    {
      name: 'JetBrains',
      data: monoBold,
      style: 'normal' as const,
      weight: 700 as const,
    },
  ]
}

function short(name: string, n: number): string {
  return name.length > n ? `${name.slice(0, n - 1)}.` : name
}

function oddsText(n: number): string {
  if (n >= 99.95) return '100%'
  if (n > 99) return '>99%'
  if (n > 0 && n < 1) return '<1%'
  return `${Math.round(n)}%`
}

function circled(g: Grade, size: number) {
  return (
    <div
      style={{
        display: 'flex',
        position: 'relative',
        width: `${size}px`,
        height: `${Math.round(size * 0.8)}px`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg
        width={size}
        height={Math.round(size * 0.8)}
        viewBox="0 0 100 80"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transform: 'rotate(-6deg)',
        }}
      >
        <path
          d="M52 6 C80 5 96 22 94 42 C92 63 72 75 48 74 C22 73 5 59 6 38 C7 18 26 7 56 9"
          fill="none"
          stroke={RED}
          strokeWidth="3.4"
          strokeLinecap="round"
        />
      </svg>
      <div
        style={{
          display: 'flex',
          fontFamily: 'DMSerif',
          fontStyle: 'italic',
          fontSize: `${Math.round(size * 0.46)}px`,
          color: RED,
        }}
      >
        {g.letter}
      </div>
    </div>
  )
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; week: string }> }) {
  const { slug, week: w } = await params
  const week = Number(w)
  if (!/^[a-z0-9-]{1,80}$/.test(slug) || !Number.isInteger(week) || week < 1 || week > 18) {
    return new Response('Not found', { status: 404 })
  }
  const db = createAdminClient()
  const { data: league } = await db.from('leagues').select('id, name, slug, owner_id, published_at').eq('slug', slug).maybeSingle()
  // Crawlers have no session: only published leagues get an image.
  if (!league || !league.published_at) return new Response('Not found', { status: 404 })
  const r = await loadReportCached(
    league as {
      id: string
      name: string
      slug: string
      owner_id: string | null
    },
    week,
  )
  if (r.status !== 'ok' || r.view.week !== week) return new Response('Not found', { status: 404 })
  const v = r.view

  const fonts = await loadFonts()
  const title = v.final ? 'Final Report Card' : 'Progress Report'
  const byGpa = [...v.teams].sort((a, b) => b.gpa - a.gpa || b.odds - a.odds)
  const honor = byGpa.slice(0, 3)
  const race = v.teams.slice(0, 6)

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '1200px',
        height: '630px',
        background: STOCK,
      }}
    >
      {/* Letterhead */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '620px',
          padding: '50px 40px 40px 56px',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontFamily: 'JetBrains',
            fontWeight: 700,
            fontSize: '17px',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: RED,
          }}
        >
          {`${short(v.league.name, 26)} · ${v.year}`}
        </div>
        <div
          style={{
            display: 'flex',
            fontFamily: 'DMSerif',
            fontSize: title.length > 16 ? '74px' : '86px',
            lineHeight: 1,
            color: INK,
            marginTop: '14px',
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: 'flex',
            height: '2px',
            background: INK,
            marginTop: '22px',
            flexShrink: 0,
          }}
        />
        <div
          style={{
            display: 'flex',
            padding: '10px 0',
            fontFamily: 'JetBrains',
            fontWeight: 700,
            fontSize: '15px',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: INK_2,
          }}
        >
          {`Report ${v.edition} of ${v.editions.length} · Weeks 1 to ${v.week}`}
        </div>
        <div
          style={{
            display: 'flex',
            height: '1px',
            background: INK,
            flexShrink: 0,
          }}
        />
        <div
          style={{
            display: 'flex',
            marginTop: '18px',
            fontFamily: 'DMSerif',
            fontStyle: 'italic',
            fontSize: '27px',
            lineHeight: 1.3,
            color: INK_2,
          }}
        >
          {v.tier === 'free' ? `A report card for all ${v.teams.length} managers.` : `Playoff odds and a report card for all ${v.teams.length} managers.`}
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 'auto',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontFamily: 'JetBrains',
              fontWeight: 700,
              fontSize: '13px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: MUTE,
            }}
          >
            Honor roll
          </div>
          <div style={{ display: 'flex', marginTop: '10px' }}>
            {honor.map((t) => (
              <div
                key={t.managerId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginRight: '14px',
                  padding: '6px 14px 6px 8px',
                  background: SHEET,
                  border: `1px solid ${RULE}`,
                }}
              >
                {circled(t.grades.overall, 62)}
                <div
                  style={{
                    display: 'flex',
                    marginLeft: '6px',
                    fontFamily: 'DMSerif',
                    fontSize: '24px',
                    color: INK,
                  }}
                >
                  {short(t.name, 10)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* The race, or for a free league (odds are paid) the grades */}
      {v.tier === 'free' ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '580px',
            background: BOARD,
            padding: '44px 46px 34px 40px',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontFamily: 'DMSerif',
              fontSize: '38px',
              color: CHALK,
            }}
          >
            Report cards
          </div>
          <div
            style={{
              display: 'flex',
              height: '1px',
              background: 'rgba(232,238,244,0.35)',
              marginTop: '14px',
              flexShrink: 0,
            }}
          />
          {byGpa.slice(0, 6).map((t) => (
            <div
              key={t.managerId}
              style={{
                display: 'flex',
                alignItems: 'center',
                height: '66px',
                borderBottom: '1px solid rgba(232,238,244,0.12)',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <div
                  style={{
                    display: 'flex',
                    fontFamily: 'DMSerif',
                    fontSize: '25px',
                    color: CHALK,
                  }}
                >
                  {short(t.name, 14)}
                </div>
                <div
                  style={{
                    display: 'flex',
                    fontFamily: 'JetBrains',
                    fontSize: '13px',
                    color: CHALK_2,
                  }}
                >{`${t.w}-${t.l}${t.t ? `-${t.t}` : ''} · ${t.ppg.toFixed(1)} a week`}</div>
              </div>
              <div
                style={{
                  display: 'flex',
                  fontFamily: 'DMSerif',
                  fontStyle: 'italic',
                  fontSize: '34px',
                  color: DOWN,
                }}
              >
                {t.grades.overall.letter}
              </div>
            </div>
          ))}
          <div
            style={{
              display: 'flex',
              marginTop: '16px',
              fontFamily: 'JetBrains',
              fontSize: '14px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: CHALK_2,
            }}
          >
            {`Top ${Math.min(6, v.teams.length)} of ${v.teams.length} by grade point average`}
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '580px',
            background: BOARD,
            padding: '44px 46px 34px 40px',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontFamily: 'DMSerif',
              fontSize: '38px',
              color: CHALK,
            }}
          >
            The playoff race
          </div>
          <div
            style={{
              display: 'flex',
              height: '1px',
              background: 'rgba(232,238,244,0.35)',
              marginTop: '14px',
              flexShrink: 0,
            }}
          />
          {race.map((t) => {
            const d = t.before == null ? null : Math.round(t.odds - t.before)
            return (
              <div
                key={t.managerId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  height: '66px',
                  borderBottom: '1px solid rgba(232,238,244,0.12)',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    width: '138px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      fontFamily: 'DMSerif',
                      fontSize: '25px',
                      color: CHALK,
                    }}
                  >
                    {short(t.name, 10)}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      fontFamily: 'JetBrains',
                      fontSize: '13px',
                      color: CHALK_2,
                    }}
                  >{`${t.w}-${t.l}${t.t ? `-${t.t}` : ''}`}</div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    position: 'relative',
                    width: '200px',
                    height: '12px',
                    background: 'rgba(232,238,244,0.1)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${Math.max(2, t.odds) * 2}px`,
                      background: BAR,
                    }}
                  />
                  {t.before != null ? (
                    <div
                      style={{
                        display: 'flex',
                        position: 'absolute',
                        top: '-5px',
                        width: '3px',
                        height: '22px',
                        left: `${t.before * 2 - 1}px`,
                        background: CHALK,
                      }}
                    />
                  ) : null}
                </div>
                <div
                  style={{
                    display: 'flex',
                    width: '82px',
                    justifyContent: 'flex-end',
                    fontFamily: 'JetBrains',
                    fontWeight: 700,
                    fontSize: '22px',
                    color: CHALK,
                  }}
                >
                  {oddsText(t.odds)}
                </div>
                <div
                  style={{
                    display: 'flex',
                    width: '74px',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    fontFamily: 'JetBrains',
                    fontWeight: 700,
                    fontSize: '17px',
                    color: d == null || d === 0 ? CHALK_2 : d > 0 ? UP : DOWN,
                  }}
                >
                  {d != null && d !== 0 ? (
                    <svg width="14" height="12" viewBox="0 0 14 12" style={{ marginRight: '5px' }}>
                      <path d={d > 0 ? 'M7 0 L14 12 L0 12 Z' : 'M0 0 L14 0 L7 12 Z'} fill={d > 0 ? UP : DOWN} />
                    </svg>
                  ) : null}
                  {d == null ? '' : String(Math.abs(d))}
                </div>
              </div>
            )
          })}
          <div
            style={{
              display: 'flex',
              marginTop: '16px',
              fontFamily: 'JetBrains',
              fontSize: '14px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: CHALK_2,
            }}
          >
            {`Top ${race.length} of ${v.teams.length} · ${v.playoffTeams} make the playoffs`}
          </div>
        </div>
      )}
    </div>,
    { width: 1200, height: 630, fonts },
  )
}
