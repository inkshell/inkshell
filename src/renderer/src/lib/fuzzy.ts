/** A subsequence match of a query against one string, for quick-open. */
export interface FuzzyResult {
  matched: boolean
  /** Lower is a better match. Meaningless when `matched` is false. */
  score: number
  /** Indices into `text` the query's characters landed on, in order. */
  indices: number[]
}

/**
 * Subsequence fuzzy match: every character of `query` must appear in `text`,
 * in order, not necessarily adjacent (so `"tbar"` matches `"TabBar.tsx"`).
 * Matches that are contiguous, or that start right after a path/word boundary
 * (`/ - _ .` or the very start of the string), score better than scattered
 * ones — the same heuristic editors use for "go to file".
 */
export function fuzzyMatch(query: string, text: string): FuzzyResult {
  if (!query) return { matched: true, score: 0, indices: [] }
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  const indices: number[] = []
  let searchFrom = 0
  let score = 0
  let lastIndex = -1
  for (const ch of q) {
    const found = t.indexOf(ch, searchFrom)
    if (found === -1) return { matched: false, score: 0, indices: [] }
    const boundary = found === 0 || /[/\-_. ]/.test(t[found - 1])
    score += found - searchFrom + (lastIndex === found - 1 ? 0 : 1) - (boundary ? 2 : 0)
    indices.push(found)
    lastIndex = found
    searchFrom = found + 1
  }
  return { matched: true, score, indices }
}
