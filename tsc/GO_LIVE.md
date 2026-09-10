# Go-live checklist

Ending the free period. Written 2026-09-10 for a **flip on Sept 17, 2026**
(7 days' notice). Everything here is reversible except the emails.

## What actually ends the free period

One environment variable: **`TRIAL_SLOT_ENDS_AT`**.

The old `TESTING_MODE_UNTIL` is dead. `isTestingModeActive()` exists but
nothing has called it for months, so flipping it changes nothing. What kept
everyone free was the **trial slot**: `resolveLeagueTier` marks each owner's
earliest league `'test'`, and `'test'` bypasses every lock. 92 of 101 leagues
were sitting on it.

`trialSlotActive()` now gates that. Past the date, `'test'` stops being a tier
the server can return: comp, paid, or UDFA, nothing else. A new free signup is
UDFA from the day they create their league.

**No data moves and nothing needs re-syncing.** The almanac bundle is built
from the database per request (1h cache), so the locks engage on their own
within the hour. Nothing is deleted, no league goes offline, every URL keeps
working, and subscribing puts the locked chapters straight back.

## Env vars to set in Vercel (production)

The code defaults are already correct for a Sept 17 flip. **The risk is a
stale value already set in Vercel overriding a correct default**. Check each
one is either absent or matching:

| Variable | Value | What it does |
|---|---|---|
| `TRIAL_SLOT_ENDS_AT` | `2026-09-17T04:00:00Z` | The flip. Free leagues become UDFA. |
| `LAUNCH_OFFER_ENDS_AT` | `2026-09-21T03:59:59Z` | Last moment to start a subscription and get the first month free (Sept 20, 11:59pm ET). |
| `STRIPE_TRIAL_DAYS` | `10` | Standard trial once the launch offer closes. |

Dates are ISO UTC. ET midnight is `04:00:00Z`; ET 11:59:59pm is `03:59:59Z`
the next day.

**`STRIPE_TRIAL_DAYS` is currently set to `7` in Vercel** (confirmed by the
live pricing hero rendering "7-day free trial" while the deployed code's
fallback was 10). Change it to `10` there. The code default is now 10 as well,
so deleting the variable outright also works. This is the only one of the three that has a
stale value in Vercel today.

The old `TESTER_FREE_MONTH_CUTOFF`, `TESTER_FREE_MONTH_REDEEM_BY` and
`TESTER_TRIAL_STARTS` are **gone** and read by nothing. Delete them from Vercel
so nobody wires them back up.

## The launch offer: first month free

One rule: **start a subscription before `LAUNCH_OFFER_ENDS_AT` and the first
30 days are free.** After it, the standard 10-day trial. Eligibility is
"you have never subscribed", which checkout already computes for its
one-trial-per-user rule, so there is no signup-date lookup and nothing for a
user to prove.

The 30 days never begin before `TRIAL_SLOT_ENDS_AT`. Subscribing during the
notice week still gets full access free until the 17th, and the month starts
counting then, which is why the grant is an absolute `trial_end` rather than a
day count.

It is a **Stripe trial**, not a coupon: a card is required. Stripe also
accepts only one promotion code per checkout, so a coupon here would block the
launch discount.

Two things that will bite:

- **One trial per user, ever.** `/api/stripe/checkout` sets
  `trialEligible = !existing`, so anyone with a prior subscription row gets
  billed immediately, free month or not. Two accounts currently hold canceled
  tier1 subs and will hit this. Comp them by hand if they complain.
- **The `FIRST50` coupon must be `duration: repeating, duration_in_months: 2`**
  or it expires during the 30-day trial and never touches a real charge.

**Pick the deadline deliberately.** Sept 20 is three days after the flip. If
the launch email goes out on the 17th, anyone who doesn't open it that week
misses the month. It is one env var, so a later date costs nothing.

## Before you send the email

```bash
cd ~/Desktop/jzff/tsc
node scripts/preview-launch-impact.mjs            # who flips, and to what
node scripts/preview-launch-impact.mjs --emails   # the 92 owners to notify
```

Confirmed 2026-09-10: **92 leagues go `test` → `udfa`, across 92 owners.**
7 comp, 2 paid. One league already carries a deletion date from a lapsed
subscription. Unrelated to this, but it shows up in the same report.

Contacts for the broadcast come from `GET /api/admin/audience` (linked from
`/admin`). A sent Resend broadcast cannot be re-sent; latecomers need the
standing second audience. See `project_tsc_testing_close_broadcast`.

### Deliverability: why the August send failed

It went to **spam**. The only review on file came from Joey's own inbox after
he went looking for it, so the real result was 0 reviews from ~165 contacts.
The copy was never the problem.

The DNS is correct and was verified on 2026-09-10:

```
send.thesundaychronicle.app   TXT  v=spf1 include:amazonses.com ~all
send.thesundaychronicle.app   MX   feedback-smtp.us-east-1.amazonses.com
resend._domainkey...          TXT  (DKIM public key present)
_dmarc...                     TXT  v=DMARC1; p=quarantine; adkim=r; aspf=r
```

`p=quarantine` means anything failing alignment is sent to spam **by our own
policy**. A message signed for `thesundaychronicle.app` passes; a message from
the shared `onboarding@resend.dev` sandbox does not benefit from any of it and
is filtered on that domain's reputation alone. That is almost certainly what
happened.

Before sending:

1. Domain reads **Verified** in the Resend dashboard.
2. From is an address **at thesundaychronicle.app**, never `onboarding@resend.dev`.
3. Reply-To is an inbox actually read. The email invites replies.
4. Paste `launch-notice.txt` into the broadcast's text version rather than
   letting Resend auto-generate one from the table markup.
5. Send a test to a **Gmail** address and confirm it lands in Primary, not
   Promotions or Spam. Resend's own preview proves nothing about placement.

Templates: `scripts/emails/launch-notice.html` + `.txt`. The two
`testing-close*.html` files are superseded and every date in them is wrong.

## Do NOT run

**`scripts/end-testing-session.mjs`.** It schedules *deletion*: a 3-month
`grace_period_ends_at` on every free league, which contradicts the promise
that data stays, and would also drop the whole free tier out of the minigame
pools. It now refuses to run without `--i-mean-it`.

## Comp grants notify nobody

`grantComp()` writes a `comp_grants` row, clears any pending grace period,
and revalidates `/admin`. That is all. **No email, no banner, no toast.** The
user only finds out if they happen to open `/account`, `/pricing` or
`/dashboard`, so tell them yourself when you grant one.

Fixed 2026-09-10: every one of those three surfaces used to say a comp had
**"no expiration"**, which stopped being true when migration 0063 added
`expires_at`. Someone on a 3-month comp was told in three places it would
never end, then would have found out when their leagues locked. They now read
"Comped through December 10" wherever a grant has an end date, via
`compExpiryLabel()` in `lib/siteAdmin.ts`. Permanent grants are unchanged.

Still true and worth knowing: **nothing warns a comped user that their grant
is about to lapse**, and nothing emails them when it does. If you hand out
1-month comps, put the date in your own calendar.

## What the free tier gets after the flip

Open: home/hub, all-time standings, rivalries, seasons index **and individual
season pages**, managers index, manager profile shell.

Locked: live-season subpages, Sunday Live, draft history, the record book,
Pick'ems, Power Rankings, Manager DNA, Best Coach, Trade Desk, Manager Hub,
the All-Time Team pool and the Mock Room.

Games are **not** tier-gated. `/games` never goes through the almanac route.
But UDFA sync passes `{ drafts: false, trades: false }`, so a league synced
fresh as UDFA has no `draft_picks`, and the two games that read them can't
deal:

| Game | UDFA |
|---|---|
| Roster Roulette | yes (lineups) |
| The Gauntlet | yes (matchups) |
| The Over/Under | yes (matchups) |
| Multiverse Draft | yes, thinner (lineups only) |
| Guess the Draft | **no**, needs drafts |
| Redraft | **no**, needs drafts |

The 92 existing leagues already have their drafts ingested from the free
period, and the flip doesn't delete them, so **all six games keep working for
everyone who is here today**. Only leagues created UDFA from scratch lose two.
Flipping `drafts: true` for UDFA in `/api/leagues/[id]/sync` would close that
gap without unlocking a single paid page. Considered 2026-09-10 and
deliberately left alone.
