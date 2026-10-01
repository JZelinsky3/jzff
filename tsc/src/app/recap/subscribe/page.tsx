import type { Metadata } from 'next'
import Link from 'next/link'
import { verifySubscriberToken } from '@/lib/recap/links'
import { recapFromAddress } from '@/lib/recap/resend'
import { subscriberById } from '@/lib/recap/subscribers'
import styles from '../unsubscribe/unsubscribe.module.css'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Confirm your email',
  robots: { index: false, follow: false },
}

// Where the confirmation email's button lands. Opening it changes nothing;
// the button does, because mail scanners open every link in an email.
export default async function RecapSubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; done?: string }>
}) {
  const { t, done } = await searchParams
  const id = verifySubscriberToken(t)
  const sub = id ? await subscriberById(id) : null

  if (!t || !sub) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <h1>That link didn&apos;t work</h1>
          <p>It may have been cut off when it was copied. Sign up again at the bottom of your league&apos;s recap page.</p>
        </div>
      </main>
    )
  }

  const paper = `/leagues/${sub.league.slug}/recap/`
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.kicker}>The Sunday Chronicle</div>
        {sub.status === 'active' ? (
          <>
            <h1>You&apos;re on the list</h1>
            <p>
              {done ? 'Confirmed. ' : ''}The {sub.league.name} paper will come to you every Tuesday morning, after Monday
              night.
            </p>
            <p className={styles.note}>
              Add {recapFromAddress()} to your contacts so it lands in your inbox. If you ever find it in spam, mark it
              as not spam once and it should stay out.
            </p>
            <p>
              <Link href={paper}>Read this week&apos;s paper</Link>
            </p>
          </>
        ) : (
          <>
            <h1>Get the {sub.league.name} paper every Tuesday?</h1>
            <p>One email a week, the morning after Monday night. Leave the list any time from the link at the bottom.</p>
            <form method="post" action="/api/recap/subscribe/confirm/">
              <input type="hidden" name="t" value={t} />
              <button type="submit" className={styles.primary}>Confirm my email</button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
