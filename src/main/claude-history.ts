import { closeSync, openSync, readdirSync, readSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { SessionContext, SessionSummary } from '@shared/types'

/**
 * Reads Claude Code's own transcript store under `~/.claude/projects/`. InkShell
 * never writes here — it only reflects the history the CLI records — so the
 * history list and context meter stay in lockstep with plain `claude` runs.
 * The single deliberate exception is `deleteSession`, which removes a
 * transcript at the user's explicit request.
 */

/** Bytes of the head of a transcript scanned for a preview + creation time. */
const HEAD_SCAN_BYTES = 256 * 1024
/**
 * Bytes of the tail scanned for a session's `ai-title`. The CLI rewrites that
 * line on most turns, so the newest one lands within ~30KB of the end even on a
 * multi-megabyte transcript; this window keeps a wide margin over that.
 */
const TITLE_TAIL_BYTES = 128 * 1024
/**
 * Bytes of the tail scanned for the live context reading. A single assistant
 * line (with its full `usage` block) is only a few KB, so this keeps several of
 * the most recent lines even when a large tool result sits between them.
 */
const CONTEXT_TAIL_BYTES = 512 * 1024

/** Claude Code's default config directory when `CLAUDE_CONFIG_DIR` is unset. */
function defaultClaudeDir(): string {
  return join(homedir(), '.claude')
}

/**
 * Expands a leading `~` to the home directory, matching how a shell expands an
 * unquoted `CLAUDE_CONFIG_DIR=~/…` assignment. Any other value is returned
 * as-is (the CLI reads the env var literally, so we must too).
 */
export function expandTilde(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2))
  return path
}

/**
 * The value to force `CLAUDE_CONFIG_DIR` to when spawning `claude`, or `null` to
 * leave the variable unset. `null` means "use Claude Code's real default": the
 * project set no override, or it points at `~/.claude`. Note `CLAUDE_CONFIG_DIR=~/.claude`
 * is NOT the default — the CLI would then read its config from `~/.claude/.claude.json`
 * instead of `~/.claude.json` (a different, often un-onboarded file) — so we
 * deliberately unset it there rather than pass it through.
 */
export function overrideConfigDir(claudeConfigDir?: string): string | null {
  if (!claudeConfigDir) return null
  const resolved = expandTilde(claudeConfigDir)
  return resolved === defaultClaudeDir() ? null : resolved
}

/**
 * The `projects/` directory Claude Code records transcripts under. Defaults to
 * `~/.claude/projects`; a project can override the base via `CLAUDE_CONFIG_DIR`.
 */
function claudeProjectsDir(claudeConfigDir?: string): string {
  const base = claudeConfigDir ? expandTilde(claudeConfigDir) : defaultClaudeDir()
  return join(base, 'projects')
}

/**
 * Reproduces the directory-name encoding Claude Code uses under
 * `~/.claude/projects/`: every non-alphanumeric character becomes `-`.
 */
function encodeProjectDir(path: string): string {
  return path.replace(/[^a-zA-Z0-9]/g, '-')
}

/** Reads at most `maxBytes` from the start of a file as UTF-8 text. */
function readHead(path: string, maxBytes: number): string {
  const fd = openSync(path, 'r')
  try {
    const size = statSync(path).size
    const len = Math.min(size, maxBytes)
    const buf = Buffer.alloc(len)
    readSync(fd, buf, 0, len, 0)
    return buf.toString('utf-8')
  } finally {
    closeSync(fd)
  }
}

/** Reads at most `maxBytes` from the end of a file as UTF-8 text. */
function readTail(path: string, maxBytes: number): string {
  const fd = openSync(path, 'r')
  try {
    const size = statSync(path).size
    const len = Math.min(size, maxBytes)
    const buf = Buffer.alloc(len)
    readSync(fd, buf, 0, len, size - len)
    return buf.toString('utf-8')
  } finally {
    closeSync(fd)
  }
}

type Json = Record<string, unknown>

function safeParse(line: string): Json | null {
  try {
    return JSON.parse(line) as Json
  } catch {
    return null
  }
}

