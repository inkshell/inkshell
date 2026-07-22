import { execFileSync } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

const isWindows = process.platform === 'win32'

/** The CLI's executable name — npm installs a `.cmd` shim on Windows. */
const CLAUDE_BIN = isWindows ? 'claude.cmd' : 'claude'

/**
 * How long the login shell gets to report its PATH. It only runs once per app
 * launch, but a shell rc that blocks (a prompt framework, a version manager
 * hitting the network) must not hold the first chat open.
 */
const SHELL_PATH_TIMEOUT_MS = 5000

/**
 * Directories a `claude` install commonly lands in. Tried after the login
 * shell's own PATH, as a last resort for a shell whose rc never exports it.
 */
function fallbackDirs(): string[] {
  const home = homedir()
  if (isWindows) {
    return [join(home, 'AppData', 'Roaming', 'npm')]
  }
  return [
    join(home, '.local', 'bin'),
    join(home, '.claude', 'local'),
    join(home, '.bun', 'bin'),
    join(home, '.npm-global', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin'
  ]
}

/**
 * The PATH a terminal would have. A GUI app inherits launchd's PATH — on macOS
 * typically just `/usr/bin:/bin:/usr/sbin:/sbin` — so anything installed under
 * `~/.local/bin` or Homebrew is invisible to an app opened from the Finder,
 * even though `claude` runs fine in a terminal. Asking the user's login shell
 * is the only way to learn what they actually have.
 */
let loginPath: string | null | undefined
function loginShellPath(): string | null {
  if (loginPath !== undefined) return loginPath
  loginPath = null
  if (isWindows) return loginPath
  const shell = process.env.SHELL || '/bin/zsh'
  try {
    // The delimiter isolates the PATH from anything an rc file prints on its
    // way up (banners, version-manager chatter), which would otherwise be
    // parsed as directories.
    const marker = '__INKSHELL_PATH__'
    const out = execFileSync(shell, ['-ilc', `printf '${marker}%s${marker}' "$PATH"`], {
      encoding: 'utf8',
      timeout: SHELL_PATH_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const value = out.split(marker)[1]
    if (value) loginPath = value.trim()
  } catch {
    // No shell, a shell that refuses `-ilc`, or one that timed out: fall back
    // to the well-known directories below.
  }
  return loginPath
}

/**
 * Every directory worth searching, most-trusted first: what the app was given,
 * then the login shell's, then the usual install locations. Deduplicated so the
 * value stays reasonable when it's handed to the child process as its PATH.
 */
function searchDirs(): string[] {
  const parts = [
    ...(process.env.PATH?.split(delimiter) ?? []),
    ...(loginShellPath()?.split(delimiter) ?? []),
    ...fallbackDirs()
  ]
  return [...new Set(parts.filter(Boolean))]
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * The PATH to give a `claude` child. The CLI shells out to `git`, `node` and
 * friends, so it needs a terminal-like PATH of its own — not the truncated one
 * a Finder-launched app starts with.
 */
export function claudeEnvPath(): string {
  return searchDirs().join(delimiter)
}

/**
 * Absolute path to the `claude` executable, or `null` when it genuinely isn't
 * installed. Resolved once and cached: the lookup can cost a shell spawn, and
 * every new tab would otherwise pay it.
 */
let cachedBinary: string | null | undefined
export function resolveClaudeBinary(): string | null {
  if (cachedBinary !== undefined) return cachedBinary
  // An explicit override wins, for a non-standard install or a wrapper script.
  const override = process.env.INKSHELL_CLAUDE_BIN
  if (override && isExecutable(override)) {
    cachedBinary = override
    return cachedBinary
  }
  cachedBinary =
    searchDirs()
      .map((dir) => join(dir, CLAUDE_BIN))
      .find(isExecutable) ?? null
  return cachedBinary
}
