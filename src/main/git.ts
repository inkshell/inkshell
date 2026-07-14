import { execFile } from 'node:child_process'
import { isAbsolute, relative, resolve } from 'node:path'
import type { GitCommit, GitCommitDetail, GitFileChange, GitStatus } from '@shared/types'
import { overrideConfigDir } from './claude-history'

/**
 * Drives the locally-installed `git` binary for the project panel. Like the rest
 * of VibeBox this never reimplements git — every read (status, diff, log, show)
 * and every write (stage, commit, push) shells out to the real command in the
 * project's own working tree, so results always match what a plain terminal sees.
 *
 * The one AI touch, `suggestCommitMessage`, stays in the same spirit: it runs
 * the real `claude` CLI in headless print mode (`claude -p`) over the staged
 * diff, rather than talking to any API itself.
 */

/** Record- and unit-separator bytes used to frame `git log`/`show` output. */
const US = '\x1f'
const RS = '\x1e'

/** 16 MiB — a diff or log that overruns this is far past anything worth showing. */
const MAX_BUFFER = 16 * 1024 * 1024

interface RunResult {
  stdout: string
  stderr: string
  code: number
}

interface RunOptions {
  /** Resolve (instead of reject) when git exits non-zero — e.g. `diff --no-index`. */
  allowNonZero?: boolean
  /** Kill and reject after this many ms (used for `push`, which may block). */
  timeoutMs?: number
}

/** Runs `git` in `cwd`, rejecting on a non-zero exit unless `allowNonZero`. */
function git(cwd: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      'git',
      args,
      { cwd, maxBuffer: MAX_BUFFER, timeout: opts.timeoutMs, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          const e = err as NodeJS.ErrnoException
          if (e.code === 'ENOENT') {
            reject(new Error('git não encontrado no PATH'))
            return
          }
          if (!opts.allowNonZero) {
            reject(new Error(stderr.trim() || err.message))
            return
          }
          const code = typeof e.code === 'number' ? e.code : 1
          resolvePromise({ stdout, stderr, code })
          return
        }
        resolvePromise({ stdout, stderr, code: 0 })
      }
    )
  })
}

/**
 * The repository root containing `projectPath`. Every path-bearing git command
 * runs with this as its cwd so the repo-root-relative paths that porcelain
 * emits line up, even when the project directory is a subfolder of the repo.
 */
async function repoRoot(projectPath: string): Promise<string> {
  const { stdout } = await git(projectPath, ['rev-parse', '--show-toplevel'])
  return stdout.trim()
}

/**
 * Rejects any path that would escape `root` (absolute, or climbing out with
 * `..`). Porcelain paths are already safe, but the renderer echoes them back
 * over IPC, so they are re-checked before reaching a filesystem-touching arg.
 */
function assertWithin(root: string, relPath: string): void {
  if (isAbsolute(relPath)) throw new Error('Caminho inválido')
  const rel = relative(root, resolve(root, relPath))
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Caminho fora do projeto')
}

/** Reads the first `n` space-separated fields, returning them plus the remainder. */
function splitFields(line: string, n: number): { fields: string[]; rest: string } {
  const fields: string[] = []
  let idx = 0
  for (let k = 0; k < n; k++) {
    const next = line.indexOf(' ', idx)
    fields.push(line.slice(idx, next))
    idx = next + 1
  }
  return { fields, rest: line.slice(idx) }
}

/** Parses `git status --porcelain=v2 --branch -z` into a {@link GitStatus}. */
function parseStatus(z: string): GitStatus {
  const parts = z.split('\0')
  let branch: string | null = null
  let upstream: string | null = null
  let ahead = 0
  let behind = 0
  const staged: GitFileChange[] = []
  const unstaged: GitFileChange[] = []

  for (let i = 0; i < parts.length; i++) {
    const line = parts[i]
    if (!line) continue

    if (line.startsWith('# ')) {
      if (line.startsWith('# branch.head ')) {
        const head = line.slice('# branch.head '.length)
        branch = head === '(detached)' ? null : head
      } else if (line.startsWith('# branch.upstream ')) {
        upstream = line.slice('# branch.upstream '.length)
      } else if (line.startsWith('# branch.ab ')) {
        const m = line.slice('# branch.ab '.length).match(/\+(\d+) -(\d+)/)
        if (m) {
          ahead = Number(m[1])
          behind = Number(m[2])
        }
      }
      continue
    }

    const type = line[0]
    if (type === '1' || type === '2') {
      // Ordinary (1) has 8 metadata fields before the path; rename/copy (2) has
      // 9 (an extra rename score) and carries its origin path in the NEXT token.
      const { fields, rest } = splitFields(line, type === '1' ? 8 : 9)
      const xy = fields[1]
      const path = rest
      let origPath: string | undefined
      if (type === '2') origPath = parts[++i]
      if (xy[0] !== '.') staged.push({ path, status: xy[0], ...(origPath && { origPath }) })
      if (xy[1] !== '.') unstaged.push({ path, status: xy[1] })
    } else if (type === '?') {
      unstaged.push({ path: line.slice(2), status: '?' })
    } else if (type === 'u') {
      // Unmerged: 10 metadata fields before the path. Surface it as a conflict.
      const { rest } = splitFields(line, 10)
      unstaged.push({ path: rest, status: 'U' })
    }
    // '!' (ignored) is never requested, so never appears; nothing else can.
  }

  return { isRepo: true, branch, upstream, ahead, behind, staged, unstaged }
}