/** The first real user message on a transcript line, one line, truncated. */
function extractPreview(value: Json): string | null {
  if (value.type !== 'user') return null
  if (value.isMeta === true) return null

  const message = value.message as Json | undefined
  const content = message?.content
  let text: string | null = null
  if (typeof content === 'string') {
    text = content
  } else if (Array.isArray(content)) {
    const item = content.find(
      (c): c is Json => typeof c === 'object' && c !== null && (c as Json).type === 'text'
    )
    const t = item?.text
    if (typeof t === 'string') text = t
  }
  if (text === null) return null

  const trimmed = text.trim()
  // Skip empty messages and tool-result/system-shaped payloads that open with a tag.
  if (!trimmed || trimmed.startsWith('<')) return null

  return trimmed.split(/\s+/).join(' ').slice(0, 140)
}

/**
 * The CLI's own one-line summary of a session, carried on an `ai-title` line.
 * This is the same text it writes as the terminal title, so a history card and
 * an open tab name the chat identically. The CLI titles a session once it has
 * something to summarize, so a very short one may carry no `ai-title` at all.
 */
function extractAiTitle(value: Json): string | null {
  if (value.type !== 'ai-title') return null
  const title = value.aiTitle
  if (typeof title !== 'string') return null
  return title.trim().split(/\s+/).join(' ').slice(0, 140) || null
}

/**
 * The newest title recorded for a transcript, or `null` for one the CLI never
 * titled. The CLI revises a title as a conversation drifts, so only the last
 * line counts — hence a backwards scan of the tail, as in `sessionContext`.
 */
function readAiTitle(path: string): string | null {
  let tail: string
  try {
    tail = readTail(path, TITLE_TAIL_BYTES)
  } catch {
    return null
  }
  const lines = tail.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    // Assistant lines dominate the tail and run to megabytes; keeping the
    // substring test ahead of the parser keeps this off the history list's path.
    if (!lines[i].includes('"ai-title"')) continue
    const value = safeParse(lines[i])
    if (!value) continue
    const title = extractAiTitle(value)
    if (title !== null) return title
  }
  return null
}

/** The creation time (epoch ms) carried by a transcript line's `timestamp`. */
function extractTimestampMs(value: Json): number | null {
  if (typeof value.timestamp !== 'string') return null
  const ms = Date.parse(value.timestamp)
  return Number.isNaN(ms) ? null : ms
}

function extractCwd(value: Json): string | null {
  return typeof value.cwd === 'string' ? value.cwd : null
}

/**
 * Token usage, model id, and recording time for an `assistant` transcript
 * line, or `null` if the line is not an assistant message carrying a `usage`
 * block. Token count mirrors the CLI's context indicator (output tokens are
 * excluded); the model id is the same field third-party tools (e.g. Redline)
 * read to know which model actually produced a turn, since it's never exposed
 * any other way; the timestamp lets a caller recognize a reading left over
 * from before the current run (e.g. a resume launched under a different
 * `--model` than its prior history). Sidechain lines (a subagent's own turns,
 * interleaved into the same file) are skipped — their `usage` belongs to that
 * subagent's context, not the main conversation's.
 */
function assistantContext(
  value: Json
): { tokens: number; model: string | null; timestampMs: number | null } | null {
  if (value.type !== 'assistant') return null
  if (value.isSidechain === true) return null
  const message = value.message as Json | undefined
  const usage = message?.usage as Json | undefined
  if (!usage) return null
  const field = (key: string): number => {
    const n = usage[key]
    return typeof n === 'number' ? n : 0
  }
  const tokens =
    field('input_tokens') + field('cache_creation_input_tokens') + field('cache_read_input_tokens')
  const model = typeof message?.model === 'string' ? message.model : null
  return { tokens, model, timestampMs: extractTimestampMs(value) }
}

