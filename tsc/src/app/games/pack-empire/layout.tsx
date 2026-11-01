import { loadFaces } from '@/lib/packEmpire/faces'
import { FacesProvider } from './faces'
import './pack-empire.css'
import './foil.css'
import './canton.css'
import './unveil.css'
import './board.css'
import './locker.css'

// Loads the game's stylesheet and hands uploaded photos to every Pack Empire
// route. It renders nothing of its own: each page owns its <main>, because the
// games section's mobile chrome hides the site hamburger with
// `main ~ .msm-root`, which a wrapper element here would break.
export default async function PackEmpireLayout({ children }: { children: React.ReactNode }) {
  // Cards fall back to the pool's photos: a missing upload is no reason to
  // take the game down.
  const faces = await loadFaces().catch(() => ({}))
  return <FacesProvider faces={faces}>{children}</FacesProvider>
}
