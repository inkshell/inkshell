import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import * as pty from 'node-pty'
import { IpcChannel } from '@shared/ipc'
import type { PtyCreateOptions, PtyCreateResult } from '@shared/types'
import { overrideConfigDir } from './claude-history'

/**
 * How long a session gets to honor `/exit` before it is killed outright. Long
 * enough for the CLI to tear itself down, short enough that a session which
 * can't answer — mid-turn, or parked on a permission prompt — never holds the
 * window open for a noticeable beat.
 */
const GRACEFUL_EXIT_TIMEOUT_MS = 3000

/**
 * Owns every live `claude` child process, one per open tab. Each runs inside a
 * pseudo-terminal so the CLI behaves exactly as it does in a real terminal —
 * colors, prompts, `/`-commands and all — while its bytes stream to an xterm.js
 * view in the renderer.
 */
export class PtyManager {
  private nextId = 1
  private readonly sessions = new Map<number, pty.IPty>()
  /** In-flight `close` calls, so a second one joins the first instead of racing it. */
  private readonly closing = new Map<number, Promise<void>>()

  /** `sender` is the renderer that receives `pty:data` / `pty:exit` pushes. */
  constructor(private readonly sender: WebContents) {}

  /**
   * Spawns a Claude Code session. New chats get a UUID we choose (via
   * `--session-id`); resumes reuse the original id (the CLI does too, unless
   * `--fork-session`). Every session launches on the configured default model
   * and effort, and in auto permission mode; switching the model afterwards is
   * a one-shot `/model` typed via the toolbar (effort has no such picker — see
   * `AppConfig.defaultEffort`).
   */
  create(opts: PtyCreateOptions): PtyCreateResult {
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

    // VibeBox itself may be launched with CLAUDE_CONFIG_DIR set; never leak that
    // into the child — each session's config dir is decided per-project. An
    // override equal to the default `~/.claude` is treated as unset so the CLI
    // uses its real default config (`~/.claude.json`, not `~/.claude/.claude.json`).
    const env: NodeJS.ProcessEnv = { ...process.env, TERM: 'xterm-256color' }
    delete env.CLAUDE_CONFIG_DIR
    const configDir = overrideConfigDir(opts.claudeConfigDir)
    if (configDir) env.CLAUDE_CONFIG_DIR = configDir

    const shell = process.platform === 'win32' ? 'claude.cmd' : 'claude'
    const child = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: opts.cols,
      rows: opts.rows,
      cwd: opts.cwd || process.env.HOME || process.cwd(),
      env
    })

    const ptyId = this.nextId++
    this.sessions.set(ptyId, child)

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

    return { ptyId, sessionId }
  }

  write(ptyId: number, data: string): void {
    this.sessions.get(ptyId)?.write(data)
  }

  resize(ptyId: number, cols: number, rows: number): void {
    // Guard against the 0×0 xterm reports before its first layout pass.
    if (cols < 1 || rows < 1) return
    try {
      this.sessions.get(ptyId)?.resize(cols, rows)
    } catch {
      // A resize racing a just-exited process is harmless; ignore.
    }
  }

  /**
   * Ends a session the way a person would: types `/exit` at the prompt and lets
   * the CLI shut itself down, rather than yanking the process out from under it.
   * Falls back to `kill` if the session hasn't gone by the timeout. Resolves once
   * the child is actually gone, either way.
   */
  close(ptyId: number): Promise<void> {
    const child = this.sessions.get(ptyId)
    if (!child) return Promise.resolve()
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
        // which `/exit` lands as a suffix to it and the CLI submits the whole
        // thing as a prompt (`meu texto/exit`) instead of quitting.
        child.write('\x15/exit\r')
      } catch {
        finish(true)
      }
    })

    this.closing.set(ptyId, done)
    return done
  }

  kill(ptyId: number): void {
    const child = this.sessions.get(ptyId)
    if (!child) return
    this.sessions.delete(ptyId)
    try {
      child.kill()
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
