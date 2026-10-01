import type { Metadata } from 'next'
import Link from 'next/link'
import { isSubscriberToken, verifySubscriberToken, verifyUnsubscribeToken } from '@/lib/recap/links'
import { suppressionFor, userEmail } from '@/lib/recap/suppress'
import { subscriberById } from '@/lib/recap/subscribers'
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
  if (isSubscriberToken(t)) return <ListMember t={t!} done={done} />
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

// A mailing-list member: off this one league's list, or back on it.
async function ListMember({ t, done }: { t: string; done?: string }) {
  const id = verifySubscriberToken(t)
  const sub = id ? await subscriberById(id) : null
  if (!sub) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <h1>That link didn&apos;t work</h1>
          <p>It may have been cut off when it was copied.</p>
        </div>
      </main>
    )
  }
  const on = sub.status === 'active'
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.kicker}>The Sunday Chronicle</div>
        {on ? (
          <>
            <h1>{done === 'resume' ? "You're back on the list" : `Leave the ${sub.league.name} mailing list?`}</h1>
            <p>
              {done === 'resume'
                ? `The ${sub.league.name} paper will come to ${mask(sub.email)} again after next Monday night.`
                : `One email a week to ${mask(sub.email)}, the Tuesday after Monday night. Other leagues' lists you are on aren't affected.`}
            </p>
            {done !== 'resume' ? (
              <form method="post" action="/api/recap/unsubscribe/">
                <input type="hidden" name="t" value={t} />
                <input type="hidden" name="action" value="stop" />
                <button type="submit" className={styles.primary}>Leave the list</button>
              </form>
            ) : null}
          </>
        ) : (
          <>
            <h1>You&apos;re off the list</h1>
            <p>
              {done === 'stop' ? 'Done. ' : ''}We won&apos;t send the {sub.league.name} paper to {mask(sub.email)}. The
              recap pages are still there whenever you want them.
            </p>
            <form method="post" action="/api/recap/unsubscribe/">
              <input type="hidden" name="t" value={t} />
              <input type="hidden" name="action" value="resume" />
              <button type="submit" className={styles.secondary}>Put me back on</button>
            </form>
          </>
        )}
        <p className={styles.foot}>
          <Link href={`/leagues/${sub.league.slug}/recap/`}>This week&apos;s paper</Link>
        </p>
      </div>
    </main>
  )
}
