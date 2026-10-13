import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ReportPage, reportMetadata } from '../ReportPage'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string; week: string }>; searchParams: Promise<{ tier?: string }> }

function weekOf(raw: string): number {
  const w = Number(raw)
  if (!Number.isInteger(w) || w < 1 || w > 18) notFound()
  return w
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, week } = await params
  return reportMetadata(slug, weekOf(week))
}

export default async function Page({ params, searchParams }: Props) {
  const { slug, week } = await params
  const { tier } = await searchParams
  return <ReportPage slug={slug} week={weekOf(week)} previewTier={tier ?? null} />
}
