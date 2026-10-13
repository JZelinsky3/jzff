// The Cup's trophy: a two-handled loving cup on a stepped plinth, drawn in
// flat brass so it reads at 40px and at 400px.
//
// Called as a plain function, never as <Trophy />: the image routes render
// with satori, which has hung on custom components before (see the og
// routes' notes). The page calls it the same way so there is one drawing.

export function trophy(opts: {
  width: number
  brass: string
  light: string
  dark: string
  // The engraving plate on the plinth, normally the background colour.
  plate: string
}) {
  const { width, brass, light, dark, plate } = opts
  const height = Math.round((width * 240) / 200)
  return (
    <svg width={width} height={height} viewBox="0 0 200 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* handles */}
      <path d="M50 44 C14 44 12 104 64 114" fill="none" stroke={brass} strokeWidth="11" strokeLinecap="round" />
      <path d="M150 44 C186 44 188 104 136 114" fill="none" stroke={brass} strokeWidth="11" strokeLinecap="round" />
      {/* bowl */}
      <path d="M44 26 H156 V58 C156 108 130 138 100 138 C70 138 44 108 44 58 Z" fill={brass} />
      {/* rim */}
      <rect x="36" y="16" width="128" height="14" rx="3" fill={light} />
      {/* shine on the bowl */}
      <path d="M62 38 V60 C62 90 74 112 90 124" fill="none" stroke={light} strokeWidth="7" strokeLinecap="round" opacity="0.7" />
      {/* a band round the bowl */}
      <rect x="44" y="50" width="112" height="6" fill={dark} opacity="0.55" />
      {/* stem and knop */}
      <rect x="91" y="136" width="18" height="34" fill={brass} />
      <rect x="78" y="152" width="44" height="11" rx="5" fill={light} />
      {/* foot */}
      <path d="M64 170 H136 L146 194 H54 Z" fill={brass} />
      {/* plinth */}
      <rect x="40" y="194" width="120" height="34" rx="2" fill={dark} />
      <rect x="40" y="194" width="120" height="4" fill={light} opacity="0.5" />
      <rect x="64" y="204" width="72" height="14" rx="1" fill={plate} opacity="0.9" />
    </svg>
  )
}
