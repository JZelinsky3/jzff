// The Press Wheel — Clubhouse loading spinner. A printing-press flywheel:
// outer dashed wheel spins one way, the inner segment arc counter-rotates,
// the hub star breathes. Pure SVG + CSS (animations live in hub.css), so
// it works from server and client components alike.

export function HubSpinner({ size = 44 }: { size?: number }) {
  return (
    <span className="hub-spinner" role="status" aria-label="Loading">
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <g className="wheel">
          <circle
            cx="24" cy="24" r="20"
            stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeDasharray="3.5 7.5"
            opacity=".9"
          />
        </g>
        <g className="seg">
          <circle
            cx="24" cy="24" r="13"
            stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeDasharray="42 40"
            opacity=".55"
          />
        </g>
        <path
          className="core"
          d="M24 19.4l1.45 2.94 3.25.47-2.35 2.29.56 3.23L24 26.8l-2.91 1.53.56-3.23-2.35-2.29 3.25-.47L24 19.4z"
          fill="currentColor"
        />
      </svg>
    </span>
  )
}
