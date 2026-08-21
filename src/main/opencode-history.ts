import { execFile } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { DatabaseSync } from 'node:sqlite'
import type { SessionContext, SessionSummary } from '@shared/types'
import { resolveOpencodeBinary } from './cli-binary'

const execFileAsync = promisify(execFile)

/**
 * opencode's session store: a SQLite database under its data directory
 * (`~/.local/share/opencode/opencode.db`). Unlike Claude Code's JSONL
 * transcripts, everything the history list needs — titles, working
 * directories, model ids, token usage — is a column away, so this module is a
 * read-only reflection of that database rather than a byte-scanner.
 *
 * The database is opened read-only every call and closed again: opencode runs
 * it in WAL mode, so a reader never blocks the live TUI writing to it, and a
 * missing or temporarily unreadable database simply reads as "no history".
 */

/** opencode's data directory. It uses this location on every platform. */
function opencodeDataDir(): string {
  return join(homedir(), '.local', 'share', 'opencode')
}

function opencodeDbPath(): string {
  return join(opencodeDataDir(), 'opencode.db')
}

/**
 * The session ids opencode assigns (`ses_<base62>`). Validated before any
 * delete reaches a spawned CLI, for the same path-injection reasons as the
 * claude transcript guard.
 */
const SESSION_ID_RE = /^[A-Za-z0-9_-]{6,128}$/

/** Opens the database read-only, or null when it doesn't exist / can't be read. */
function openDb(): DatabaseSync | null {
  const dbPath = opencodeDbPath()
  if (!existsSync(dbPath)) return null
  try {
    return new DatabaseSync(dbPath, { readOnly: true })
  } catch {
    // Unreadable (a corrupt file, an unsupported format bump): no history is
    // better than a broken sidebar.
    return null
  }
}

/* =========================================================================
   Model catalog — opencode caches every known provider/model (with its
   context limit) at `~/.cache/opencode/models.json`, refreshed by the CLI
   itself. That cache is the only local source of a model's real context
   window, which the meter needs as its denominator: a hardcoded 200k reads
   badly wrong against the 1M-window models opencode routinely runs.
   ========================================================================= */

/** The slices of the catalog actually read — anything else is ignored. */
type ModelCatalog = Record<string, { models?: Record<string, { limit?: { context?: unknown } }> }>

function opencodeModelsCachePath(): string {
  return join(homedir(), '.cache', 'opencode', 'models.json')
}

/**
 * The parsed catalog, cached by the file's mtime so the 2s meter polls don't
 * re-read and re-parse it. Null when the file is missing or unparsable —
 * callers fall back to the config-derived denominator.
 */
let modelCatalogCache: { mtimeMs: number; catalog: ModelCatalog } | null = null
function loadModelCatalog(): ModelCatalog | null {
  const path = opencodeModelsCachePath()
  try {
    const mtimeMs = statSync(path).mtimeMs
    if (modelCatalogCache && modelCatalogCache.mtimeMs === mtimeMs) {
      return modelCatalogCache.catalog
    }
    const catalog = JSON.parse(readFileSync(path, 'utf8')) as ModelCatalog
    modelCatalogCache = { mtimeMs, catalog }
    return catalog
  } catch {
    return null
  }
}

/**
 * The context window (in tokens) the catalog records for an opencode model id
 * in `provider/model` form — split on the *first* slash only, since model ids
 * themselves often contain slashes (openrouter/`~anthropic/claude-…`).
 * Null when the model isn't in the catalog (a custom model, a cold cache).
 */
export function opencodeModelContextWindow(model: string | null): number | null {
  if (!model) return null
  const slash = model.indexOf('/')
  if (slash <= 0) return null
  const providerId = model.slice(0, slash)
  const modelId = model.slice(slash + 1)
  const context = loadModelCatalog()?.[providerId]?.models?.[modelId]?.limit?.context
  return typeof context === 'number' && context > 0 ? context : null
}

/**
 * Sessions opencode recorded for a project directory. `session.directory`
 * holds the real working directory the TUI ran in (no lossy name encoding to
 * undo), and `title` is the TUI's own session title.
 */
