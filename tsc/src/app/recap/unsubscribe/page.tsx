import type { Metadata } from 'next'
import Link from 'next/link'
import { verifyUnsubscribeToken } from '@/lib/recap/links'
import { suppressionFor, userEmail } from '@/lib/recap/suppress'
import styles from './unsubscribe.module.css'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Recap emails',
  robots: { index: false, follow: false },
}

// j***@gmail.com. Enough for the owner to recognise, not enough to read off
// a forwarded email.
function mask(email: string): string {
  const [local, domain] = email.split('@')
  return `${local.slice(0, 1)}${'*'.repeat(Math.max(2, Math.min(6, local.length - 1)))}@${domain}`
}

// Opening this page changes nothing. Only the button does, because mail
// scanners open every link in an email and must not unsubscribe anyone.
export default async function RecapUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; done?: string }>
}) {
  const { t, done } = await searchParams
  const userId = verifyUnsubscribeToken(t)
  const user = userId ? await userEmail(userId) : null

  if (!t || !user) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <h1>That link didn&apos;t work</h1>
          <p>It may have been cut off when it was copied. You can also turn email off from your account settings.</p>
          <p><Link href="/account/">Account settings</Link></p>
        </div>
      </main>
    )
  }

  const suppressed = await suppressionFor(user.email)
  const off = suppressed !== null
  const locked = suppressed === 'bounce' || suppressed === 'complaint'

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.kicker}>The Sunday Chronicle</div>
        {off ? (
          <>
            <h1>Recap emails are off</h1>
            <p>
              {done === 'stop' ? 'Done. ' : ''}We won&apos;t send weekly recaps to {mask(user.email)}. Your league&apos;s
              recap pages are still there whenever you want them.
            </p>
            {locked ? (
              <p className={styles.note}>
                Email to this address bounced or was marked as spam, so it stays off. Reply to any Sunday Chronicle
                email or use the help button on the site if that was a mistake.
              </p>
            ) : (
              <form method="post" action="/api/recap/unsubscribe/">
                <input type="hidden" name="t" value={t} />
                <input type="hidden" name="action" value="resume" />
                <button type="submit" className={styles.secondary}>Turn them back on</button>
              </form>
            )}
          </>
        ) : (
          <>
            <h1>{done === 'resume' ? 'Recap emails are back on' : 'Stop weekly recap emails?'}</h1>
            <p>
              {done === 'resume'
                ? `Recaps will go to ${mask(user.email)} again after next Monday night.`
                : `One email a week to ${mask(user.email)}, the Tuesday after Monday night, about the league you run.`}
            </p>
            {done === 'resume' && user.productEmailOff ? (
              <p className={styles.note}>
                Product email is also turned off in your account settings, and recaps follow that setting. Turn it on
                there as well if you want them.
              </p>
            ) : null}
            {done !== 'resume' ? (
              <form method="post" action="/api/recap/unsubscribe/">
                <input type="hidden" name="t" value={t} />
                <input type="hidden" name="action" value="stop" />
                <button type="submit" className={styles.primary}>Stop recap emails</button>
              </form>
            ) : null}
          </>
        )}
        <p className={styles.foot}><Link href="/account/">Account settings</Link></p>
      </div>
    </main>
  )
}
