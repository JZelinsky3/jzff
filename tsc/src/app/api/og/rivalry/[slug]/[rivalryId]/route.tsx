// OG image generator for individual rivalry pages.
// URL: /api/og/rivalry/<slug>/<rivalryId>
// Referenced by <meta property="og:image"> on /leagues/<slug>/rivalries/rivalry.html?id=<rivalryId>.
//
// Renders a 1200x630 PNG card matching the rivalry detail page's red/black
// editorial aesthetic. CDN-cached forever per (slug, rivalryId); busted only
// when the league bundle's `league-<id>` tag is revalidated by sync.

import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLeagueBundle } from '@/lib/leagueBundleCache'

export const runtime = 'nodejs'

type RivalrySide = {
  name: string
  wins: number
  avg_ppg: number
  reg_record: string
  playoff_record: string
  high_score: { score: number; year: number; week: number; is_playoff: boolean } | null
}

type Rivalry = {
  id: string
  name: string
  total_meetings: number
  first_meeting_year: number | null
  last_meeting: { year: number; week: number } | null
  leader_name: string | null
  leader_record: string | null
  is_deadlocked: boolean
  ties_count: number
  manager_a: RivalrySide
  manager_b: RivalrySide
}

type RivalriesBundle = {
  rivalries: Rivalry[]
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; rivalryId: string }> }
) {
  const { slug, rivalryId } = await params

  const db = createAdminClient()
  const { data: league } = await db
    .from('leagues')
    .select('id, name, slug, published_at')
    .eq('slug', slug)
    .maybeSingle()
  if (!league || !league.published_at) {
    return new Response('Not found', { status: 404 })
  }

  const bundle = await getLeagueBundle(league.id, league.slug)
  const rivalriesData = bundle['rivalries.json'] as RivalriesBundle | undefined
  const rivalry = rivalriesData?.rivalries.find((r) => r.id === rivalryId)
  if (!rivalry) {
    return new Response('Rivalry not found', { status: 404 })
  }

  return renderRivalryCard(league.name, rivalry)
}

function renderRivalryCard(leagueName: string, rv: Rivalry) {
  const aWins = rv.manager_a.wins
  const bWins = rv.manager_b.wins
  const ties = rv.ties_count

  const leaderLine = rv.total_meetings === 0
    ? 'Never met'
    : rv.is_deadlocked
      ? 'Deadlocked'
      : `${rv.leader_name} leads`

  const metaLine = rv.first_meeting_year
    ? `First met ${rv.first_meeting_year}${rv.last_meeting ? ` · Last met ${rv.last_meeting.year} W${rv.last_meeting.week}` : ''}`
    : 'No meetings on record'

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          background: '#0a0a0a',
          color: '#f3f4f6',
          fontFamily: 'Georgia, serif',
          position: 'relative',
        }}
      >
        {/* Atmospheric glow */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background:
              'radial-gradient(circle at 12% 18%, rgba(220,38,38,0.18) 0%, transparent 55%), radial-gradient(circle at 88% 82%, rgba(220,38,38,0.10) 0%, transparent 50%)',
          }}
        />

        {/* Kicker */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '36px 64px 0',
            fontFamily: 'ui-monospace, "SF Mono", monospace',
            fontSize: '18px',
            letterSpacing: '0.28em',
            color: '#dc2626',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ display: 'flex' }}>{leagueName} · Head-to-Head</span>
          <span style={{ display: 'flex', color: '#9ca3af' }}>The Sunday Chronicle</span>
        </div>

        {/* Main body */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '0 80px',
            zIndex: 1,
          }}
        >
          {/* Manager A */}
          <div
            style={{
              fontSize: '78px',
              lineHeight: 1,
              fontWeight: 400,
              letterSpacing: '-0.01em',
              textAlign: 'center',
              display: 'flex',
              maxWidth: '100%',
            }}
          >
            {rv.manager_a.name}
          </div>

          {/* vs */}
          <div
            style={{
              fontSize: '36px',
              fontStyle: 'italic',
              color: '#dc2626',
              margin: '14px 0',
              display: 'flex',
            }}
          >
            vs.
          </div>

          {/* Manager B */}
          <div
            style={{
              fontSize: '78px',
              lineHeight: 1,
              fontWeight: 400,
              letterSpacing: '-0.01em',
              textAlign: 'center',
              display: 'flex',
              maxWidth: '100%',
            }}
          >
            {rv.manager_b.name}
          </div>

          {/* Rule */}
          <div
            style={{
              display: 'flex',
              width: '160px',
              height: '1px',
              background: '#374151',
              margin: '36px 0 28px',
            }}
          />

          {/* Record */}
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '24px',
              fontSize: '64px',
              letterSpacing: '0.04em',
            }}
          >
            <span style={{ display: 'flex', color: '#f3f4f6' }}>{aWins}</span>
            <span style={{ display: 'flex', color: '#6b7280', fontSize: '40px' }}>—</span>
            <span style={{ display: 'flex', color: '#f3f4f6' }}>{bWins}</span>
            {ties > 0 && (
              <>
                <span style={{ display: 'flex', color: '#6b7280', fontSize: '40px' }}>—</span>
                <span style={{ display: 'flex', color: '#f3f4f6' }}>{ties}</span>
              </>
            )}
            <span
              style={{
                display: 'flex',
                marginLeft: '16px',
                fontFamily: 'ui-monospace, "SF Mono", monospace',
                fontSize: '18px',
                letterSpacing: '0.28em',
                color: '#9ca3af',
                textTransform: 'uppercase',
              }}
            >
              All-time
            </span>
          </div>

          {/* Leader line */}
          <div
            style={{
              display: 'flex',
              marginTop: '20px',
              fontSize: '24px',
              fontStyle: 'italic',
              color: '#e8c889',
            }}
          >
            {leaderLine}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 64px 36px',
            fontFamily: 'ui-monospace, "SF Mono", monospace',
            fontSize: '16px',
            letterSpacing: '0.18em',
            color: '#6b7280',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ display: 'flex' }}>{metaLine}</span>
          <span style={{ display: 'flex', color: '#dc2626' }}>tsc.football</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        // Long-lived: bundle re-builds invalidate via league-<id> tag, and
        // we'd reissue a fresh URL anyway if rivalry stats change enough to
        // matter. Worth the headroom on share crawlers.
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
      },
    },
  )
}
