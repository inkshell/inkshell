import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import * as pty from 'node-pty'
import { IpcChannel } from '@shared/ipc'
import type { PtyCreateOptions, PtyCreateResult } from '@shared/types'
import { overrideConfigDir } from './claude-history'

/**
 * Owns every live `claude` child process, one per open tab. Each runs inside a
 * pseudo-terminal so the CLI behaves exactly as it does in a real terminal —
 * colors, prompts, `/`-commands and all — while its bytes stream to an xterm.js
 * view in the renderer.
 */
export class PtyManager {
  private nextId = 1
  private readonly sessions = new Map<number, pty.IPty>()

  /** `sender` is the renderer that receives `pty:data` / `pty:exit` pushes. */
  constructor(private readonly sender: WebContents) {}

  /**
   * Spawns a Claude Code session. New chats get a UUID we choose (via
   * `--session-id`); resumes reuse the original id (the CLI does too, unless
   * `--fork-session`). Every session launches on the configured default model;
   * switching afterwards is a one-shot `/model` typed via the toolbar.
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

  /** Tears down every session — called when the window closes. */
  disposeAll(): void {
    for (const id of [...this.sessions.keys()]) this.kill(id)
  }
}