/** Lists the Claude Code sessions recorded for `projectPath`, newest first. */
export function listSessions(projectPath: string, claudeConfigDir?: string): SessionSummary[] {
  const sessionDir = join(claudeProjectsDir(claudeConfigDir), encodeProjectDir(projectPath))
  let files: string[]
  try {
    files = readdirSync(sessionDir).filter((f) => f.endsWith('.jsonl'))
  } catch {
    return []
  }

  const sessions: SessionSummary[] = []
  for (const file of files) {
    const path = join(sessionDir, file)
    const sessionId = file.replace(/\.jsonl$/, '')
    let mtimeMs: number
    try {
      mtimeMs = statSync(path).mtimeMs
    } catch {
      continue
    }

    // One pass over the head picks up both the first user message (the fallback
    // preview) and the first timestamped event (the creation time), which need
    // not be the same line.
    let firstMessage: string | null = null
    let created: number | null = null
    for (const line of readHead(path, HEAD_SCAN_BYTES).split('\n')) {
      if (!line) continue
      const value = safeParse(line)
      if (!value) continue
      if (created === null) created = extractTimestampMs(value)
      if (firstMessage === null) firstMessage = extractPreview(value)
      if (firstMessage !== null && created !== null) break
    }

    sessions.push({
      sessionId,
      // The CLI's title describes what a chat became; the opening message only
      // shows where it started, so it stands in just for untitled sessions.
      preview: readAiTitle(path) ?? firstMessage ?? '(no messages)',
      createdMs: created ?? mtimeMs
    })
  }

  // Newest first, session id breaking ties for a deterministic order.
  sessions.sort((a, b) => b.createdMs - a.createdMs || b.sessionId.localeCompare(a.sessionId))
  return sessions
}

/** The transcript file backing a given session under the project's config dir. */
export function sessionTranscriptPath(
  projectPath: string,
  sessionId: string,
  claudeConfigDir?: string
): string {
  return join(
    claudeProjectsDir(claudeConfigDir),
    encodeProjectDir(projectPath),
    `${sessionId}.jsonl`
  )
}

/**
 * Deletes a recorded session's transcript — this module's one write, only ever
 * reached from an explicit "delete chat" action in the UI. The session id is
 * held to the CLI's UUID shape before being joined into a path, so a malformed
 * value coming over IPC can't reach outside the project's transcript dir
 * (`projectPath` needs no such check: `encodeProjectDir` reduces it to
 * alphanumerics and dashes). Deleting an already-gone file is a no-op.
 */
export function deleteSession(
  projectPath: string,
  sessionId: string,
  claudeConfigDir?: string
): void {
  if (!/^[0-9a-fA-F-]{8,64}$/.test(sessionId)) {
    throw new Error(`Invalid session id: ${sessionId}`)
  }
  rmSync(sessionTranscriptPath(projectPath, sessionId, claudeConfigDir), { force: true })
}

/**
 * The live state of a session: the token count of its most recent assistant
 * turn (the context window meter) and the model id that produced it (the only
 * ground truth for "which model is this session actually on" — Claude Code
 * exposes no other way to ask). Returns `null` for a transcript with no
 * assistant reply yet (a brand-new chat) or one that can't be read.
 */
export function sessionContext(
  projectPath: string,
  sessionId: string,
  claudeConfigDir?: string
): SessionContext | null {
  const path = sessionTranscriptPath(projectPath, sessionId, claudeConfigDir)
  let tail: string
  try {
    tail = readTail(path, CONTEXT_TAIL_BYTES)
  } catch {
    return null
  }
  // Scan backwards for the newest assistant line carrying a usage block. A first
  // line left truncated by slicing mid-file simply fails to parse and is skipped.
  const lines = tail.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const value = safeParse(lines[i])
    if (!value) continue
    const found = assistantContext(value)
    if (found) return found
  }
  return null
}

/**
 * Scans `~/.claude/projects/` for project directories that already have
 * session history, recovering each one's real filesystem path from the `cwd`
 * field recorded inside its transcripts (the directory name itself can't be
 * reliably decoded back to a path since `-` is ambiguous).
 */
export function discoverKnownProjects(): string[] {
  let dirs: string[]
  try {
    dirs = readdirSync(claudeProjectsDir(), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    return []
  }

  const found: string[] = []
  for (const dir of dirs) {
    const dirPath = join(claudeProjectsDir(), dir)
    let jsonl: string | undefined
    try {
      jsonl = readdirSync(dirPath).find((f) => f.endsWith('.jsonl'))
    } catch {
      continue
    }
    if (!jsonl) continue

    for (const line of readHead(join(dirPath, jsonl), HEAD_SCAN_BYTES).split('\n')) {
      if (!line) continue
      const value = safeParse(line)
      const cwd = value && extractCwd(value)
      if (cwd) {
        found.push(cwd)
        break
      }
    }
  }
  return found
}
