import './pack-empire.css'

// Only here to load the game's stylesheet for every Pack Empire route. It
// renders nothing of its own: each page owns its <main>, because the games
// section's mobile chrome hides the site hamburger with `main ~ .msm-root`,
// which a wrapper element here would break.
export default function PackEmpireLayout({ children }: { children: React.ReactNode }) {
  return children
}
