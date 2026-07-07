import Link from 'next/link'
import { MobilePageShell } from '@/components/mobile/MobilePageShell'
import { SECTIONS } from '@/app/guides/_data'

export function MobileGuides({ signedIn }: { signedIn: boolean }) {
  return (
    <MobilePageShell
      backHref="/"
      barTitle="Guides"
      signedIn={signedIn}
      kicker="Fantasy football archive guides"
      heroTitle="League history,"
      heroTitleEm="done right."
      heroSub="Practical how-tos, buyer's comparisons, and the editorial case for keeping your league's story alive."
    >
      {SECTIONS.map((section) => (
        <div key={section.kicker}>
          <div className="mpg-section-head">
            ★ {section.kicker} · <em>{section.title} {section.titleEm}</em>
          </div>
          <div className="mpg-guide-list">
            {section.guides.map((g) => (
              <Link key={g.slug} href={`/guides/${g.slug}/`} className="mpg-guide-card">
                {g.chip && <div className="mpg-guide-card-kicker">{g.chip}</div>}
                <div className="mpg-guide-card-title">{g.title}</div>
                <div className="mpg-guide-card-blurb">{g.tagline}</div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </MobilePageShell>
  )
}
