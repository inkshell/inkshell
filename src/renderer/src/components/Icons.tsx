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

export const MinimizeIcon = ({ size = 14 }: IconProps) => svg(size, <path d="M5 12h14" />)

export const MaximizeIcon = ({ size = 12 }: IconProps) =>
  svg(size, <rect x="5" y="5" width="14" height="14" rx="2" />)
