/** Short relative time in Portuguese: `agora`, `há 5min`, `há 3h`, `há 2d`. */
export function relativeTime(epochMs: number): string {
  const secs = Math.max(0, Math.floor((Date.now() - epochMs) / 1000))
  if (secs < 60) return 'agora'
  if (secs < 3600) return `há ${Math.floor(secs / 60)}min`
  if (secs < 86_400) return `há ${Math.floor(secs / 3600)}h`
  return `há ${Math.floor(secs / 86_400)}d`
}

/** Compact token count for the meter: `40142 → "40k"`, `950 → "950"`. */
export function fmtK(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)
}

/** Last path segment, for a folder's display name. */
export function baseName(path: string): string {
  const parts = path.replace(/[/\\]+$/, '').split(/[/\\]/)
  return parts[parts.length - 1] || path
}
