import { useCallback, useEffect, useState } from 'react'
import type { GitCommit, GitFileChange, GitStatus, TreeEntry } from '@shared/types'
import { type ViewerRef, viewerKey } from '../types'
import { relativeTime } from '../lib/format'
import { StatusBadge } from './git-format'
import { TooltipHost, useTooltip } from './Tooltip'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronIcon,
  FileTextIcon,
  FolderIcon,
  GitBranchIcon,
  RefreshIcon,
  SearchIcon,
  SparklesIcon
} from './Icons'

interface Props {
  /** The active tab's project (repo) directory, or null when none is chosen. */
  project: string | null
  /** `CLAUDE_CONFIG_DIR` override for `project`, threaded into `claude -p`. */
  claudeConfigDir: string | null
  /** `--model` for the `claude -p` commit-message run; `''` leaves it to the CLI. */
  commitMessageModel: string
  /** Whether the panel is expanded — gates the polling so a collapsed panel is idle. */
  visible: boolean
  /** Opens (or focuses) a diff / file / commit viewer tab in the centre. */
  onOpenViewer: (ref: ViewerRef, opts?: { preview?: boolean }) => void
  onError: (message: string) => void
}

type Mode = 'git' | 'files'
type GitTab = 'changes' | 'history'

const fileName = (p: string): string => p.split('/').pop() ?? p
const fileDir = (p: string): string => p.split('/').slice(0, -1).join('/')

/**
 * The right dock: two lenses on the active project's directory. **Git** shows
 * the working tree (staged / unstaged, with stage + commit + push) and the
 * branch history; **Files** shows the file tree. Both are navigation only —
 * anything that needs width (a diff, a file, a commit) opens as a viewer tab in
 * the centre. Every git action drives the real binary through `window.inkshell.git`.
 */
