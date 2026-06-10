// Empty / error placeholder used in a few spots on the hub.

export function EmptyState({
  kicker,
  title,
  children,
}: {
  kicker?: string
  title: string
  children?: React.ReactNode
}) {
  return (
    <div className="sl-card mx-auto max-w-xl px-6 py-10 text-center">
      {kicker && (
        <div className="sl-ff-mono mb-2 text-[0.58rem] uppercase tracking-[0.24em] text-sl-ember">
          {kicker}
        </div>
      )}
      <div className="sl-ff-serif mb-3 text-2xl italic text-sl-cream">{title}</div>
      {children && <div className="text-sm italic text-sl-mute">{children}</div>}
    </div>
  )
}
