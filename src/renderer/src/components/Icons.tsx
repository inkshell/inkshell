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
      <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065Z" />
      <circle cx="12" cy="12" r="3" />
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

export const GripIcon = ({ size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <circle cx="9" cy="6" r="1.6" />
    <circle cx="9" cy="12" r="1.6" />
    <circle cx="9" cy="18" r="1.6" />
    <circle cx="15" cy="6" r="1.6" />
    <circle cx="15" cy="12" r="1.6" />
    <circle cx="15" cy="18" r="1.6" />
  </svg>
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

export const TerminalIcon = ({ size = 14 }: IconProps) =>
  svg(
    size,
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9l3 3-3 3M13 15h4" />
    </>
  )

/** Claude's spark: rays around a core the sidebar fills (in a pane) or
 *  hollows out (open but off-screen) via the `.core` class. */
export const ClaudeIcon = ({ size = 14 }: IconProps) =>
  svg(
    size,
    <>
      <circle className="core" cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
      <path d="M12 2.6v4.9M12 16.5v4.9M2.6 12h4.9M16.5 12h4.9M5.4 5.4l3.4 3.4M15.2 15.2l3.4 3.4M5.4 18.6l3.4-3.4M15.2 8.8l3.4-3.4" />
    </>
  )

/** Opencode's mark: the blocky "O" of its wordmark — a square-cornered,
 *  portrait letterform whose counter the sidebar fills (in a pane) or
 *  hollows out (open but off-screen) via the `.core` class — same states
 *  as the Claude spark it sits beside. */
export const OpencodeIcon = ({ size = 14 }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinejoin="miter"
  >
    <rect x="5" y="3.75" width="14" height="16.5" />
    <rect
      className="core"
      x="7"
      y="5.7"
      width="10"
      height="12.6"
      fill="currentColor"
      stroke="none"
    />
  </svg>
)

export const CommitIcon = ({ size = 14 }: IconProps) =>
  svg(
    size,
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M3 12h6M15 12h6" />
    </>
  )

export const SaveIcon = ({ size = 14 }: IconProps) =>
  svg(
    size,
    <>
      <path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M8 3v5h7V3" />
      <path d="M8 21v-6h8v6" />
    </>
  )

export const EditIcon = ({ size = 14 }: IconProps) =>
  svg(
    size,
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </>
  )

export const MinimizeIcon = ({ size = 14 }: IconProps) => svg(size, <path d="M5 12h14" />)

export const MaximizeIcon = ({ size = 12 }: IconProps) =>
  svg(size, <rect x="5" y="5" width="14" height="14" rx="2" />)