/** The working tree's git state, or `{ isRepo: false }` outside a repo. */
export async function gitStatus(projectPath: string): Promise<GitStatus> {
  const inside = await git(projectPath, ['rev-parse', '--is-inside-work-tree'], {
    allowNonZero: true
  })
  if (inside.code !== 0 || inside.stdout.trim() !== 'true') {
    return {
      isRepo: false,
      branch: null,
      upstream: null,
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: []
    }
  }
  const { stdout } = await git(projectPath, ['status', '--porcelain=v2', '--branch', '-z'])
  return parseStatus(stdout)
}

/**
 * The unified diff for one path — staged (index vs HEAD) or unstaged (worktree
 * vs index). An untracked file has no tracked diff, so it falls back to
 * `--no-index` against /dev/null, which renders every line as an addition.
 */
export async function gitDiff(
  projectPath: string,
  filePath: string,
  staged: boolean
): Promise<string> {
  const root = await repoRoot(projectPath)
  assertWithin(root, filePath)
  const args = ['diff', '--no-color']
  if (staged) args.push('--staged')
  args.push('--', filePath)
  const { stdout } = await git(root, args)
  if (stdout.trim() || staged) return stdout
  const alt = await git(root, ['diff', '--no-color', '--no-index', '--', '/dev/null', filePath], {
    allowNonZero: true
  })
  return alt.stdout
}

/** Stages one path (`git add`). */
export async function gitStage(projectPath: string, filePath: string): Promise<void> {
  const root = await repoRoot(projectPath)
  assertWithin(root, filePath)
  await git(root, ['add', '--', filePath])
}

/** Unstages one path, keeping the working-tree change (`git restore --staged`). */
export async function gitUnstage(projectPath: string, filePath: string): Promise<void> {
  const root = await repoRoot(projectPath)
  assertWithin(root, filePath)
  await git(root, ['restore', '--staged', '--', filePath])
}

/** Commits the staged changes; git's own error surfaces if nothing is staged. */
export async function gitCommit(projectPath: string, message: string): Promise<void> {
  if (!message.trim()) throw new Error('Mensagem de commit vazia')
  const root = await repoRoot(projectPath)
  await git(root, ['commit', '-m', message])
}

/** Pushes the current branch. May prompt for credentials, so it is time-boxed. */
export async function gitPush(projectPath: string): Promise<void> {
  const root = await repoRoot(projectPath)
  await git(root, ['push'], { timeoutMs: 120_000 })
}

/** The branch history, newest first, each commit flagged if not yet pushed. */
export async function gitLog(projectPath: string, limit = 60): Promise<GitCommit[]> {
  const root = await repoRoot(projectPath)
  const fmt = ['%H', '%h', '%s', '%an', '%at'].join(US)
  const { stdout } = await git(root, ['log', `--pretty=format:${fmt}${RS}`, '-n', String(limit)])

  // Which of these commits the upstream doesn't have yet. With no upstream the
  // rev-list fails and the set stays empty (no commit reads as "local").
  let unpushed = new Set<string>()
  const up = await git(root, ['rev-list', '@{upstream}..HEAD'], { allowNonZero: true })
  if (up.code === 0) {
    unpushed = new Set(
      up.stdout
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
    )
  }

  return stdout
    .split(RS)
    .map((rec) => rec.replace(/^\n/, ''))
    .filter(Boolean)
    .map((rec) => {
      const [hash, shortHash, subject, author, at] = rec.split(US)
      return {
        hash,
        shortHash,
        subject,
        author,
        dateMs: Number(at) * 1000,
        unpushed: unpushed.has(hash)
      }
    })
}

