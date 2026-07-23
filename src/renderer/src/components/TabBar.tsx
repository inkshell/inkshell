import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties
} from 'react'
import type { Tab } from '../types'
import {
  CloseIcon,
  CommitIcon,
  DiffIcon,
  DoubleChevronIcon,
  FileTextIcon,
  PanelRightIcon,
  PlusIcon,
  SidebarIcon
} from './Icons'

const DRAG_THRESHOLD = 4 // px a press must travel before it becomes a drag
const SETTLE_MS = 170 // grabbed-tab settle glide; must match the CSS transition

/** The glyph a viewer tab wears in place of a chat's project-colour dot. */
function tabGlyph(kind: Tab['kind']) {
  if (kind === 'diff') return <DiffIcon size={12} />
  if (kind === 'commit') return <CommitIcon size={12} />
  return <FileTextIcon size={12} />
}

interface Props {
  tabs: Tab[]
  activeTabId: string | null
  /** Resolves a tab's working directory to its project accent colour, if any. */
  projectColor: (cwd: string | null) => string | null
  /** macOS + collapsed sidebar: pad the row clear of the traffic lights. */
  reserveTrafficLights: boolean
  onNewChat: () => void
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  /** Reorder: move tab `id` to final position `toIndex` in the list. */
  onReorderTab: (id: string, toIndex: number) => void
  onToggleSidebar: () => void
  onTogglePanel: () => void
}

