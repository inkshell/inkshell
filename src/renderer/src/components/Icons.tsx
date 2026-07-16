/**
 * Small, single-color SVG glyphs. They inherit `currentColor`, so hover/active
 * styling lives entirely in CSS — the same approach as the original app's
 * painter-drawn icons, just declarative.
 */
type IconProps = { size?: number }

const svg = (size: number, children: React.ReactNode) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
)

export const FolderIcon = ({ size = 16 }: IconProps) =>
  svg(size, <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />)

export const GearIcon = ({ size = 16 }: IconProps) =>
  svg(
    size,
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </>
  )

export const PlusIcon = ({ size = 16 }: IconProps) => svg(size, <path d="M12 5v14M5 12h14" />)

export const InfoIcon = ({ size = 14 }: IconProps) =>
  svg(
    size,
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  )

export const CloseIcon = ({ size = 14 }: IconProps) => svg(size, <path d="M6 6l12 12M18 6L6 18" />)

export const SidebarIcon = ({ size = 16 }: IconProps) =>
  svg(
    size,
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </>
  )

export const SwapIcon = ({ size = 16 }: IconProps) =>
  svg(size, <path d="M4 8h13l-3-3M20 16H7l3 3" />)

export const GaugeIcon = ({ size = 16 }: IconProps) =>
  svg(
    size,
    <>
      <path d="M5 17a7 7 0 0 1 14 0" />
      <path d="M12 17l4-6" />
      <circle cx="12" cy="17" r="1.1" fill="currentColor" stroke="none" />
    </>
  )

export const BarsIcon = ({ size = 16 }: IconProps) =>
  svg(
    size,
    <>
      <path d="M6 20V13" />
      <path d="M12 20V8" />
      <path d="M18 20V4" />
    </>
  )

export const BookmarkIcon = ({ size = 16 }: IconProps) =>
  svg(size, <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1Z" />)

export const ChevronIcon = ({ size = 12 }: IconProps) => svg(size, <path d="M9 6l6 6-6 6" />)

/** Two nested chevrons (guillemet `»`). The `chev-*` classes let CSS stream
 *  them one after the other — see the tab-rail overflow affordance. */
export const DoubleChevronIcon = ({ size = 14 }: IconProps) =>
  svg(
    size,
    <>
      <path className="chev-a" d="M5 6l6 6-6 6" />
      <path className="chev-b" d="M12 6l6 6-6 6" />
    </>
  )

export const TrashIcon = ({ size = 14 }: IconProps) =>
  svg(
    size,
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M10 11v6M14 11v6" />
    </>
  )

export const PanelRightIcon = ({ size = 16 }: IconProps) =>
  svg(
    size,
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16" />
    </>
  )

export const GitBranchIcon = ({ size = 16 }: IconProps) =>
  svg(
    size,
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="8" r="2.5" />
      <path d="M6 8.5v7M18 10.5c0 4-3 4.5-7 4.5" />
    </>
  )

export const ArrowUpIcon = ({ size = 14 }: IconProps) =>
  svg(size, <path d="M12 20V6M6 12l6-6 6 6" />)

export const ArrowDownIcon = ({ size = 14 }: IconProps) =>
  svg(size, <path d="M12 4v14M6 12l6 6 6-6" />)

export const RefreshIcon = ({ size = 14 }: IconProps) =>
  svg(
    size,
    <>
      <path d="M21 12a9 9 0 1 1-2.6-6.3" />
      <path d="M21 4v5h-5" />
    </>
  )

export const SparklesIcon = ({ size = 14 }: IconProps) =>
  svg(
    size,
    <>
      <path d="M12 3l1.6 4.9L18.5 9.5l-4.9 1.6L12 16l-1.6-4.9L5.5 9.5l4.9-1.6z" />
      <path d="M18.5 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
    </>
  )

export const SearchIcon = ({ size = 14 }: IconProps) =>
  svg(
    size,
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  )

export const FileTextIcon = ({ size = 14 }: IconProps) =>
  svg(
    size,
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
      <path d="M9 13h6M9 17h4" />
    </>
  )

export const DiffIcon = ({ size = 14 }: IconProps) =>
  svg(
    size,
    <>
      <path d="M6 4v6M3 7h6" />
      <path d="M3 18h6" />
      <path d="M16 4v16M13 12l3 3 3-3" />
    </>
  )

export const CommitIcon = ({ size = 14 }: IconProps) =>
  svg(
    size,
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M3 12h6M15 12h6" />
    </>
  )

export const MinimizeIcon = ({ size = 14 }: IconProps) => svg(size, <path d="M5 12h14" />)

export const MaximizeIcon = ({ size = 12 }: IconProps) =>
  svg(size, <rect x="5" y="5" width="14" height="14" rx="2" />)
