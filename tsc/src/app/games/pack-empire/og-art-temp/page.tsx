import { maskCard } from '@/lib/packEmpire/deal'
import { playerById } from '@/lib/packEmpire/pool'
import type { Player } from '@/lib/packEmpire/rules'
import { PackCard } from '../cards'
import { peFonts } from '../fonts'

// Temporary: real cards, large and flat, for the textures on the 3D art. Removed
// once they're captured.

export default async function Page({ searchParams }: { searchParams: Promise<{ ids?: string; blind?: string; back?: string }> }) {
  const sp = await searchParams
  const ids = (sp.ids ?? '').split(',').filter(Boolean)
  const blind = new Set((sp.blind ?? '').split(',').filter(Boolean))
  return (
    <main className={`pe-theme ${peFonts}`} style={{ padding: 40, display: 'flex', flexWrap: 'wrap', gap: 40, background: 'transparent' }}>
      <style>{`
        html, body { background: transparent !important; }
        nextjs-portal, nav, header, footer { display: none !important; }
        .cap .pe-card { --pe-cs: 2.6; cursor: default; animation: none !important; }
        .cap .pe-card * { animation-delay: 0s !important; }
      `}</style>
      {ids.map((id) => {
        const p = playerById(id) as Player | undefined
        if (!p) return <div key={id} data-missing={id} />
        return (
          <div key={id} className="cap" data-id={id}>
            <PackCard player={blind.has(id) ? maskCard(p, 'season') : p} revealed index={0} still disabled />
          </div>
        )
      })}
      {sp.back && (
        <div className="cap" data-id="back">
          <PackCard player={playerById(ids[0]) as Player} revealed={false} index={0} still disabled />
        </div>
      )}
    </main>
  )
}
