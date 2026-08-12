'use client'

// The awards, dealt one at a time.
//
// A trophy is a thing you hand over on its own, so the page shows exactly one
// card at a time: front is the verdict, back is the chasing pack and how the
// number was arrived at. Tap the card to turn it over, Next to hand out the
// next one.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Award } from '@/lib/seasonAwards'
import styles from './awards.module.css'

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th']

export function AwardsDeck({ awards }: { awards: Award[] }) {
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const touch = useRef<{ x: number; y: number } | null>(null)

  // The two faces are rarely the same length: a verdict is short, the field
  // behind it is long. Rather than pad the front out to the height of the
  // back, the card is measured and takes the height of whichever face is
  // showing. Before that measurement lands the faces stack in normal flow,
  // so the server-rendered card is never a collapsed sliver.
  const frontRef = useRef<HTMLElement>(null)
  const backRef = useRef<HTMLElement>(null)
  const [faceHeights, setFaceHeights] = useState<[number, number] | null>(null)

  const award = awards[index]
  const atStart = index === 0
  const atEnd = index === awards.length - 1

  // Moving to another trophy always deals it face up. Somebody who flipped the
  // last card is not asking to read the next one back to front.
  const go = useCallback(
    (delta: number) => {
      setIndex((i) => Math.min(awards.length - 1, Math.max(0, i + delta)))
      setFlipped(false)
    },
    [awards.length],
  )

  const jump = useCallback((to: number) => {
    setIndex(to)
    setFlipped(false)
  }, [])

  // Arrow keys walk the deck, as long as the arrow was not meant for a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])

  useLayoutEffect(() => {
    const measure = () => {
      const front = frontRef.current?.offsetHeight ?? 0
      const back = backRef.current?.offsetHeight ?? 0
      if (!front || !back) return
      setFaceHeights((prev) => (prev && prev[0] === front && prev[1] === back ? prev : [front, back]))
    }
    measure()
    // Fonts landing and the window changing width both change the answer.
    const observer = new ResizeObserver(measure)
    if (frontRef.current) observer.observe(frontRef.current)
    if (backRef.current) observer.observe(backRef.current)
    return () => observer.disconnect()
  }, [index])

  if (!award) return null

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.changedTouches[0]
    touch.current = { x: t.clientX, y: t.clientY }
  }

  // A sideways drag is a page turn. Anything else falls through to the tap
  // handler, which is the flip.
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current
    touch.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return
    go(dx < 0 ? 1 : -1)
  }

  return (
    <div className={styles.deck}>
      <div className={styles.rail} aria-hidden="true">
        {awards.map((a, i) => (
          <button
            key={a.key}
            type="button"
            className={`${styles.pip} ${i === index ? styles.pipOn : ''} ${i < index ? styles.pipDone : ''}`}
            onClick={() => jump(i)}
            title={a.title}
            tabIndex={-1}
          />
        ))}
      </div>

      <div
        className={styles.stage}
        onClick={() => setFlipped((f) => !f)}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className={`${styles.inner} ${faceHeights ? styles.measured : ''}`}
          data-flipped={flipped}
          style={faceHeights ? { height: faceHeights[flipped ? 1 : 0] } : undefined}
        >
          {/* Front: the verdict */}
          {/* inert rather than hidden: the face that is turned away must not
              be readable or focusable while it is turned away. */}
          <article ref={frontRef} className={`${styles.face} ${styles.front}`} inert={flipped}>
            <div className={styles.faceTop}>
              <span className={styles.count}>
                No. {index + 1} of {awards.length}
              </span>
              <span className={styles.awardKicker}>{award.kicker}</span>
            </div>

            <h2 className={styles.awardTitle}>{award.title}</h2>

            <div className={styles.winnerRow}>
              <span className={styles.winnerName}>{award.winner}</span>
              <span className={styles.winnerValue}>{award.value}</span>
            </div>

            <p className={styles.detail}>{award.detail}</p>

            <div className={styles.faceFoot}>
              <button
                type="button"
                className={styles.flipBtn}
                onClick={(e) => {
                  e.stopPropagation()
                  setFlipped(true)
                }}
              >
                {award.field.length > 1 ? 'Who else was close' : 'How this was decided'}
              </button>
            </div>
          </article>

          {/* Back: the field it beat */}
          <article ref={backRef} className={`${styles.face} ${styles.back}`} inert={!flipped}>
            <div className={styles.faceTop}>
              <span className={styles.count}>{award.title}</span>
              <span className={styles.awardKicker}>The field</span>
            </div>

            <ol className={styles.field}>
              {award.field.map((f, i) => (
                <li
                  key={`${f.name}-${f.note ?? ''}-${i}`}
                  className={`${styles.fieldRow} ${i === 0 ? styles.fieldWon : ''}`}
                >
                  <span className={styles.fieldRank}>{ORDINALS[i] ?? `${i + 1}th`}</span>
                  <span className={styles.fieldBody}>
                    <b>{f.name}</b>
                    {f.note && <em>{f.note}</em>}
                  </span>
                  <span className={styles.fieldValue}>{f.value}</span>
                </li>
              ))}
            </ol>

            <p className={styles.method}>{award.method}</p>

            <div className={styles.faceFoot}>
              <button
                type="button"
                className={styles.flipBtn}
                onClick={(e) => {
                  e.stopPropagation()
                  setFlipped(false)
                }}
              >
                Back to the trophy
              </button>
            </div>
          </article>
        </div>
      </div>

      <nav className={styles.controls}>
        <button type="button" className={styles.nav} onClick={() => go(-1)} disabled={atStart}>
          Previous
        </button>
        <span className={styles.tally}>
          {index + 1} / {awards.length}
        </span>
        <button
          type="button"
          className={`${styles.nav} ${styles.navNext}`}
          onClick={() => go(1)}
          disabled={atEnd}
        >
          Next
        </button>
      </nav>

      <p className={styles.hint}>
        {atEnd
          ? `That is all ${awards.length} of them. Tap the card to see the field behind any trophy.`
          : 'Tap the card to turn it over.'}
      </p>
    </div>
  )
}
