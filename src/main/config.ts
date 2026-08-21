import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  paletteColor,
  DEFAULT_TERMINAL_FONT_SIZE,
  TERMINAL_FONT_SIZE_MIN,
  TERMINAL_FONT_SIZE_MAX,
  type AppConfig,
  type ProjectEntry
} from '@shared/types'

function defaultConfig(): AppConfig {
  return {
    projects: [],
    defaultModel: 'sonnet',
    defaultOpencodeModel: '',
    defaultEffort: '',
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
 * in an older config on first run.
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
      // Strings below are the user's choice even when empty ('' = let the CLI
      // pick its own default); only an absent field falls back.
      defaultOpencodeModel:
        typeof raw.defaultOpencodeModel === 'string'
          ? raw.defaultOpencodeModel
          : base.defaultOpencodeModel,
      defaultEffort: typeof raw.defaultEffort === 'string' ? raw.defaultEffort : base.defaultEffort,
      // A hand-edited value outside the toolbar's own range is clamped rather
      // than discarded, so intent ("bigger than default") survives even when
      // the exact number doesn't.
      terminalFontSize:
        typeof raw.terminalFontSize === 'number' && Number.isFinite(raw.terminalFontSize)
          ? Math.min(TERMINAL_FONT_SIZE_MAX, Math.max(TERMINAL_FONT_SIZE_MIN, raw.terminalFontSize))
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
