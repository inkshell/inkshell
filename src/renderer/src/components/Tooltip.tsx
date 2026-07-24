import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type MouseEvent
} from 'react'

interface TipState {
  text: string
  /** Exactly one of these is set — which edge the tooltip grows away from. */
  left?: number
  right?: number
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
 * `bind(text)` wires one row's hover *and* keyboard-focus handlers (so tabbing
 * onto an icon-only button surfaces the same hint a mouse user gets); render
 * `<TooltipHost tip={tip} />` once for the whole list (its `position: fixed`
 * makes DOM placement irrelevant).
 */
export function useTooltip() {
  const [tip, setTip] = useState<TipState | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // A pending show can outlive the row (list re-filtered, component unmounted)
  // — drop it rather than let a stray `setTip` fire on the way out.
  useEffect(() => () => clearTimeout(timer.current), [])

  const bind = useCallback((text: string) => {
    const show = (target: HTMLElement) => {
      const rect = target.getBoundingClientRect()
      const below = rect.bottom + 34 < window.innerHeight
      // A tooltip up to max-width 420px anchored at the trigger's left edge
      // would overflow off the right of the window — anchor it at the right
      // edge instead so it grows leftward and stays glued to the trigger,
      // rather than clamping `left` and leaving it stranded far to the left.
      const fitsRight = rect.left + 420 <= window.innerWidth
      clearTimeout(timer.current)
      timer.current = setTimeout(
        () =>
          setTip({
            text,
            ...(fitsRight
              ? { left: Math.max(0, rect.left) }
              : { right: Math.max(0, window.innerWidth - rect.right) }),
            y: below ? rect.bottom + 6 : rect.top - 6,
            placement: below ? 'below' : 'above'
          }),
        SHOW_DELAY_MS
      )
    }
    const hide = () => {
      clearTimeout(timer.current)
      setTip(null)
    }
    return {
      onMouseEnter: (e: MouseEvent<HTMLElement>) => show(e.currentTarget),
      onMouseLeave: hide,
      onFocus: (e: FocusEvent<HTMLElement>) => show(e.currentTarget),
      onBlur: hide
    }
  }, [])

  return { tip, bind }
}

export function TooltipHost({ tip }: { tip: TipState | null }) {
  if (!tip) return null
  const style: CSSProperties = { top: tip.y }
  if (tip.left !== undefined) style.left = tip.left
  else style.right = tip.right
  return (
    <div className={`tooltip ${tip.placement}`} style={style}>
      {tip.text}
    </div>
  )
}
