import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import go from 'highlight.js/lib/languages/go'
import graphql from 'highlight.js/lib/languages/graphql'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import less from 'highlight.js/lib/languages/less'
import markdown from 'highlight.js/lib/languages/markdown'
import objectivec from 'highlight.js/lib/languages/objectivec'
import php from 'highlight.js/lib/languages/php'
import python from 'highlight.js/lib/languages/python'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import scss from 'highlight.js/lib/languages/scss'
import shell from 'highlight.js/lib/languages/shell'
import sql from 'highlight.js/lib/languages/sql'
import swift from 'highlight.js/lib/languages/swift'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('c', c)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('csharp', csharp)
hljs.registerLanguage('css', css)
hljs.registerLanguage('dockerfile', dockerfile)
hljs.registerLanguage('go', go)
hljs.registerLanguage('graphql', graphql)
hljs.registerLanguage('ini', ini)
hljs.registerLanguage('java', java)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('kotlin', kotlin)
hljs.registerLanguage('less', less)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('objectivec', objectivec)
hljs.registerLanguage('php', php)
hljs.registerLanguage('python', python)
hljs.registerLanguage('ruby', ruby)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('scss', scss)
hljs.registerLanguage('shell', shell)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('swift', swift)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('yaml', yaml)

/** Extension (lowercased, no dot) → registered hljs language name. */
const EXT_LANG: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  pyw: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  cs: 'csharp',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  kts: 'kotlin',
  m: 'objectivec',
  mm: 'objectivec',
  html: 'xml',
  htm: 'xml',
  xml: 'xml',
  svg: 'xml',
  vue: 'xml',
  css: 'css',
  scss: 'scss',
  less: 'less',
  json: 'json',
  yml: 'yaml',
  yaml: 'yaml',
  md: 'markdown',
  markdown: 'markdown',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  ini: 'ini',
  toml: 'ini',
  cfg: 'ini'
}

/** Basename (lowercased) → language name, for extension-less files. */
const NAME_LANG: Record<string, string> = {
  dockerfile: 'dockerfile',
  makefile: 'shell'
}

/** Maps a project-relative file path to a registered hljs language, if any. */
export function languageForPath(path: string): string | undefined {
  const base = (path.split('/').pop() ?? path).toLowerCase()
  if (NAME_LANG[base]) return NAME_LANG[base]
  const dot = base.lastIndexOf('.')
  if (dot === -1) return undefined
  return EXT_LANG[base.slice(dot + 1)]
}

const ESCAPE_RE = /[&<>]/g
const ESCAPE_MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }

function escapeHtml(text: string): string {
  return text.replace(ESCAPE_RE, (c) => ESCAPE_MAP[c])
}

const SPAN_OPEN_RE = /<span class="([^"]*)">|<\/span>|\n/g

/**
 * Splits hljs's single HTML blob for a whole file into one HTML string per
 * line, re-balancing `<span>` tags across the split so a token that spans
 * several lines (a block comment, a template literal) still colors correctly
 * on every row it touches.
 */
function splitHighlightedHtml(html: string): string[] {
  const lines: string[] = []
  const openClasses: string[] = []
  let line = ''
  let lastIndex = 0
  let m: RegExpExecArray | null
  SPAN_OPEN_RE.lastIndex = 0
  while ((m = SPAN_OPEN_RE.exec(html))) {
    line += html.slice(lastIndex, m.index)
    lastIndex = SPAN_OPEN_RE.lastIndex
    if (m[0] === '\n') {
      line += '</span>'.repeat(openClasses.length)
      lines.push(line)
      line = openClasses.map((cls) => `<span class="${cls}">`).join('')
    } else if (m[0] === '</span>') {
      openClasses.pop()
      line += '</span>'
    } else {
      openClasses.push(m[1])
      line += m[0]
    }
  }
  line += html.slice(lastIndex)
  lines.push(line)
  return lines
}

/**
 * Highlights `code` as `lang` and returns one HTML string per line, safe to
 * drop into `dangerouslySetInnerHTML`. Falls back to escaped plain text when
 * the language isn't recognized or highlighting throws on malformed input.
 */
export function highlightLines(code: string, lang: string | undefined): string[] {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return splitHighlightedHtml(
        hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
      )
    } catch {
      // Fall through to the plain-text path below.
    }
  }
  return code.split('\n').map(escapeHtml)
}
