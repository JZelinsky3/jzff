// GET /leagues/<slug>/pickems/data — live pick'ems state for the public page.
// Not cached: picks change every submission, and the live week is time-sensitive.

import { NextResponse } from 'next/server'
import { getPickemsState } from '@/lib/pickems'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params
  const state = await getPickemsState(slug)
  if (state === null) return new NextResponse('League not found', { status: 404 })
  return NextResponse.json(state, { headers: { 'Cache-Control': 'no-store' } })
}
