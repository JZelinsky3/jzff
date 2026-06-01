// Shared types used by the Trade Builder client component AND server-side
// modules (Scout, recommendations engine, future trade-target finders).
// Kept in /lib so the 'use client' file at _builder.tsx isn't pulled into
// server bundles via type imports.

import type { LeagueMode } from '@/lib/values'

export type BuilderPlayer = {
  playerId: string
  name: string
  position: string
  team: string | null
  value: number
  tier: string | null
  age: number | null
}

export type BuilderRoster = {
  ownerId: string
  ownerName: string
  teamName: string
  isMe: boolean
  players: BuilderPlayer[]
  totalValue: number
}

export type BuilderLeague = {
  archiveLeagueId: string
  leagueName: string
  leagueSlug: string
  season: string
  mode: LeagueMode
  modeLabel: string
  valueProviderLabel: string
  myOwnerId: string
  qbStarters: number
  teamCount: number
  rosters: BuilderRoster[]
}
