import { MobilePageShell } from '@/components/mobile/MobilePageShell'
import { ReviewForm } from '@/app/review/review-form'

// Phone tree for /review. Same shell as the other React content pages
// (mpg-), and the form runs in `compact` mode: smaller stars, tighter
// padding, shorter labels. Copy is cut to about half the desktop length,
// since the whole page has to fit above the fold for a one-tap review to
// feel like one tap.
export function MobileReview({
  initialRating,
  source,
  signedInEmail,
  signedIn,
}: {
  initialRating: number | null
  source: string | null
  signedInEmail: string | null
  signedIn: boolean
}) {
  return (
    <MobilePageShell
      backHref={signedIn ? '/dashboard' : '/'}
      barTitle="Review"
      signedIn={signedIn}
      kicker="Testing closes August 16"
      heroTitle="How did"
      heroTitleEm="it go?"
      heroSub="Tap a star. Add a note if you want. The harsh ones help most."
    >
      <ReviewForm
        initialRating={initialRating}
        source={source}
        signedInEmail={signedInEmail}
        compact
      />
    </MobilePageShell>
  )
}
