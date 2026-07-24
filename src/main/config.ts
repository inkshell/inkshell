import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  paletteColor,
  DEFAULT_TERMINAL_FONT_SIZE,
  TERMINAL_FONT_SIZE_MIN,
  TERMINAL_FONT_SIZE_MAX,
  type AppConfig,
  type ModelConfig,
  type ProjectEntry
} from '@shared/types'

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
  return {
    projects: [],
    defaultModel: 'sonnet',
    models: defaultModels(),
    defaultEffort: '',
    commitMessageModel: 'haiku',
    terminalFontSize: DEFAULT_TERMINAL_FONT_SIZE
  }
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
      defaultEffort: typeof raw.defaultEffort === 'string' ? raw.defaultEffort : base.defaultEffort,
      // A string (including '') is the user's choice; only an absent field
      // falls back to the default.
      commitMessageModel:
        typeof raw.commitMessageModel === 'string'
          ? raw.commitMessageModel
          : base.commitMessageModel,
      terminalFontSize:
        typeof raw.terminalFontSize === 'number' &&
        raw.terminalFontSize >= TERMINAL_FONT_SIZE_MIN &&
        raw.terminalFontSize <= TERMINAL_FONT_SIZE_MAX
          ? raw.terminalFontSize
          : base.terminalFontSize
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
