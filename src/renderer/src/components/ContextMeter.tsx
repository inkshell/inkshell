import { CONTEXT_WINDOW } from '@shared/types'
import { fmtK } from '../lib/format'

interface Props {
  /** Live context size in tokens, or `null` before the first assistant reply. */
  tokens: number | null
}

/** Fuel-gauge color for a fill fraction: green with room, amber loading, red near full. */
function meterColor(fraction: number): string {
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
export function ContextMeter({ tokens }: Props) {
  const fraction = tokens === null ? null : Math.min(1, tokens / CONTEXT_WINDOW)
  const pct = tokens === null ? 0 : Math.min(100, Math.floor((tokens * 100) / CONTEXT_WINDOW))
  const level = fraction === null ? 'var(--text-faint)' : meterColor(fraction)

  const label = tokens === null ? 'contexto —' : `${fmtK(tokens)}/${fmtK(CONTEXT_WINDOW)} · ${pct}%`

  const labelClass =
    fraction !== null && fraction >= 0.85
      ? 'danger'
      : fraction !== null && fraction >= 0.6
        ? 'warn'
        : ''

  const tip =
    tokens === null
      ? 'Contexto da sessão — ainda sem resposta do Claude'
      : `Contexto da sessão: ${tokens} de ${CONTEXT_WINDOW} tokens (janela padrão de 200k)`

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