export function ProjectPanel({
  project,
  claudeConfigDir,
  commitMessageModel,
  visible,
  onOpenViewer,
  onError
}: Props) {
  const [mode, setMode] = useState<Mode>('git')
  const [gitTab, setGitTab] = useState<GitTab>('changes')

  const [status, setStatus] = useState<GitStatus | null>(null)
  const [log, setLog] = useState<GitCommit[] | null>(null)
  const [message, setMessage] = useState('')
  const [generating, setGenerating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  // Files tree: the root listing plus a lazily-filled cache of each expanded
  // directory's children, and the set of directories currently open.
  const [root, setRoot] = useState<TreeEntry[] | null>(null)
  const [children, setChildren] = useState<Map<string, TreeEntry[]>>(new Map())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('')
  const { tip, bind } = useTooltip()

  const fail = useCallback(
    (err: unknown) => onError(err instanceof Error ? err.message : String(err)),
    [onError]
  )

  // --- Loaders -------------------------------------------------------------
  const refreshStatus = useCallback(async () => {
    if (!project) return setStatus(null)
    try {
      setStatus(await window.inkshell.git.status(project))
    } catch (err) {
      fail(err)
    }
  }, [project, fail])

  const refreshLog = useCallback(async () => {
    if (!project) return setLog(null)
    try {
      setLog(await window.inkshell.git.log(project))
    } catch (err) {
      fail(err)
    }
  }, [project, fail])

  const loadRoot = useCallback(async () => {
    if (!project) return setRoot(null)
    try {
      setRoot(await window.inkshell.fs.list(project, ''))
    } catch (err) {
      fail(err)
    }
  }, [project, fail])

  // Reset everything when the project changes.
  useEffect(() => {
    setStatus(null)
    setLog(null)
    setMessage('')
    setRoot(null)
    setChildren(new Map())
    setExpanded(new Set())
    setSelected(null)
  }, [project])

  // First status read + the light periodic poll while the git panel is open.
  useEffect(() => {
    if (!project || !visible || mode !== 'git') return
    refreshStatus()
    if (gitTab === 'history') refreshLog()
    const timer = setInterval(() => {
      refreshStatus()
      if (gitTab === 'history') refreshLog()
    }, 3000)
    return () => clearInterval(timer)
  }, [project, visible, mode, gitTab, refreshStatus, refreshLog])

  // Files mode needs the status too (to dot modified files) and the root tree.
  useEffect(() => {
    if (!project || !visible || mode !== 'files') return
    if (status === null) refreshStatus()
    if (root === null) loadRoot()
  }, [project, visible, mode, status, root, refreshStatus, loadRoot])

  // --- Git actions ---------------------------------------------------------
  const withBusy = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true)
      try {
        await fn()
        await refreshStatus()
        if (gitTab === 'history') await refreshLog()
      } catch (err) {
        fail(err)
      } finally {
        setBusy(false)
      }
    },
    [refreshStatus, refreshLog, gitTab, fail]
  )

  const stage = (p: string) => withBusy(() => window.inkshell.git.stage(project!, p))
  const unstage = (p: string) => withBusy(() => window.inkshell.git.unstage(project!, p))
  const commit = () =>
    withBusy(async () => {
      await window.inkshell.git.commit(project!, message)
      setMessage('')
    })
  const commitAndPush = () =>
    withBusy(async () => {
      await window.inkshell.git.commit(project!, message)
      setMessage('')
      await window.inkshell.git.push(project!)
    })
  const push = () => withBusy(() => window.inkshell.git.push(project!))

  const generate = useCallback(async () => {
    if (!project) return
    setGenerating(true)
    try {
      setMessage(
        await window.inkshell.git.suggestMessage(
          project,
          claudeConfigDir ?? undefined,
          commitMessageModel || undefined
        )
      )
    } catch (err) {
      fail(err)
    } finally {
      setGenerating(false)
    }
  }, [project, claudeConfigDir, commitMessageModel, fail])

  // --- Openers -------------------------------------------------------------
  const open = useCallback(
    (ref: ViewerRef, opts?: { preview?: boolean }) => {
      setSelected(viewerKey(ref))
      onOpenViewer(ref, opts)
    },
    [onOpenViewer]
  )

  const openDiff = (change: GitFileChange, staged: boolean, opts?: { preview?: boolean }) =>
    open(
      {
        kind: 'diff',
        project: project!,
        claudeConfigDir,
        path: change.path,
        staged,
        label: fileName(change.path),
        dir: fileDir(change.path)
      },
      opts
    )

  const openCommit = (c: GitCommit, opts?: { preview?: boolean }) =>
    open(
      { kind: 'commit', project: project!, claudeConfigDir, hash: c.hash, label: c.shortHash },
      opts
    )

  const openFile = (entry: TreeEntry, opts?: { preview?: boolean }) =>
    open(
      {
        kind: 'file',
        project: project!,
        claudeConfigDir,
        path: entry.path,
        label: entry.name,
        dir: fileDir(entry.path)
      },
      opts
    )

  // --- Files tree ----------------------------------------------------------
  const toggleDir = useCallback(
    async (path: string) => {
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(path)) next.delete(path)
        else next.add(path)
        return next
      })
      if (!children.has(path) && project) {
        try {
          const kids = await window.inkshell.fs.list(project, path)
          setChildren((prev) => new Map(prev).set(path, kids))
        } catch (err) {
          fail(err)
        }
      }
    },
    [children, project, fail]
  )

  if (!project) {
    return (
      <aside className="panel">
        <div className="panel-empty">Select a project to see its git and files.</div>
      </aside>
    )
  }

  const changeCount = (status?.staged.length ?? 0) + (status?.unstaged.length ?? 0)
  const modified = new Set([
    ...(status?.staged ?? []).map((c) => c.path),
    ...(status?.unstaged ?? []).map((c) => c.path)
  ])

  const matches = (name: string) => !filter || name.toLowerCase().includes(filter.toLowerCase())

  const renderEntries = (entries: TreeEntry[], depth: number): React.ReactNode =>
    entries
      .filter((e) => matches(e.name))
      .map((e) => {
        const key = viewerKey({
          kind: 'file',
          project,
          claudeConfigDir,
          path: e.path,
          label: e.name
        })
        if (e.isDir) {
          const isOpen = expanded.has(e.path)
          return (
            <div key={e.path}>
              <button
                className={`trow ${isOpen ? 'open' : ''}`}
                style={{ paddingLeft: 8 + depth * 14 }}
                onClick={() => toggleDir(e.path)}
              >
                <span className="car">
                  <ChevronIcon size={11} />
                </span>
                <span className="fo">
                  <FolderIcon size={14} />
                </span>
                <span className="nm2">{e.name}</span>
              </button>
              {isOpen && children.get(e.path) && renderEntries(children.get(e.path)!, depth + 1)}
            </div>
          )
        }
        return (
          <button
            key={e.path}
            className={`trow ${selected === key ? 'sel' : ''}`}
            style={{ paddingLeft: 8 + depth * 14 }}
            title="Click to preview, double-click to keep open"
            onClick={() => openFile(e, { preview: true })}
            onDoubleClick={() => openFile(e, { preview: false })}
          >
            <span className="fi2">
              <FileTextIcon size={13} />
            </span>
            <span className="nm2">{e.name}</span>
            {modified.has(e.path) && <span className="mod" title="Modified" />}
          </button>
        )
      })

  const changeRow = (c: GitFileChange, staged: boolean) => {
    const key = viewerKey({
      kind: 'diff',
      project,
      claudeConfigDir,
      path: c.path,
      staged,
      label: fileName(c.path)
    })
    return (
      <button
        key={`${staged ? 's' : 'w'}:${c.path}`}
        className={`frow ${selected === key ? 'sel' : ''}`}
        onClick={() => openDiff(c, staged, { preview: true })}
        onDoubleClick={() => openDiff(c, staged, { preview: false })}
        {...bind(c.path)}
      >
        <StatusBadge status={c.status} />
        <span className="fn">{fileName(c.path)}</span>
        <span className="fp">{fileDir(c.path)}</span>
        <span
          className="op"
          role="button"
          title={staged ? 'Unstage' : 'Stage'}
          onClick={(ev) => {
            ev.stopPropagation()
            if (staged) unstage(c.path)
            else stage(c.path)
          }}
        >
          {staged ? '−' : '+'}
        </span>
      </button>
    )
  }

  return (
    <aside className="panel">
      <div className="panel-head">
        <div className="mode" role="tablist">
          <button
            className={mode === 'git' ? 'on' : ''}
            role="tab"
            aria-selected={mode === 'git'}
            onClick={() => setMode('git')}
          >
            <GitBranchIcon size={13} /> Git
          </button>
          <button
            className={mode === 'files' ? 'on' : ''}
            role="tab"
            aria-selected={mode === 'files'}
            onClick={() => setMode('files')}
          >
            <FolderIcon size={13} /> Files
          </button>
        </div>
      </div>

      {mode === 'git' ? (
        <div className="pview">
          {status && !status.isRepo ? (
            <div className="panel-empty">This project is not a git repository.</div>
          ) : (
            <>
              <div className="branch-row">
                <GitBranchIcon size={13} />
                <span className="branch-name">{status?.branch ?? '—'}</span>
                {status && status.ahead > 0 && <span className="ab up">↑{status.ahead}</span>}
                {status && status.behind > 0 && <span className="ab down">↓{status.behind}</span>}
                <span className="acts">
                  <button
                    className="mini"
                    disabled={busy}
                    onClick={() => onError('Pull is not available yet — use the terminal for now.')}
                    {...bind('Pull')}
                  >
                    <ArrowDownIcon size={12} />
                  </button>
                  <button className="mini" disabled={busy} onClick={push} {...bind('Push')}>
                    <ArrowUpIcon size={12} />
                  </button>
                  <button
                    className="mini"
                    disabled={busy}
                    onClick={() => refreshStatus()}
                    {...bind('Refresh')}
                  >
                    <RefreshIcon size={12} />
                  </button>
                </span>
              </div>

              <div className="gtabs" role="tablist">
                <button
                  className={`gtab ${gitTab === 'changes' ? 'on' : ''}`}
                  role="tab"
                  aria-selected={gitTab === 'changes'}
                  onClick={() => setGitTab('changes')}
                >
                  Changes <span className="grp-n">{changeCount}</span>
                </button>
                <button
                  className={`gtab ${gitTab === 'history' ? 'on' : ''}`}
                  role="tab"
                  aria-selected={gitTab === 'history'}
                  onClick={() => {
                    setGitTab('history')
                    if (log === null) refreshLog()
                  }}
                >
                  History
                </button>
              </div>

              {gitTab === 'changes' ? (
                <>
                  <div className="plist">
                    {changeCount === 0 && (
                      <div className="panel-empty sm">Nothing changed — all up to date.</div>
                    )}
                    {status && status.staged.length > 0 && (
                      <>
                        <div className="grp">
                          STAGED <span className="grp-n">{status.staged.length}</span>
                        </div>
                        {status.staged.map((c) => changeRow(c, true))}
                      </>
                    )}
                    {status && status.unstaged.length > 0 && (
                      <>
                        <div className="grp">
                          CHANGES <span className="grp-n">{status.unstaged.length}</span>
                        </div>
                        {status.unstaged.map((c) => changeRow(c, false))}
                      </>
                    )}
                  </div>

                  <div className="composer">
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="feat: commit message (Conventional Commits)…"
                      aria-label="Commit message"
                    />
                    <button className="gen" onClick={generate} disabled={generating || busy}>
                      <SparklesIcon size={12} />
                      <span>{generating ? 'Generating…' : 'Generate message with Claude'}</span>
                    </button>
                    <div className="crow-actions">
                      <button
                        className="cbtn primary"
                        onClick={commit}
                        disabled={busy || !message.trim() || (status?.staged.length ?? 0) === 0}
                      >
                        Commit
                      </button>
                      <button
                        className="cbtn"
                        onClick={commitAndPush}
                        disabled={busy || !message.trim() || (status?.staged.length ?? 0) === 0}
                      >
                        Commit and push
                        <ArrowUpIcon size={11} />
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="clist">
                  {log === null ? (
                    <div className="panel-empty sm">Loading history…</div>
                  ) : log.length === 0 ? (
                    <div className="panel-empty sm">No commits yet.</div>
                  ) : (
                    log.map((c, i) => (
                      <button
                        key={c.hash}
                        className={`crow ${i === 0 ? 'first' : ''} ${i === log.length - 1 ? 'last' : ''} ${c.unpushed ? 'up' : ''}`}
                        onClick={() => openCommit(c, { preview: true })}
                        onDoubleClick={() => openCommit(c, { preview: false })}
                      >
                        <span className="rail" />
                        <span className="cbody">
                          <span className="cmsg">{c.subject}</span>
                          <span className="cmeta">
                            {c.shortHash} · {relativeTime(c.dateMs)}
                            {c.unpushed && <span className="tag-local">local ↑</span>}
                          </span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="pview">
          <div className="filter">
            <SearchIcon size={12} />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter files…"
              aria-label="Filter files"
            />
          </div>
          <div className="tree">
            {root === null ? (
              <div className="panel-empty sm">Loading…</div>
            ) : (
              renderEntries(root, 0)
            )}
          </div>
        </div>
      )}

      <TooltipHost tip={tip} />
    </aside>
  )
}