export function TabBar({
  tabs,
  activeTabId,
  projectColor,
  reserveTrafficLights,
  onNewChat,
  onSelectTab,
  onCloseTab,
  onReorderTab,
  onToggleSidebar,
  onTogglePanel
}: Props) {
  const stripRef = useRef<HTMLDivElement>(null)
  // Whether tabs are scrolled off each edge — drives the dissolve masks and
  // the nudge chevrons (each side only appears when it has something hidden).
  const [overflow, setOverflow] = useState({ left: false, right: false })

  const measure = useCallback(() => {
    const el = stripRef.current
    if (!el) return
    const left = el.scrollLeft > 1
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setOverflow((prev) => (prev.left === left && prev.right === right ? prev : { left, right }))
  }, [])

  // Re-measure when the tab count changes and whenever the strip is resized.
  useLayoutEffect(measure, [tabs.length, measure])
  useEffect(() => {
    const el = stripRef.current
    if (!el) return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure])

  // Keep the active tab in view when it changes (new chat, ⌘W, resume focus).
  useEffect(() => {
    const el = stripRef.current
    if (!el || !activeTabId) return
    const node = el.querySelector<HTMLElement>(`[data-tab-id="${activeTabId}"]`)
    if (!node) return
    const strip = el.getBoundingClientRect()
    const tab = node.getBoundingClientRect()
    if (tab.left < strip.left) el.scrollBy({ left: tab.left - strip.left - 12, behavior: 'smooth' })
    else if (tab.right > strip.right)
      el.scrollBy({ left: tab.right - strip.right + 12, behavior: 'smooth' })
  }, [activeTabId, tabs.length])

  // A plain mouse only emits vertical wheel deltas — translate them to
  // horizontal so the strip scrolls without a trackpad. (Native horizontal
  // swipes still pass straight through.)
  const onWheel = useCallback((e: React.WheelEvent) => {
    const el = stripRef.current
    if (!el || el.scrollWidth <= el.clientWidth) return
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY
  }, [])

  const nudge = useCallback((dir: -1 | 1) => {
    stripRef.current?.scrollBy({ left: dir * 240, behavior: 'smooth' })
  }, [])

  // Drag-to-reorder — a horizontal-only, pointer-driven slide (never the
  // browser's free-floating HTML5 ghost). The grabbed tab tracks the cursor's
  // X and nothing else; the tabs it passes glide aside to open its landing
  // slot; on release it settles into that gap and the array commits — so the
  // real reorder happens exactly once, with no mid-drag reshuffle.
  //
  // `drag` drives the render (offsets + which slot is targeted); `gestureRef`
  // holds the immutable geometry measured at grab time so pointermove stays a
  // pure arithmetic step.
  const [drag, setDrag] = useState<{
    id: string
    from: number
    dx: number
    target: number
    slot: number // the grabbed tab's footprint — how far passed tabs glide
    settling: boolean
  } | null>(null)
  const gestureRef = useRef<{
    id: string
    from: number
    pointerId: number
    startX: number
    centers: number[] // original viewport-X centre of each tab
    slots: number[] // each tab's footprint (width + gap)
    moved: boolean
    target: number
  } | null>(null)
  // Set on a real drag so the click that follows pointerup doesn't also select
  // the tab; cleared on the next press so it never suppresses a genuine click.
  const draggedRef = useRef(false)

  const onPointerDown = useCallback(
    (e: React.PointerEvent, index: number) => {
      draggedRef.current = false
      // Any gesture still armed here never got its release — the OS took the
      // press, or a second pointer barged in. Drop it, along with any transform
      // it stranded on screen, so its stale startX can't warp this press. This
      // happens before the early returns below: a press we go on to ignore
      // (right button, the close button) must still clear it.
      if (gestureRef.current) {
        gestureRef.current = null
        setDrag(null)
      }
      // Left button only, and never when the press lands on the close button.
      if (e.button !== 0 || (e.target as HTMLElement).closest('.tab-close')) return
      const strip = stripRef.current
      if (!strip) return
      const nodes = Array.from(strip.querySelectorAll<HTMLElement>('.tab'))
      const rects = nodes.map((n) => n.getBoundingClientRect())
      // Measure the inter-tab gap from the DOM rather than trusting a constant.
      const gap = rects.length > 1 ? Math.max(0, rects[1].left - rects[0].right) : 4
      gestureRef.current = {
        id: tabs[index].id,
        from: index,
        pointerId: e.pointerId,
        startX: e.clientX,
        centers: rects.map((r) => r.left + r.width / 2),
        slots: rects.map((r) => r.width + gap),
        moved: false,
        target: index
      }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [tabs]
  )

  const finishDrag = useCallback(
    (commit: boolean, pointerId: number) => {
      const g = gestureRef.current
      // Only the pointer that started the gesture may end it: on a touchscreen
      // a second finger's release would otherwise commit — or cancel — a drag
      // it never took part in.
      if (!g || pointerId !== g.pointerId) return
      gestureRef.current = null
      if (!g.moved) return // a plain click — leave selection to onClick
      const { id, from } = g
      const target = commit ? g.target : from
      // The offset that lands the grabbed tab dead-centre in its target slot:
      // the summed footprints of every tab it leaps over (right = +, left = −).
      let restDx = 0
      if (target > from) for (let j = from + 1; j <= target; j++) restDx += g.slots[j]
      else for (let j = target; j < from; j++) restDx -= g.slots[j]
      // Glide to rest, then swap the array underneath at the same instant the
      // transform clears — the tab is already sitting in the gap, so no snap.
      setDrag((d) => (d ? { ...d, dx: restDx, target, settling: true } : d))
      window.setTimeout(() => {
        if (commit) onReorderTab(id, target)
        setDrag(null)
      }, SETTLE_MS)
    },
    [onReorderTab]
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const g = gestureRef.current
      if (!g || e.pointerId !== g.pointerId) return
      // The OS can steal a press that lands in a window-drag region and then
      // hand us a synthetic move whose clientX is nowhere near the cursor —
      // enough, unguarded, to fling the tab sideways and commit a reorder the
      // user never asked for. A press we still own has the button down and the
      // capture in hand; anything else is not a drag, so disarm instead.
      if (!(e.buttons & 1) || !e.currentTarget.hasPointerCapture(e.pointerId)) {
        finishDrag(false, e.pointerId)
        return
      }
      const dx = e.clientX - g.startX
      if (!g.moved && Math.abs(dx) < DRAG_THRESHOLD) return
      g.moved = true
      draggedRef.current = true

      // Where the grabbed tab's centre now sits, and the slot that centre has
      // slid into — walk outward from the origin only as far as it has crossed.
      const c = g.centers[g.from] + dx
      let target = g.from
      if (dx > 0) {
        for (let j = g.from + 1; j < g.centers.length; j++) {
          if (c <= g.centers[j]) break
          target = j
        }
      } else {
        for (let j = g.from - 1; j >= 0; j--) {
          if (c >= g.centers[j]) break
          target = j
        }
      }
      g.target = target
      setDrag({ id: g.id, from: g.from, dx, target, slot: g.slots[g.from], settling: false })
    },
    [finishDrag]
  )

  return (
    <div className={`tabbar ${reserveTrafficLights ? 'mac-inset' : ''}`}>
      <div className="tabbar-drag drag" />

      <button className="sidebar-toggle" title="Show/hide the sidebar" onClick={onToggleSidebar}>
        <SidebarIcon size={16} />
      </button>

      <button className="new-chat" onClick={onNewChat} title="New chat (⌘T)">
        <PlusIcon size={15} />
        New chat
      </button>

      <div className={`tab-rail ${overflow.left ? 'ovl-l' : ''} ${overflow.right ? 'ovl-r' : ''}`}>
        <button className="rail-nudge left" title="Previous tabs" onClick={() => nudge(-1)}>
          <DoubleChevronIcon size={15} />
        </button>

        <div
          className={`tab-strip ${drag ? 'reordering' : ''}`}
          ref={stripRef}
          onScroll={measure}
          onWheel={onWheel}
        >
          {tabs.map((tab, index) => {
            const isActive = tab.id === activeTabId
            const accent = projectColor(tab.cwd)
            // The grabbed tab tracks the cursor; the tabs between its origin and
            // its target glide aside by one grabbed-tab footprint to bare the
            // landing slot. Everything else holds still.
            let offset = 0
            const isSource = drag?.id === tab.id
            if (drag && !isSource) {
              if (drag.target > drag.from && index > drag.from && index <= drag.target)
                offset = -drag.slot
              else if (drag.target < drag.from && index < drag.from && index >= drag.target)
                offset = drag.slot
            }
            const tabStyle: CSSProperties = {
              ...(accent ? ({ ['--session' as string]: accent } as CSSProperties) : {}),
              ...(drag ? { transform: `translateX(${isSource ? drag.dx : offset}px)` } : {})
            }
            return (
              <div
                key={tab.id}
                data-tab-id={tab.id}
                className={`tab ${isActive ? 'active' : ''} ${tab.processing ? 'processing' : ''} ${tab.preview ? 'preview' : ''} ${isSource ? (drag.settling ? 'grabbed settling' : 'grabbed') : ''}`}
                style={tabStyle}
                onPointerDown={(e) => onPointerDown(e, index)}
                onPointerMove={onPointerMove}
                onPointerUp={(e) => finishDrag(true, e.pointerId)}
                onPointerCancel={(e) => finishDrag(false, e.pointerId)}
                // The capture goes away when something else claims the pointer
                // (a native window drag, the pointer leaving the window) — and
                // with it any pointerup. Disarm here or the gesture stays live.
                onLostPointerCapture={(e) => finishDrag(false, e.pointerId)}
                onClick={() => {
                  if (draggedRef.current) {
                    draggedRef.current = false
                    return
                  }
                  onSelectTab(tab.id)
                }}
                onMouseDown={(e) => {
                  // Middle-click closes the tab; preventDefault stops the
                  // browser's middle-click auto-scroll puck from popping up.
                  if (e.button === 1) {
                    e.preventDefault()
                    onCloseTab(tab.id)
                  }
                }}
              >
                {tab.kind === 'terminal' ? (
                  <span className="dot" />
                ) : (
                  <span className="tab-glyph">{tabGlyph(tab.kind)}</span>
                )}
                <span className="title">{tab.title}</span>
                <button
                  className="tab-close"
                  title="Close tab (⌘W · middle click)"
                  onClick={(e) => {
                    e.stopPropagation()
                    onCloseTab(tab.id)
                  }}
                >
                  <CloseIcon size={12} />
                </button>
              </div>
            )
          })}
        </div>

        <button className="rail-nudge right" title="Next tabs" onClick={() => nudge(1)}>
          <DoubleChevronIcon size={15} />
        </button>
      </div>

      <button
        className="sidebar-toggle"
        title="Show/hide the project panel"
        onClick={onTogglePanel}
      >
        <PanelRightIcon size={16} />
      </button>
    </div>
  )
}
