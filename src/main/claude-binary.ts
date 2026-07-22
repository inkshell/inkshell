import { execFile } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

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
 *
 * Asynchronous, and cached as the promise rather than the result: this runs a
 * shell whose rc files can take seconds, and the main process must keep
 * answering IPC while it does. Concurrent callers join the one in flight.
 *
 * `SHELL` is what the OS records as the user's login shell and is set for GUI
 * apps too; `/bin/zsh` is only a guess for the rare case where it's missing,
 * and a wrong guess just means falling back to the well-known directories.
 */
let loginPathPromise: Promise<string | null> | undefined
function loginShellPath(): Promise<string | null> {
  if (loginPathPromise) return loginPathPromise
  loginPathPromise = (async () => {
    if (isWindows) return null
    const shell = process.env.SHELL || '/bin/zsh'
    try {
      // The marker isolates the PATH from anything an rc file prints on its way
      // up (banners, version-manager chatter), which would otherwise be parsed
      // as directories.
      const marker = '__INKSHELL_PATH__'
      const { stdout } = await execFileAsync(
        shell,
        ['-ilc', `printf '${marker}%s${marker}' "$PATH"`],
        { encoding: 'utf8', timeout: SHELL_PATH_TIMEOUT_MS }
      )
      return stdout.split(marker)[1]?.trim() || null
    } catch {
      // No shell, a shell that refuses `-ilc`, or one that timed out: fall back
      // to the well-known directories below.
      return null
    }
  })()
  return loginPathPromise
}

/**
 * Every directory worth searching, most-trusted first: what the app was given,
 * then the login shell's, then the usual install locations. Deduplicated so the
 * value stays reasonable when it's handed to the child process as its PATH.
 */
async function searchDirs(): Promise<string[]> {
  const fromShell = await loginShellPath()
  const parts = [
    ...(process.env.PATH?.split(delimiter) ?? []),
    ...(fromShell?.split(delimiter) ?? []),
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
export async function claudeEnvPath(): Promise<string> {
  return (await searchDirs()).join(delimiter)
}

/**
 * Absolute path to the `claude` executable, or `null` when it genuinely isn't
 * installed. Resolved once and cached as a promise, so the shell spawn behind
 * it happens at most once however many tabs ask at the same time.
 *
 * Worth kicking off at startup (see `index.ts`): by the time a first chat is
 * opened the answer is usually already there.
 */
let binaryPromise: Promise<string | null> | undefined
export function resolveClaudeBinary(): Promise<string | null> {
  if (binaryPromise) return binaryPromise
  binaryPromise = (async () => {
    // An explicit override wins, for a non-standard install or a wrapper
    // script. Absolute only: a relative path would resolve against whatever
    // working directory the app happens to have, which nobody can predict.
    const override = process.env.INKSHELL_CLAUDE_BIN
    if (override && isAbsolute(override) && isExecutable(override)) return override
    return (await searchDirs()).map((dir) => join(dir, CLAUDE_BIN)).find(isExecutable) ?? null
  })()
  return binaryPromise
}
