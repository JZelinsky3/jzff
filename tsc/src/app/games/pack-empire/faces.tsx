'use client'

// Uploaded photos, handed down from the Pack Empire layout. Anything that draws
// a card asks here first, so an upload reaches every card on screen, including
// ones in lineups saved before it existed. See lib/packEmpire/faces.ts.

import { createContext, useContext } from 'react'
import type { FaceMap } from '@/lib/packEmpire/faces'
import type { Player } from '@/lib/packEmpire/rules'

const Faces = createContext<FaceMap>({})

export function FacesProvider({ faces, children }: { faces: FaceMap; children: React.ReactNode }) {
  return <Faces.Provider value={faces}>{children}</Faces.Provider>
}

export function useFaces(): FaceMap {
  return useContext(Faces)
}

/** The photo to draw for a card. */
export function useFace(player: Pick<Player, 'id' | 'img'>): string | null {
  return useFaces()[player.id] ?? player.img
}
