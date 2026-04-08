// ─── Command Preview Engine ───────────────────────────────────────────────────
// Maps risky commands to safe read-only preview operations.
// The main process executes these through a locked-down IPC handler.

export type PreviewType =
  | 'find'           // list files under a path
  | 'git_clean_n'    // git clean --dry-run
  | 'ps_pid'         // show process by PID
  | 'pgrep'          // show processes matching name
  | 'docker_df'      // show docker disk usage
  | 'stat'           // show file/dir metadata

export interface PreviewRequest {
  type: PreviewType
  cwd: string
  // type-specific params
  path?: string
  maxDepth?: number
  flags?: string      // for git_clean_n
  pid?: number        // for ps_pid
  name?: string       // for pgrep
}

export interface PreviewResult {
  lines: string[]
  totalCount?: number   // actual total when results are truncated
  label: string         // e.g. "Files that would be deleted"
  error?: string
}

// ─── Parse preview request from a risky command ───────────────────────────────

export function getPreviewRequest(command: string, cwd: string): PreviewRequest | null {
  const cmd = command.trim()

  // git clean → dry-run
  if (/\bgit\s+clean\b/.test(cmd)) {
    // Extract flags like -fd, -dfx, etc.
    const m = cmd.match(/git\s+clean\s+([-\w\s]+)/)
    const rawFlags = m ? m[1].trim() : '-fd'
    // Normalise: strip f (not needed for dry-run), keep d and x
    const flags = rawFlags.replace(/f/g, '').trim() || '-d'
    return { type: 'git_clean_n', cwd, flags }
  }

  // kill by PID
  if (/\bkill\b/.test(cmd) && !/\bpkill\b/.test(cmd)) {
    const m = cmd.match(/kill\b[^0-9-]*-?\d+\s+(\d+)/) || cmd.match(/kill\b[^0-9]*(\d{2,6})\b/)
    const pid = m ? parseInt(m[1], 10) : null
    if (pid && pid > 0 && pid < 1000000) {
      return { type: 'ps_pid', cwd, pid }
    }
  }

  // pkill by name
  if (/\bpkill\b/.test(cmd)) {
    const m = cmd.match(/pkill\b.*?\s+([\w.-]+)$/)
    if (m) return { type: 'pgrep', cwd, name: m[1] }
  }

  // docker prune → docker system df
  if (/\bdocker\b/.test(cmd) && /\bprune\b/.test(cmd)) {
    return { type: 'docker_df', cwd }
  }

  // rm (recursive or wildcard) → find the target path
  if (/\brm\b/.test(cmd)) {
    const path = extractRmTarget(cmd)
    if (path) return { type: 'find', cwd, path, maxDepth: 4 }
  }

  // shred / dd → stat the target
  if (/\bshred\b/.test(cmd) || (/\bdd\b/.test(cmd) && /\bof=/.test(cmd))) {
    const path = extractFilePath(cmd)
    if (path) return { type: 'stat', cwd, path }
  }

  // chmod/chown -R → list affected paths
  if ((/\bchmod\b/.test(cmd) || /\bchown\b/.test(cmd)) && /\s-[a-zA-Z]*[rR]/.test(cmd)) {
    const path = extractLastArg(cmd)
    if (path) return { type: 'find', cwd, path, maxDepth: 3 }
  }

  return null
}

// ─── Helper: extract the target path from rm flags ────────────────────────────

function extractRmTarget(cmd: string): string | null {
  // Strip "rm" and all flags (tokens starting with -)
  const tokens = cmd
    .replace(/\brm\b/, '')
    .trim()
    .split(/\s+/)
    .filter(t => !t.startsWith('-') && t.length > 0)
  return tokens[0] ?? null
}

function extractFilePath(cmd: string): string | null {
  // For "of=path" in dd
  const m = cmd.match(/\bof=(\S+)/)
  if (m) return m[1]
  // Last non-flag token
  return extractLastArg(cmd)
}

function extractLastArg(cmd: string): string | null {
  const tokens = cmd.split(/\s+/).filter(t => !t.startsWith('-') && t.length > 0)
  const last = tokens[tokens.length - 1]
  // Skip if it looks like a command name (all lowercase, common binary)
  if (!last || /^(rm|shred|chmod|chown|dd|docker|git)$/.test(last)) return null
  return last
}

// ─── Display label per preview type ──────────────────────────────────────────

export function previewLabel(type: PreviewType): string {
  switch (type) {
    case 'find':       return 'Files that would be affected'
    case 'git_clean_n':return 'Untracked files that would be removed'
    case 'ps_pid':     return 'Process that would be killed'
    case 'pgrep':      return 'Processes that would be killed'
    case 'docker_df':  return 'Docker disk usage'
    case 'stat':       return 'File that would be affected'
  }
}
