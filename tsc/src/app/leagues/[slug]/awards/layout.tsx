import { LeagueVisitPing } from '@/components/LeagueVisitPing'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <LeagueVisitPing />
    </>
  )
}