export function listOpencodeSessions(projectPath: string): SessionSummary[] {
  const db = openDb()
  if (!db) return []
  try {
    const rows = db
      .prepare(
        `SELECT id, title, time_created
           FROM session
          WHERE directory = ?
          ORDER BY time_updated DESC, id DESC`
      )
      .all(projectPath) as Array<{ id: string; title: string; time_created: number }>
    return rows.map((row) => ({
      sessionId: row.id,
      preview: row.title || '(no messages)',
      createdMs: row.time_created,
      cli: 'opencode' as const
    }))
  } catch {
    return []
  } finally {
    db.close()
  }
}

/**
 * Every project directory opencode has a session for — the counterpart of
 * Claude Code's `discoverKnownProjects`, used to seed the projects list on a
 * first launch.
 */
export function discoverOpencodeProjects(): string[] {
  const db = openDb()
  if (!db) return []
  try {
    const rows = db.prepare('SELECT DISTINCT directory FROM session').all() as Array<{
      directory: string
    }>
    return rows.map((row) => row.directory).filter(Boolean)
  } catch {
    return []
  } finally {
    db.close()
  }
}

type Json = Record<string, unknown>

/** Reads a message row's `tokens` JSON (`json_extract` hands it back as text). */
function parseTokens(
  raw: string | null
): { input: number; cacheRead: number; cacheWrite: number } | null {
  if (!raw) return null
  let value: Json
  try {
    value = JSON.parse(raw) as Json
  } catch {
    return null
  }
  const cache = (value.cache ?? {}) as Json
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  return { input: num(value.input), cacheRead: num(cache.read), cacheWrite: num(cache.write) }
}

/**
 * The live state of an opencode session, read off its newest assistant message
 * that recorded usage — the counterpart of the claude transcript scan. A
 * turn's `input + cache.read + cache.write` (output excluded) is the context
 * that turn ran against, the same arithmetic the claude meter uses. Rows
 * appear at turn start with zeroed tokens and fill in as the turn completes,
 * so zero-usage rows are skipped exactly like absent ones.
 *
 * `model` comes back as opencode's own `provider/model` id (e.g.
 * `"zai-coding-plan/glm-5.3"`), matched against the configured models'
 * `idPrefix` the same way claude's full ids are.
 */
export function opencodeSessionContext(sessionId: string): SessionContext | null {
  const db = openDb()
  if (!db) return null
  try {
    const rows = db
      .prepare(
        `SELECT json_extract(data, '$.tokens')     AS tokens,
                json_extract(data, '$.modelID')    AS modelId,
                json_extract(data, '$.providerID') AS providerId,
                time_updated
           FROM message
          WHERE session_id = ? AND json_extract(data, '$.role') = 'assistant'
          ORDER BY time_created DESC, id DESC
          LIMIT 20`
      )
      .all(sessionId) as Array<{
      tokens: string | null
      modelId: string | null
      providerId: string | null
      time_updated: number
    }>
    for (const row of rows) {
      const usage = parseTokens(row.tokens)
      if (!usage) continue
      const used = usage.input + usage.cacheRead + usage.cacheWrite
      if (used === 0) continue
      const model = row.providerId && row.modelId ? `${row.providerId}/${row.modelId}` : null
      return {
        tokens: used,
        model,
        timestampMs: row.time_updated,
        contextWindow: opencodeModelContextWindow(model) ?? undefined
      }
    }
    return null
  } catch {
    return null
  } finally {
    db.close()
  }
}

/**
 * Deletes a session through opencode's own CLI (`opencode session delete`).
 * The database is the TUI's live state — several tables reference a session —
 * so removal is delegated to the one writer that knows every table to clean,
 * rather than deleting rows out from under a running TUI.
 */
export async function deleteOpencodeSession(sessionId: string): Promise<void> {
  if (!SESSION_ID_RE.test(sessionId)) throw new Error('Invalid opencode session id')
  const bin = await resolveOpencodeBinary()
  if (!bin) throw new Error('opencode was not found on PATH')
  try {
    await execFileAsync(bin, ['session', 'delete', sessionId], {
      timeout: 15000,
      windowsHide: true
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(`opencode couldn't delete the session: ${detail}`)
  }
}