/** Parses `--name-status -z` tokens (rename/copy carry two path tokens). */
function parseNameStatusZ(z: string): GitFileChange[] {
  const tokens = z
    .split('\0')
    .map((t) => t.replace(/^\n+/, ''))
    .filter(Boolean)
  const out: GitFileChange[] = []
  for (let i = 0; i < tokens.length;) {
    const code = tokens[i++][0]
    if (code === 'R' || code === 'C') {
      const origPath = tokens[i++]
      const path = tokens[i++]
      out.push({ path, status: code, origPath })
    } else {
      out.push({ path: tokens[i++], status: code })
    }
  }
  return out
}

/** Counts added/removed content lines in a unified diff (hunk +++/--- excluded). */
function countDiff(diff: string): { insertions: number; deletions: number } {
  let insertions = 0
  let deletions = 0
  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) insertions++
    else if (line.startsWith('-') && !line.startsWith('---')) deletions++
  }
  return { insertions, deletions }
}

/** A single commit's metadata, changed-file list, and full patch. */
export async function gitShow(projectPath: string, hash: string): Promise<GitCommitDetail> {
  if (!/^[0-9a-fA-F]{4,40}$/.test(hash)) throw new Error('Hash de commit inválido')
  const root = await repoRoot(projectPath)
  const fmt = ['%H', '%h', '%s', '%an', '%at'].join(US)
  const meta = await git(root, ['show', '-s', `--format=${fmt}`, hash])
  const [h, shortHash, subject, author, at] = meta.stdout.trim().split(US)
  const names = await git(root, ['show', '--no-color', '--format=', '--name-status', '-z', hash])
  const files = parseNameStatusZ(names.stdout)
  const patch = await git(root, ['show', '--no-color', '--format=', hash])
  const { insertions, deletions } = countDiff(patch.stdout)
  return {
    hash: h,
    shortHash,
    subject,
    author,
    dateMs: Number(at) * 1000,
    insertions,
    deletions,
    files,
    diff: patch.stdout
  }
}

/** The child env for `claude`, applying the project's config-dir override. */
function claudeEnv(claudeConfigDir?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.CLAUDE_CONFIG_DIR
  const dir = overrideConfigDir(claudeConfigDir)
  if (dir) env.CLAUDE_CONFIG_DIR = dir
  return env
}

/**
 * Suggests a Conventional-Commits message for the staged changes by running the
 * real `claude` CLI headless (`claude -p`) over `git diff --staged`. The diff is
 * capped so a huge staging area can't blow up the prompt; the returned text is
 * stripped of any stray code fences the model might wrap it in.
 */
export async function suggestCommitMessage(
  projectPath: string,
  claudeConfigDir?: string
): Promise<string> {
  const root = await repoRoot(projectPath)
  const { stdout: diff } = await git(root, ['diff', '--staged', '--no-color'])
  if (!diff.trim()) throw new Error('Nada preparado — prepare arquivos antes de gerar a mensagem.')

  const MAX = 12_000
  const clipped = diff.length > MAX ? `${diff.slice(0, MAX)}\n\n[diff truncado]` : diff
  const prompt =
    'Você gera mensagens de commit. Com base no diff preparado (git diff --staged) ' +
    'abaixo, escreva UMA mensagem de commit no padrão Conventional Commits ' +
    '(ex.: "feat: ...", "fix: ...", "refactor: ..."), em português, no imperativo. ' +
    'Responda APENAS com a mensagem — sem crases, sem aspas, sem explicação.\n\n' +
    clipped

  const bin = process.platform === 'win32' ? 'claude.cmd' : 'claude'
  const stdout = await new Promise<string>((resolvePromise, reject) => {
    execFile(
      bin,
      ['-p', prompt],
      {
        cwd: root,
        env: claudeEnv(claudeConfigDir),
        timeout: 120_000,
        maxBuffer: MAX_BUFFER,
        windowsHide: true
      },
      (err, out, stderr) => {
        if (err) {
          const e = err as NodeJS.ErrnoException
          reject(
            new Error(
              e.code === 'ENOENT' ? 'claude não encontrado no PATH' : stderr.trim() || err.message
            )
          )
          return
        }
        resolvePromise(out)
      }
    )
  })

  return stdout
    .trim()
    .replace(/^```[^\n]*\n?/, '')
    .replace(/\n?```$/, '')
    .trim()
}
