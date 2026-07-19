import Link from 'next/link'
import type { Metadata } from 'next'
import s from './buttons.module.css'

// Internal preview of CTA button concepts for the broadsheet (/new)
// redesign — less box, more print. Each concept renders at hero size and
// nav size with its hover behavior wired, on the real site fonts. Kept
// out of search like the other /design previews.
export const metadata: Metadata = {
  title: 'Button concepts · internal',
  robots: { index: false, follow: false },
}

export default function ButtonPreviewPage() {
  return (
    <main className={s.page}>
      <Link href="/" className={s.back}>
        ← Back to home
      </Link>
      <p className={s.kicker}>Internal · CTA design preview</p>
      <h1 className={s.title}>
        Six ways to press <em>without a box.</em>
      </h1>
      <p className={s.sub}>
        Candidates for the site-wide CTA language. Each shows the hero size and
        the nav size, and every one is hoverable. Try them. The ticket stubs
        stay on /new for comparison.
      </p>

      <section className={s.section}>
        <p className={s.head}>1 · The double rule</p>
        <p className={s.note}>
          Mono caps between newspaper section rules: hairline above, double rule
          below, no sides. Hover: the rules slide apart and the gold brightens.
        </p>
        <div className={s.row}>
          <a className={s.rule}>Start your chronicle</a>
          <a className={`${s.rule} ${s.ruleSmall}`}>Start free</a>
        </div>
      </section>

      <section className={s.section}>
        <p className={s.head}>2 · The headline</p>
        <p className={s.note}>
          Serif italic gold on a thick rule: the site&rsquo;s heading accent as
          a pressable headline. Hover: the rule thickens and goes bright.
        </p>
        <div className={s.row}>
          <a className={s.headline}>Start your chronicle.</a>
          <a className={`${s.headline} ${s.headlineSmall}`}>Start free.</a>
        </div>
      </section>

      <section className={s.section}>
        <p className={s.head}>3 · The star flanks</p>
        <p className={s.note}>
          The masthead&rsquo;s ★ … ★ motif promoted to the CTA. Hover: the stars
          quarter-turn and the underline goes gold.
        </p>
        <div className={s.row}>
          <a className={s.stars}>
            <i>★</i>
            <span>Start your chronicle</span>
            <i>★</i>
          </a>
          <a className={`${s.stars} ${s.starsSmall}`}>
            <i>★</i>
            <span>Start free</span>
            <i>★</i>
          </a>
        </div>
      </section>

      <section className={s.section}>
        <p className={s.head}>4 · The seal</p>
        <p className={s.note}>
          An embossed wax-seal star plus underlined serif italic. No box
          anywhere, but the seal makes it read as a button. Hover: the seal
          tilts, the underline brightens.
        </p>
        <div className={s.row}>
          <a className={s.seal}>
            <i>★</i>
            <span>Start your chronicle</span>
          </a>
          <a className={`${s.seal} ${s.sealSmall}`}>
            <i>★</i>
            <span>Start free</span>
          </a>
        </div>
      </section>

      <section className={s.section}>
        <p className={s.head}>5 · The dateline</p>
        <p className={s.note}>
          A micro-kicker over a serif line over an engraved rule, like a
          story&rsquo;s dateline, so the button carries its own fine print.
          Hover: the kicker letters spread and the rule goes gold.
        </p>
        <div className={s.row}>
          <a className={s.dateline}>
            <b>No card · 5 min</b>
            <span>
              Start your <em>chronicle.</em>
            </span>
            <span className={s.datelineRule} />
          </a>
          <a className={`${s.dateline} ${s.datelineSmall}`}>
            <b>Free</b>
            <span>
              Start <em>free.</em>
            </span>
            <span className={s.datelineRule} />
          </a>
        </div>
      </section>

      <section className={s.section}>
        <p className={s.head}>6 · The ink slab</p>
        <p className={s.note}>
          Still filled gold, but a skewed brush of ink instead of a rectangle.
          Hover: the swipe stretches.
        </p>
        <div className={s.row}>
          <a className={s.slab}>Start your chronicle</a>
          <a className={`${s.slab} ${s.slabSmall}`}>Start free</a>
        </div>
      </section>

      <p className={s.foot}>
        Pick a number (or a pair: one primary, one secondary) and it gets
        rolled through /new, login, and eventually site-wide.
      </p>
    </main>
  )
}
