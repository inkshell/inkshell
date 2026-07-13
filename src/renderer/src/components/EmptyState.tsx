export function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-logo">◈</div>
      <div className="empty-title">Pronto para vibrar</div>
      <div className="empty-sub">
        Cada aba é uma sessão do Claude Code rodando de verdade. Abra uma e comece.
      </div>
      <div className="empty-keys">
        <span className="kbd">⌘T</span> novo chat
        <span className="kbd">⌘W</span> fechar aba
      </div>
    </div>
  )
}
