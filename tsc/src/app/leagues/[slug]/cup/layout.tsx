import { Barlow_Condensed } from 'next/font/google'
import { LeagueVisitPing } from '@/components/LeagueVisitPing'

// The Cup's scoreboard numerals: seeds, odds, scores and points. A condensed
// sports face, so a "58%" or a "12" reads like a bracket on a TV graphic
// rather than a table cell. Names and headlines stay in DM Serif.
const numerals = Barlow_Condensed({
  variable: '--font-cup-num',
  subsets: ['latin'],
  // 400: the bracket's open slots ("Noah/Adam").
  weight: ['400', '500', '600', '700'],
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className={numerals.variable}>
      {children}
      <LeagueVisitPing />
    </div>
  )
}
