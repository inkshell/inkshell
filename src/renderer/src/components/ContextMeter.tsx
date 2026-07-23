import { fmtK } from '../lib/format'

interface Props {
  /** Live context size in tokens, or `null` before the first assistant reply. */
  tokens: number | null
  /** The active model's context window — the meter's denominator. */
  contextWindow: number
}

/** Fuel-gauge color for a fill fraction: green with room, amber loading, red near full. */
export function meterColor(fraction: number): string {
  if (fraction >= 0.85) return 'var(--error)'
  if (fraction >= 0.6) return 'var(--warn)'
  return 'var(--ok)'
}

/**
 * A mini fuel gauge plus `used/window · pct`, echoing the CLI's context
 * indicator. The bar fills and shifts green→amber→red as the window loads up.
 * Before the first assistant reply there is nothing to read, so it shows a muted
 * placeholder.
 */
export function ContextMeter({ tokens, contextWindow }: Props) {
  const fraction = tokens === null ? null : Math.min(1, tokens / contextWindow)
  const pct = tokens === null ? 0 : Math.min(100, Math.floor((tokens * 100) / contextWindow))
  const level = fraction === null ? 'var(--text-faint)' : meterColor(fraction)

  const label = tokens === null ? 'context —' : `${fmtK(tokens)}/${fmtK(contextWindow)} · ${pct}%`

  const labelClass =
    fraction !== null && fraction >= 0.85
      ? 'danger'
      : fraction !== null && fraction >= 0.6
        ? 'warn'
        : ''

  const tip =
    tokens === null
      ? 'Session context — no reply from Claude yet'
      : `Session context: ${tokens} of ${contextWindow} tokens`

  return (
    <div className="meter" title={tip}>
      <div className="meter-track">
        <div
          className="meter-fill"
          style={{
            width: `${fraction === null ? 0 : Math.max(fraction * 100, fraction > 0 ? 6 : 0)}%`,
            background: level
          }}
        />
      </div>
      <span className={`meter-label ${labelClass}`}>{label}</span>
    </div>
  )
}

/**
 * Just the `pct` half of the meter, colored on the same green→amber→red
 * scale — small enough to sit in a pane's title bar so every open quadrant
 * reads its own usage, not just the focused one (which gets the full
 * `ContextMeter` in the status bar).
 */
export function ContextPct({ tokens, contextWindow }: Props) {
  if (tokens === null) return null
  const fraction = Math.min(1, tokens / contextWindow)
  const pct = Math.min(100, Math.floor((tokens * 100) / contextWindow))
  return (
    <span
      className="pane-context"
      style={{ color: meterColor(fraction) }}
      title={`Session context: ${tokens} of ${contextWindow} tokens`}
    >
      {pct}%
    </span>
  )
}
