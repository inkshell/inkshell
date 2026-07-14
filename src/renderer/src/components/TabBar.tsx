import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Tab } from '../types'
import { CloseIcon, DoubleChevronIcon, PlusIcon, SidebarIcon } from './Icons'

interface Props {
  tabs: Tab[]
  activeTabId: string | null
  onNewChat: () => void
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  onToggleSidebar: () => void
}

export function TabBar({
  tabs,
  activeTabId,
  onNewChat,
  onSelectTab,
  onCloseTab,
  onToggleSidebar
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

  return (
    <div className="tabbar drag">
      <button
        className="sidebar-toggle no-drag"
        title="Mostrar/ocultar a barra lateral"
        onClick={onToggleSidebar}
      >
        <SidebarIcon size={16} />
      </button>

      <button className="new-chat no-drag" onClick={onNewChat} title="Novo chat (⌘T)">
        <PlusIcon size={15} />
        Novo chat
      </button>

      <div
        className={`tab-rail no-drag ${overflow.left ? 'ovl-l' : ''} ${overflow.right ? 'ovl-r' : ''}`}
      >
        <button className="rail-nudge left" title="Abas anteriores" onClick={() => nudge(-1)}>
          <DoubleChevronIcon size={15} />
        </button>

        <div className="tab-strip" ref={stripRef} onScroll={measure} onWheel={onWheel}>
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId
            return (
              <div
                key={tab.id}
                data-tab-id={tab.id}
                className={`tab ${isActive ? 'active' : ''}`}
                onClick={() => onSelectTab(tab.id)}
                onMouseDown={(e) => {
                  // Middle-click closes the tab; preventDefault stops the
                  // browser's middle-click auto-scroll puck from popping up.
                  if (e.button === 1) {
                    e.preventDefault()
                    onCloseTab(tab.id)
                  }
                }}
              >
                {isActive && <span className="dot" />}
                <span className="title">{tab.title}</span>
                <button
                  className="tab-close"
                  title="Fechar aba (⌘W · botão do meio)"
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

        <button className="rail-nudge right" title="Próximas abas" onClick={() => nudge(1)}>
          <DoubleChevronIcon size={15} />
        </button>
      </div>
    </div>
  )
}
