'use client'

// Small animated primitives shared by Clubhouse pages.
//
//   <CountUp>  — odometer-style number that counts from 0 when scrolled
//                into view. SSR renders the final value so no-JS readers
//                (and crawlers) still see real numbers.
//   <Reveal>   — fade/slide-in wrapper, staggered via the `delay` prop.
//   <DnaFill>  — gauge bar that sweeps to its percentage on first view.

import { useEffect, useRef } from 'react'

function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)
}

export function CountUp({
  value,
  decimals = 0,
  duration = 1800,
  className,
}: {
  value: number
  decimals?: number
  duration?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const fmt = (n: number) =>
      n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

    let raf = 0
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        const start = performance.now()
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration)
          el.textContent = fmt(value * easeOutExpo(t))
          if (t < 1) raf = requestAnimationFrame(tick)
        }
        el.textContent = fmt(0)
        raf = requestAnimationFrame(tick)
      },
      { threshold: 0.4 }
    )
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [value, decimals, duration])

  return (
    <span ref={ref} className={className}>
      {value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  )
}

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.classList.add('is-in')
          io.disconnect()
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`hub-reveal${className ? ` ${className}` : ''}`}
      style={delay ? ({ '--hb-reveal-delay': `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </div>
  )
}

export function DnaFill({ pct }: { pct: number }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.style.width = `${Math.max(0, Math.min(100, pct))}%`
          io.disconnect()
        }
      },
      { threshold: 0.5 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [pct])

  return <div ref={ref} className="hub-dna-fill" />
}
