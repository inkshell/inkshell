import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import * as pty from 'node-pty'
import { IpcChannel } from '@shared/ipc'
import type { PtyCreateOptions, PtyCreateResult } from '@shared/types'
import { claudeEnvPath, resolveClaudeBinary } from './claude-binary'
import { overrideConfigDir } from './claude-history'

/**
 * How long a session gets to honor `/exit` before it is killed outright. Long
 * enough for the CLI to tear itself down, short enough that a session which
 * can't answer — mid-turn, or parked on a permission prompt — never holds the
 * window open for a noticeable beat.
 */
const GRACEFUL_EXIT_TIMEOUT_MS = 3000

/** A live child process plus what kind of exit sequence it understands. */
interface Session {
  child: pty.IPty
  /** A plain shell has no `/exit` — see `close()`. */
  shell: boolean
}

/**
 * Owns every live child process, one per open tab: a `claude` session or a
 * plain shell. Each runs inside a pseudo-terminal so it behaves exactly as it
 * does in a real terminal — colors, prompts, `/`-commands and all — while its
 * bytes stream to an xterm.js view in the renderer.
 */
export class PtyManager {
  private nextId = 1
  private readonly sessions = new Map<number, Session>()
  /** In-flight `close` calls, so a second one joins the first instead of racing it. */
  private readonly closing = new Map<number, Promise<void>>()

  /** `sender` is the renderer that receives `pty:data` / `pty:exit` pushes. */
  constructor(private readonly sender: WebContents) {}

  /**
   * Spawns a Claude Code session, or (with `opts.shell`) a plain terminal in
   * the project directory. New chats get a UUID we choose (via
   * `--session-id`); resumes reuse the original id (the CLI does too, unless
   * `--fork-session`). Every session launches on the configured default model
   * and effort, and in auto permission mode; switching the model afterwards is
   * a one-shot `/model` typed via the toolbar (effort has no such picker — see
   * `AppConfig.defaultEffort`).
   */
  async create(opts: PtyCreateOptions): Promise<PtyCreateResult> {
    if (opts.shell) return this.createShell(opts)

    const args: string[] = []
    let sessionId: string
    if (opts.resumeSessionId) {
      sessionId = opts.resumeSessionId
      args.push('--resume', sessionId)
    } else {
      sessionId = randomUUID()
      args.push('--session-id', sessionId)
    }
    if (opts.model) args.push('--model', opts.model)
    if (opts.effort) args.push('--effort', opts.effort)
    // Every tab opens in auto mode, new chat and resume alike: a resumed session
    // does not carry the mode it last ran under, so it has to be passed here too.
    args.push('--permission-mode', 'auto')

    // InkShell itself may be launched with CLAUDE_CONFIG_DIR set; never leak that
    // into the child — each session's config dir is decided per-project. An
    // override equal to the default `~/.claude` is treated as unset so the CLI
    // uses its real default config (`~/.claude.json`, not `~/.claude/.claude.json`).
    const env: NodeJS.ProcessEnv = { ...process.env, TERM: 'xterm-256color' }
    delete env.CLAUDE_CONFIG_DIR
    const configDir = overrideConfigDir(opts.claudeConfigDir)
    if (configDir) env.CLAUDE_CONFIG_DIR = configDir
    // The CLI shells out to `git`, `node` and friends, so it gets a
    // terminal-like PATH rather than the truncated one a Finder-launched app
    // inherits from launchd.
    env.PATH = await claudeEnvPath()

    // Spawn by absolute path: relying on PATH resolution is what makes a chat
    // die instantly when the app is opened from the Finder instead of a shell.
    const command = await resolveClaudeBinary()
    if (!command) {
      throw new Error(
        'Claude Code was not found. Install the `claude` CLI and make sure it runs in your terminal, then reopen InkShell.'
      )
    }
    const child = pty.spawn(command, args, {
      name: 'xterm-256color',
      cols: opts.cols,
      rows: opts.rows,
      cwd: opts.cwd || process.env.HOME || process.cwd(),
      env
    })

    const ptyId = this.register(child, false)
    return { ptyId, sessionId }
  }

