// The top of a Pack Empire profile: the best card they've kept, and the player at
// a glance beside it (top score, the binder, the record, favourites, the Daily),
// then a few facts only they have. Yours and a friend's look the same; `you`
// changes the empty states, which point you at a game instead of saying nothing.
// Static: nothing here moves.

import Link from 'next/link'
import { RARITIES, RARITY_LOOK, playHref } from '@/lib/packEmpire/rules'
import type { PeProfile, WLT } from '@/lib/packEmpire/profile'
import { PackCard } from '../cards'
import { TierBadge } from '../TierBadge'

const wlt = (r: WLT) => (r.t ? `${r.w}-${r.l}-${r.t}` : `${r.w}-${r.l}`)
const times = (n: number) => `${n} ${n === 1 ? 'time' : 'times'}`

export function ProfileHero({ profile, you }: { profile: PeProfile; you: boolean }) {
  const { best, favPlayer, favTeam, top, collected, record, daily, facts } = profile
  const pct = collected.of ? Math.round((collected.owned / collected.of) * 100) : 0
  const played = record.versus || record.mega || record.titles

  return (
    <section className="pe-ph" aria-label="Profile">
      <div className="pe-ph-best">
        <div className="pe-ph-kick">Best Card</div>
        {best ? (
          <PackCard player={best} revealed serial={best.serial ?? null} />
        ) : (
          <div className="pe-ph-none">
            <span>{you ? 'Your best card goes here' : 'No cards kept yet'}</span>
            {you && (
              <Link href={playHref('open')} className="pe-act">
                Open Packs
              </Link>
            )}
          </div>
        )}
        {best && <div className="pe-ph-best-line">{RARITY_LOOK[best.rarity].label} · {best.score.toLocaleString()}</div>}
      </div>

      <div className="pe-ph-body">
        <div className="pe-ph-tiles">
          <div className="pe-ph-tile">
            <div className="pe-ph-kick">Top Score</div>
            {top ? (
              <>
                <Link href={top.href} className="pe-ph-big">
                  {top.score.toLocaleString()}
                </Link>
                <div className="pe-ph-row">
                  <TierBadge score={top.score} />
                  <span className="pe-ph-note">{top.board}</span>
                </div>
              </>
            ) : (
              <div className="pe-ph-note">No Builder runs yet</div>
            )}
          </div>

          <div className="pe-ph-tile">
            <div className="pe-ph-kick">Cards Collected</div>
            <div className="pe-ph-big">
              {collected.owned.toLocaleString()}
              <small> of {collected.of.toLocaleString()}</small>
            </div>
            <div className="pe-ph-rar" aria-label={`${pct}% of the binder`}>
              {RARITIES.map((r) => {
                const b = collected.byRarity[r]
                if (!b?.of) return null
                return (
                  <span key={r} className="pe-ph-rar-row" style={{ '--rc': RARITY_LOOK[r].color } as React.CSSProperties}>
                    <b>{RARITY_LOOK[r].short}</b>
                    <i>
                      <em style={{ width: `${Math.min(100, (b.owned / b.of) * 100)}%` }} />
                    </i>
                    <small>{b.owned}</small>
                  </span>
                )
              })}
            </div>
            <div className="pe-ph-note">{collected.packs.toLocaleString()} packs opened</div>
          </div>

          <div className="pe-ph-tile">
            <div className="pe-ph-kick">Record</div>
            {played ? (
              <dl className="pe-ph-rec">
                {record.versus && (
                  <div>
                    <dt>Versus</dt>
                    <dd>{wlt(record.versus)}</dd>
                  </div>
                )}
                {record.mega && (
                  <div>
                    <dt>Mega Draft</dt>
                    <dd>{wlt(record.mega)}</dd>
                  </div>
                )}
                {record.titles > 0 && (
                  <div>
                    <dt>League</dt>
                    <dd>
                      {record.titles} {record.titles === 1 ? 'title' : 'titles'}
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <div className="pe-ph-note">No games against people yet</div>
            )}
          </div>

          <div className="pe-ph-tile">
            <div className="pe-ph-kick">Favorite Player</div>
            {favPlayer ? (
              <>
                <div className="pe-ph-mid">{favPlayer.card.name}</div>
                <div className="pe-ph-note">Kept {times(favPlayer.pulls)}</div>
              </>
            ) : (
              <div className="pe-ph-note">Keep the same man twice</div>
            )}
          </div>

          <div className="pe-ph-tile">
            <div className="pe-ph-kick">Favorite Team</div>
            {favTeam ? (
              <div className="pe-ph-team">
                {favTeam.logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={favTeam.logo} alt="" width={40} height={40} />
                )}
                <span>
                  <span className="pe-ph-mid">{favTeam.team}</span>
                  <span className="pe-ph-note">{favTeam.pulls} cards kept</span>
                </span>
              </div>
            ) : (
              <div className="pe-ph-note">Keep two of one team</div>
            )}
          </div>

          <div className="pe-ph-tile">
            <div className="pe-ph-kick">The Daily</div>
            {daily ? (
              <>
                <div className="pe-ph-big">
                  {daily.days}
                  <small> {daily.days === 1 ? 'day' : 'days'}</small>
                </div>
                <div className="pe-ph-note">Best streak {daily.streak} in a row</div>
              </>
            ) : (
              <>
                <div className="pe-ph-note">Not played yet</div>
                {you && (
                  <Link href="/games/pack-empire/daily/" className="pe-act">
                    Play Today
                  </Link>
                )}
              </>
            )}
          </div>
        </div>

        {facts.length > 0 && (
          <ul className="pe-ph-facts">
            {facts.map((f) => (
              <li key={f.kick}>
                <span className="pe-ph-kick">{f.kick}</span>
                <span>{f.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
