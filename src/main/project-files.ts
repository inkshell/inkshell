import { readdirSync, readFileSync, statSync, type Dirent } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { FileContent, TreeEntry } from '@shared/types'
import { listTrackedFiles } from './git'

/**
 * Read-only reflection of a project's own files, backing the panel's "Files"
 * mode and its file viewer. InkShell never writes here — editing is the `claude`
 * process's job in the terminal, not this app's. Every path coming over IPC is
 * re-checked to stay inside the project directory before it touches disk.
 */

/** Biggest file the viewer will load; larger (or binary) files show a notice. */
const FILE_CAP = 512 * 1024

/** Directory entries never worth listing in the tree. */
const IGNORED = new Set(['.git'])

/** The absolute path for `relPath`, or throws if it escapes `root`. */
function within(root: string, relPath: string): string {
  if (isAbsolute(relPath)) throw new Error('Invalid path')
  const abs = resolve(root, relPath)
  const rel = relative(root, abs)
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Path outside the project')
  return abs
}

/** Lists one directory (project-relative), directories first then A→Z. */
export function listDir(projectPath: string, relPath: string): TreeEntry[] {
  const abs = within(projectPath, relPath || '.')
  let entries: import('node:fs').Dirent[]
  try {
    entries = readdirSync(abs, { withFileTypes: true })
  } catch {
    return []
  }
  const out: TreeEntry[] = []
  for (const e of entries) {
    if (IGNORED.has(e.name)) continue
    out.push({
      name: e.name,
      path: relPath ? `${relPath}/${e.name}` : e.name,
      isDir: e.isDirectory()
    })
  }
  out.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
  return out
}

/** Directories a recursive crawl (quick-open, outside a git repo) never descends into. */
const WALK_IGNORED = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  'target',
  'coverage',
  '.cache'
])

/** Safety valve so a huge non-git tree can't hang quick-open's file crawl. */
const WALK_CAP = 20_000

function walk(root: string, relPath: string, out: string[]): void {
  if (out.length >= WALK_CAP) return
  let entries: Dirent[]
  try {
    entries = readdirSync(resolve(root, relPath), { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (out.length >= WALK_CAP) return
    if (WALK_IGNORED.has(e.name)) continue
    const rel = relPath ? `${relPath}/${e.name}` : e.name
    if (e.isDirectory()) walk(root, rel, out)
    else out.push(rel)
  }
}

/**
 * Every file in the project, for quick-open's fuzzy search. Prefers git's own
 * tracked + untracked-not-ignored view (respects `.gitignore` for free); a
 * project that isn't a git repo — or one where `git` itself fails (not on
 * PATH, a corrupt work tree) — falls back to a bounded recursive walk that
 * skips the usual noise directories. Either way the result is capped, so a
 * huge repo can't hand the renderer's fuzzy filter more than it can chew.
 */
export async function listAllFiles(projectPath: string): Promise<string[]> {
  try {
    const tracked = await listTrackedFiles(projectPath)
    if (tracked) return tracked.slice(0, WALK_CAP)
  } catch {
    // git failed outright (not just "not a repo") — fall through to the walk.
  }
  const out: string[] = []
  walk(projectPath, '', out)
  return out
}

/**
 * Answers "is this text an openable file of this project?" for the terminal's
 * path linkifier, which asks about every path-shaped token Claude prints. A
 * candidate may be absolute, `~`-prefixed or project-relative; anything that
 * isn't an existing regular file inside the project resolves to `null` (that
 * is the normal answer for prose that merely looks like a path, e.g. `e.g`).
 * Returns the project-relative path the viewer opens with.
 */
export function resolveProjectPath(projectPath: string, candidate: string): string | null {
  const trimmed = candidate.trim()
  if (!trimmed) return null

  const expanded =
    trimmed === '~' || trimmed.startsWith('~/') ? resolve(homedir(), trimmed.slice(2)) : trimmed

  let rel: string
  if (isAbsolute(expanded)) {
    rel = relative(projectPath, expanded)
    if (!rel || rel.startsWith('..')) return null
  } else {
    rel = expanded
  }

  let abs: string
  try {
    abs = within(projectPath, rel)
  } catch {
    return null
  }
  try {
    if (!statSync(abs).isFile()) return null
  } catch {
    return null
  }
  // The viewer keys tabs off this path, so keep it in the `/` form the rest of
  // the app (git, the file tree) already speaks.
  return relative(projectPath, abs).split(sep).join('/')
}

/** Reads one file for the read-only viewer, refusing binary / oversized ones. */
export function readProjectFile(projectPath: string, relPath: string): FileContent {
  const abs = within(projectPath, relPath)
  let size: number
  try {
    size = statSync(abs).size
  } catch {
    return { path: relPath, content: '', tooLarge: false }
  }
  if (size > FILE_CAP) return { path: relPath, content: '', tooLarge: true }
  const buf = readFileSync(abs)
  // A NUL byte in the first chunk is a good-enough binary sniff.
  if (buf.subarray(0, 8000).includes(0)) return { path: relPath, content: '', tooLarge: true }
  return { path: relPath, content: buf.toString('utf-8'), tooLarge: false }
}