  /**
   * Spawns the user's own shell — `$SHELL` (or `%ComSpec%` on Windows) — as an
   * interactive login shell in the project directory, exactly like opening a
   * new window in a real terminal app: same rc files, same aliases, same PATH.
   * Unlike a `claude` session there is no transcript behind it, so it never
   * shows up in history or the context meter.
   */
  private async createShell(opts: PtyCreateOptions): Promise<PtyCreateResult> {
    const isWindows = process.platform === 'win32'
    const command = isWindows ? process.env.ComSpec || 'cmd.exe' : process.env.SHELL || '/bin/zsh'
    const args = isWindows ? [] : ['-il']

    const env: NodeJS.ProcessEnv = { ...process.env, TERM: 'xterm-256color' }
    delete env.CLAUDE_CONFIG_DIR
    // Same terminal-like PATH a `claude` child gets — a shell opened from this
    // GUI app should see what a real terminal would, not launchd's truncated one.
    env.PATH = await claudeEnvPath()

    const child = pty.spawn(command, args, {
      name: 'xterm-256color',
      cols: opts.cols,
      rows: opts.rows,
      cwd: opts.cwd || process.env.HOME || process.cwd(),
      env
    })

    const ptyId = this.register(child, true)
    return { ptyId, sessionId: '' }
  }

  /** Tracks a freshly spawned child and wires its data/exit pushes. */
  private register(child: pty.IPty, shell: boolean): number {
    const ptyId = this.nextId++
    this.sessions.set(ptyId, { child, shell })

    child.onData((data) => {
      if (!this.sender.isDestroyed()) {
        this.sender.send(IpcChannel.PtyData, { ptyId, data })
      }
    })
    child.onExit(({ exitCode }) => {
      this.sessions.delete(ptyId)
      if (!this.sender.isDestroyed()) {
        this.sender.send(IpcChannel.PtyExit, { ptyId, exitCode })
      }
    })

    return ptyId
  }

  write(ptyId: number, data: string): void {
    this.sessions.get(ptyId)?.child.write(data)
  }

  resize(ptyId: number, cols: number, rows: number): void {
    // Guard against the 0×0 xterm reports before its first layout pass.
    if (cols < 1 || rows < 1) return
    try {
      this.sessions.get(ptyId)?.child.resize(cols, rows)
    } catch {
      // A resize racing a just-exited process is harmless; ignore.
    }
  }

  /**
   * Ends a session the way a person would: types `/exit` (or, for a plain
   * shell, just `exit`) at the prompt and lets it shut itself down, rather
   * than yanking the process out from under it. Falls back to `kill` if the
   * session hasn't gone by the timeout. Resolves once the child is actually
   * gone, either way.
   */
  close(ptyId: number): Promise<void> {
    const session = this.sessions.get(ptyId)
    if (!session) return Promise.resolve()
    const { child } = session
    const pending = this.closing.get(ptyId)
    if (pending) return pending

    const done = new Promise<void>((resolve) => {
      let settled = false
      const finish = (hard: boolean): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        listener.dispose()
        this.closing.delete(ptyId)
        if (hard) this.kill(ptyId)
        resolve()
      }

      const listener = child.onExit(() => finish(false))
      const timer = setTimeout(() => finish(true), GRACEFUL_EXIT_TIMEOUT_MS)
      try {
        // Ctrl-U first: it clears whatever is half-typed at the prompt, without
        // which the exit command lands as a suffix to it and gets submitted as
        // part of it instead of running on its own. Skipped for the Windows
        // shell fallback (cmd.exe): Ctrl-U isn't one of its line-editing
        // shortcuts, so it would pass straight through into the exit command
        // instead of clearing anything, corrupting it and forcing the
        // hard-kill timeout below.
        const isWindowsShell = session.shell && process.platform === 'win32'
        const exitCommand = session.shell ? 'exit\r' : '/exit\r'
        child.write(isWindowsShell ? exitCommand : '\x15' + exitCommand)
      } catch {
        finish(true)
      }
    })

    this.closing.set(ptyId, done)
    return done
  }

  kill(ptyId: number): void {
    const session = this.sessions.get(ptyId)
    if (!session) return
    this.sessions.delete(ptyId)
    try {
      session.child.kill()
    } catch {
      // Already gone.
    }
  }

  /**
   * Asks every session to `/exit` at once and waits for them all. The window and
   * app close paths in `index.ts` hold themselves open until this resolves.
   */
  async disposeAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((id) => this.close(id)))
  }

  /** Last resort: hard-kills anything still alive once the window is already gone. */
  killAll(): void {
    for (const id of [...this.sessions.keys()]) this.kill(id)
  }
}
