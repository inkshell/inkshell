import { useCallback, useRef, useState, type MouseEvent } from 'react'

interface TipState {
  text: string
  x: number
  y: number
  placement: 'above' | 'below'
}

const SHOW_DELAY_MS = 350

/**
 * A single floating tooltip shared by every row in a list, instead of one per
 * row. Shows the full text a row truncates with an ellipsis (a long path),
 * positioned off the hovered row's own rect — quicker to appear and less
 * move-sensitive than the browser's native `title`, which resets its delay
 * on every pixel the cursor crosses between rows in a dense list.
 *
 * `bind(text)` wires one row's hover handlers; render `<TooltipHost tip={tip}
 * />` once for the whole list (its `position: fixed` makes DOM placement
 * irrelevant).
 */
export function useTooltip() {
  const [tip, setTip] = useState<TipState | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const bind = useCallback(
    (text: string) => ({
      onMouseEnter: (e: MouseEvent<HTMLElement>) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const below = rect.bottom + 34 < window.innerHeight
        clearTimeout(timer.current)
        timer.current = setTimeout(
          () =>
            setTip({
              text,
              x: Math.min(rect.left, window.innerWidth - 420),
              y: below ? rect.bottom + 6 : rect.top - 6,
              placement: below ? 'below' : 'above'
            }),
          SHOW_DELAY_MS
        )
      },
      onMouseLeave: () => {
        clearTimeout(timer.current)
        setTip(null)
      }
    }),
    []
  )

  return { tip, bind }
}

export function TooltipHost({ tip }: { tip: TipState | null }) {
  if (!tip) return null
  return (
    <div className={`tooltip ${tip.placement}`} style={{ left: tip.x, top: tip.y }}>
      {tip.text}
    </div>
  )
}
