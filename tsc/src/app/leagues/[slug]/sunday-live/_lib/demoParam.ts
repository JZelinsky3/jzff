// Demo query parsing (?demoWeek=YYYY-W&progress=0..1), shared by the desk
// page and the per-game page so a demo link carries into the game room and
// back. No 'use client': server pages import this.

import type { Demo } from './useSlPoll'

export type SP = Record<string, string | string[] | undefined>

export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export function parseDemo(sp: SP): Demo | null {
  const raw = first(sp.demoWeek)
  if (!raw) return null
  const m = /^(\d{4})-(\d{1,2})$/.exec(raw.trim())
  if (!m) return null
  const year = Number(m[1])
  const week = Number(m[2])
  if (!Number.isFinite(year) || !Number.isFinite(week) || week < 1 || week > 25) return null
  let progress = 0.5
  const p = first(sp.progress)
  if (p != null && Number.isFinite(Number(p))) progress = Math.max(0, Math.min(1, Number(p)))
  return { year, week, progress }
}

export function demoQuery(demo: Demo | null): string {
  return demo ? `?demoWeek=${demo.year}-${demo.week}&progress=${demo.progress}` : ''
}
