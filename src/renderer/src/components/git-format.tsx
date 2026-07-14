/**
 * Shared bits of git presentation used by both the project panel and the
 * commit viewer, so the status letters read the same in both places.
 */

/** Maps git's status letter to the badge modifier class that colours it. */
function statusClass(status: string): string {
  switch (status) {
    case 'A':
    case '?':
      return 'a' // added / untracked → green
    case 'D':
      return 'd' // deleted → red
    case 'U':
      return 'u' // unmerged/conflict → red
    default:
      return 'm' // modified / renamed / copied → amber
  }
}

/** The letter git shows for this change, normalising untracked `?` to `A`. */
function statusLetter(status: string): string {
  return status === '?' ? 'A' : status
}

/** A small square badge carrying a change's one-letter git status. */
export function StatusBadge({ status }: { status: string }) {
  return <span className={`st ${statusClass(status)}`}>{statusLetter(status)}</span>
}
