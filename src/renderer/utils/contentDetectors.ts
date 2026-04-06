/**
 * Detects rich content blocks in terminal output.
 *
 * Works on text from xterm buffer (translateToString), which pads lines
 * with trailing spaces to the terminal width. We trim each line before analysis.
 */

export interface RichBlock {
  id: string
  type: 'markdown' | 'table' | 'json'
  content: string
}

// Strip ANSI escape sequences for analysis
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?(\x07|\x1b\\)|\x1b[()][0-9A-B]/g, '')
}

/** Clean xterm buffer text: strip ANSI, trim each line, drop empty trailing lines */
function cleanBufferText(raw: string): string[] {
  const stripped = stripAnsi(raw)
  const lines = stripped.split('\n').map(l => l.trimEnd())
  // Drop trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
  return lines
}

// ─── Markdown detection ─────────────────────────────────────────────────────

const MD_FENCED_BLOCK = /```[\s\S]*?```/
const MD_HEADING = /^#{1,6}\s+.+/
const MD_LIST = /^[\t ]*[-*+]\s+.+/
const MD_BOLD_ITALIC = /\*\*.+?\*\*/
const MD_LINK = /\[.+?\]\(.+?\)/

function looksLikeMarkdown(lines: string[]): string | null {
  const text = lines.join('\n')

  // Fenced code blocks are a strong signal
  const fenced = text.match(MD_FENCED_BLOCK)
  if (fenced && fenced[0].length > 10) return fenced[0]

  // Need at least 2 markdown signals
  let signals = 0
  const hasHeading = lines.some(l => MD_HEADING.test(l))
  const hasList = lines.some(l => MD_LIST.test(l))
  const hasBold = MD_BOLD_ITALIC.test(text)
  const hasLink = MD_LINK.test(text)

  if (hasHeading) signals++
  if (hasList) signals++
  if (hasBold) signals++
  if (hasLink) signals++

  if (signals >= 2) {
    // Extract from first markdown signal to end
    const start = lines.findIndex(l => MD_HEADING.test(l) || MD_LIST.test(l) || MD_BOLD_ITALIC.test(l))
    if (start >= 0) {
      // Find the end — stop at lines that look like shell prompts
      let end = lines.length
      for (let i = start + 1; i < lines.length; i++) {
        if (looksLikePrompt(lines[i])) { end = i; break }
      }
      return lines.slice(start, end).join('\n').trim()
    }
  }

  return null
}

// ─── Table detection ────────────────────────────────────────────────────────

function looksLikeTable(lines: string[]): string | null {
  // Pipe-delimited table (markdown-style): |col|col|
  // Find runs of consecutive pipe-delimited lines
  let runStart = -1
  let bestRun: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    const isPipeLine = trimmed.startsWith('|') && trimmed.includes('|', 1) && trimmed.split('|').length >= 3
    if (isPipeLine) {
      if (runStart === -1) runStart = i
    } else {
      if (runStart !== -1) {
        const run = lines.slice(runStart, i)
        if (run.length > bestRun.length) bestRun = run
        runStart = -1
      }
    }
  }
  // Check last run
  if (runStart !== -1) {
    const run = lines.slice(runStart)
    if (run.length > bestRun.length) bestRun = run
  }

  if (bestRun.length >= 3) {
    return bestRun.map(l => l.trim()).join('\n')
  }

  // Box-drawing table (psql, mysql, etc.)
  const boxBorder = /^[+\-─┌┐└┘├┤┬┴┼╔╗╚╝╠╣╦╩╬═]+$/
  const boxRunStart = lines.findIndex(l => boxBorder.test(l.trim()))
  if (boxRunStart >= 0) {
    let boxEnd = boxRunStart + 1
    for (let i = boxRunStart + 1; i < lines.length; i++) {
      const t = lines[i].trim()
      if (boxBorder.test(t) || t.includes('│') || (t.startsWith('|') && t.endsWith('|'))) {
        boxEnd = i + 1
      } else {
        break
      }
    }
    if (boxEnd - boxRunStart >= 3) {
      return lines.slice(boxRunStart, boxEnd).map(l => l.trim()).join('\n')
    }
  }

  return null
}

// ─── JSON detection ─────────────────────────────────────────────────────────

function looksLikeJson(lines: string[]): string | null {
  // Find lines that start with { or [ and try to collect a complete JSON block
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed === '{' || trimmed === '[' || trimmed.startsWith('{"') || trimmed.startsWith('[{')) {
      // Collect lines until we find matching close
      const openChar = trimmed[0]
      const closeChar = openChar === '{' ? '}' : ']'
      let depth = 0
      const jsonLines: string[] = []

      for (let j = i; j < lines.length; j++) {
        const lt = lines[j].trim()
        jsonLines.push(lt)
        for (const ch of lt) {
          if (ch === openChar) depth++
          else if (ch === closeChar) depth--
        }
        if (depth === 0 && jsonLines.length >= 2) {
          const candidate = jsonLines.join('\n')
          try {
            JSON.parse(candidate)
            if (jsonLines.length >= 3) return candidate
          } catch {
            // keep looking
          }
          break
        }
      }
    }
  }
  return null
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Detect shell prompt lines to avoid including them in extracted content */
function looksLikePrompt(line: string): boolean {
  const t = line.trim()
  // Common prompt patterns: ends with $, %, >, #, or contains user@host
  return /[$%>#]\s*$/.test(t) || /\w+@\w+/.test(t)
}

// ─── Main detector ──────────────────────────────────────────────────────────

let blockCounter = 0

export function detectRichContent(rawOutput: string): RichBlock[] {
  const lines = cleanBufferText(rawOutput)
  const blocks: RichBlock[] = []

  // Only analyze substantial output
  if (lines.length < 3) return blocks

  const table = looksLikeTable(lines)
  if (table) {
    blocks.push({ id: `rich-${++blockCounter}`, type: 'table', content: table })
  }

  const json = looksLikeJson(lines)
  if (json) {
    blocks.push({ id: `rich-${++blockCounter}`, type: 'json', content: json })
  }

  const md = looksLikeMarkdown(lines)
  if (md) {
    blocks.push({ id: `rich-${++blockCounter}`, type: 'markdown', content: md })
  }

  return blocks
}
