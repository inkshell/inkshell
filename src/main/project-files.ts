import { readdirSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import type { FileContent, TreeEntry } from '@shared/types'

/**
 * Read-only reflection of a project's own files, backing the panel's "Arquivos"
 * mode and its file viewer. VibeBox never writes here — editing is the `claude`
 * process's job in the terminal, not this app's. Every path coming over IPC is
 * re-checked to stay inside the project directory before it touches disk.
 */

/** Biggest file the viewer will load; larger (or binary) files show a notice. */
const FILE_CAP = 512 * 1024

/** Directory entries never worth listing in the tree. */
const IGNORED = new Set(['.git'])

/** The absolute path for `relPath`, or throws if it escapes `root`. */
function within(root: string, relPath: string): string {
  if (isAbsolute(relPath)) throw new Error('Caminho inválido')
  const abs = resolve(root, relPath)
  const rel = relative(root, abs)
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Caminho fora do projeto')
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
