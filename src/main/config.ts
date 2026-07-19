import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { AppConfig, ModelConfig, ProjectEntry } from '@shared/types'

/** How many recent projects the config keeps. */
const MAX_RECENT_PROJECTS = 20

/**
 * Accent colors handed out to projects as they're added, cycled by index so a
 * fresh set of projects reads as visually distinct out of the box. Cool, jewel
 * hues with no browns — the user can override any of them in Settings.
 */
export const PROJECT_PALETTE = [
  '#6f9dff',
  '#b98bff',
  '#5fd8a4',
  '#f472b6',
  '#38bdf8',
  '#c084fc',
  '#2dd4bf',
  '#fb7185'
]

/** The palette color for the nth project (wraps around the list). */
export function paletteColor(index: number): string {
  return PROJECT_PALETTE[index % PROJECT_PALETTE.length]
}

/** The built-in models, used until the user edits the list. */
export function defaultModels(): ModelConfig[] {
  return [
    {
      alias: 'fable',
      display: 'Fable 5',
      idPrefix: 'claude-fable-5',
      contextWindow: 1_000_000
    },
    {
      alias: 'opus',
      display: 'Opus 4.8',
      idPrefix: 'claude-opus-4-8',
      contextWindow: 1_000_000
    },
    {
      alias: 'sonnet',
      display: 'Sonnet 5',
      idPrefix: 'claude-sonnet-5',
      contextWindow: 1_000_000
    },
    {
      alias: 'haiku',
      display: 'Haiku 4.5',
      idPrefix: 'claude-haiku-4-5',
      contextWindow: 200_000
    }
  ]
}

function defaultConfig(): AppConfig {
  return { projects: [], defaultModel: 'sonnet', models: defaultModels(), defaultEffort: '' }
}

/**
 * Gives every project an accent color: ones saved before the field existed (or
 * added without one) get a palette color by their position in the list, so an
 * upgraded config lights up with distinct per-project hues. Colors already set
 * are left untouched.
 */
function migrateProjectColors(projects: ProjectEntry[]): ProjectEntry[] {
  return projects.map((p, i) => (p.color ? p : { ...p, color: paletteColor(i) }))
}

/**
 * Fills in `contextWindow` for a config saved before that field existed.
 * Haiku's id is the one recognizable exception to the 1M window every other
 * current model carries.
 */
function migrateContextWindows(models: ModelConfig[]): ModelConfig[] {
  return models.map((m) =>
    typeof m.contextWindow === 'number' && m.contextWindow > 0
      ? m
      : { ...m, contextWindow: m.idPrefix?.includes('haiku') ? 200_000 : 1_000_000 }
  )
}

function configDir(): string {
  // ~/.inkshell on every platform, matching the original app's ~/.ClaudeUI dotdir.
  const dir = join(app.getPath('home'), '.inkshell')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function configPath(): string {
  return join(configDir(), 'config.json')
}

/**
 * Loads the config, tolerating a missing or partially-written file by filling
 * in defaults field-by-field. This is what surfaces newly-introduced settings
 * (e.g. a new default model list) in an older config on first run.
 */
export function loadConfig(): AppConfig {
  const base = defaultConfig()
  try {
    const raw = JSON.parse(readFileSync(configPath(), 'utf-8')) as Partial<AppConfig>
    return {
      projects: migrateProjectColors(Array.isArray(raw.projects) ? raw.projects : base.projects),
      defaultModel:
        typeof raw.defaultModel === 'string' && raw.defaultModel.trim()
          ? raw.defaultModel
          : base.defaultModel,
      models: migrateContextWindows(
        Array.isArray(raw.models) && raw.models.length > 0 ? raw.models : base.models
      ),
      defaultEffort: typeof raw.defaultEffort === 'string' ? raw.defaultEffort : base.defaultEffort
    }
  } catch {
    return base
  }
}

export function saveConfig(config: AppConfig): void {
  try {
    writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf-8')
  } catch (err) {
    console.error('[inkshell] failed to save config:', err)
  }
}

/**
 * Records `path` as the most recent project, unless it is already known. Known
 * projects are left in place so re-selecting one never reorders the list nor
 * overwrites a custom name the user set by hand. Returns the updated config.
 */
export function addRecentProject(config: AppConfig, path: string): AppConfig {
  if (config.projects.some((p) => p.path === path)) return config
  const entry: ProjectEntry = {
    name: basename(path) || path,
    path,
    color: paletteColor(config.projects.length)
  }
  const projects = [entry, ...config.projects].slice(0, MAX_RECENT_PROJECTS)
  const next = { ...config, projects }
  saveConfig(next)
  return next
}
