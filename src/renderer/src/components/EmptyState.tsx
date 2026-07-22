export function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-logo">◈</div>
      <div className="empty-title">Ready to vibe</div>
      <div className="empty-sub">
        Every tab is a real Claude Code session running. Open one and get started.
      </div>
      <div className="empty-keys">
        <span className="kbd">⌘T</span> new chat
        <span className="kbd">⌘W</span> close tab
        <span className="kbd">⌘P</span> search files
      </div>
    </div>
  )
}
