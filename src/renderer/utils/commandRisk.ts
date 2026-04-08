// ─── Command Risk Guard ───────────────────────────────────────────────────────
// Pure, synchronous, zero-dependency risk analysis engine.
// Runs on every Enter keypress — must be fast.

export type RiskLevel = 'safe' | 'changes_files' | 'network' | 'elevated' | 'destructive'

export interface RiskResult {
  level: RiskLevel
  reasons: string[]
}

interface RiskRule {
  level: RiskLevel
  reason: string
  test: (cmd: string) => boolean
}

// ─── Rule table ──────────────────────────────────────────────────────────────
// Ordered by severity ascending. All matching rules are collected so every
// applicable reason is shown to the user.

const RULES: RiskRule[] = [
  // ── changes_files ──────────────────────────────────────────────────────────
  {
    level: 'changes_files',
    reason: 'move / rename',
    test: cmd => /\bmv\b/.test(cmd),
  },
  {
    level: 'changes_files',
    reason: 'recursive copy',
    test: cmd => /\bcp\b/.test(cmd) && /\s-[a-zA-Z]*[rRa]/.test(cmd),
  },
  {
    level: 'changes_files',
    reason: 'overwrite redirect',
    // Match > that is NOT >> and NOT |> and NOT =>
    test: cmd => /(?<![>|=!])\s*>(?![>=])/.test(cmd),
  },
  {
    level: 'changes_files',
    reason: 'create symlink',
    test: cmd => /\bln\b/.test(cmd) && /\s-[a-zA-Z]*s/.test(cmd),
  },

  // ── network ────────────────────────────────────────────────────────────────
  {
    level: 'network',
    reason: 'pipe to shell',
    test: cmd =>
      /\b(curl|wget)\b.+\|\s*(ba|da|z)?sh\b/.test(cmd) ||
      /\b(ba|da|z)?sh\b\s+<\s*\(\s*(curl|wget)\b/.test(cmd),
  },
  {
    level: 'network',
    reason: 'network listener',
    test: cmd => /\bnc\b.+-l/.test(cmd) || /\bncat\b.+-l/.test(cmd),
  },
  {
    level: 'network',
    reason: 'reverse SSH tunnel',
    test: cmd => /\bssh\b/.test(cmd) && /\s-[a-zA-Z]*R/.test(cmd),
  },
  {
    level: 'network',
    reason: 'rsync with delete',
    test: cmd => /\brsync\b/.test(cmd) && /--delete/.test(cmd),
  },

  // ── elevated ───────────────────────────────────────────────────────────────
  {
    level: 'elevated',
    reason: 'sudo elevation',
    test: cmd => /\bsudo\b/.test(cmd),
  },
  {
    level: 'elevated',
    reason: 'switch user',
    test: cmd => /\bsu\b(\s|$)/.test(cmd) && !/\bsudo\b/.test(cmd),
  },
  {
    level: 'elevated',
    reason: 'recursive permission change',
    test: cmd =>
      (/\bchmod\b/.test(cmd) || /\bchown\b/.test(cmd) || /\bchgrp\b/.test(cmd)) &&
      /\s-[a-zA-Z]*[rR]/.test(cmd),
  },
  {
    level: 'elevated',
    reason: 'sudoers edit',
    test: cmd => /\bvisudo\b/.test(cmd),
  },
  {
    level: 'elevated',
    reason: 'password change',
    test: cmd => /\bpasswd\b/.test(cmd),
  },
  {
    level: 'elevated',
    reason: 'user management',
    test: cmd => /\b(usermod|useradd|userdel|groupadd|groupdel)\b/.test(cmd),
  },
  {
    level: 'elevated',
    reason: 'service control',
    test: cmd => /\bsystemctl\b/.test(cmd),
  },

  // ── destructive ─────────────────────────────────────────────────────────────
  {
    level: 'destructive',
    reason: 'recursive delete',
    test: cmd =>
      /\brm\b/.test(cmd) &&
      (/\s-[a-zA-Z]*[rR]/.test(cmd) || /--recursive/.test(cmd)),
  },
  {
    level: 'destructive',
    reason: 'wildcard delete',
    // rm with any glob character in its argument area
    test: cmd => /\brm\b/.test(cmd) && /[*?{]/.test(cmd),
  },
  {
    level: 'destructive',
    reason: 'disk wipe',
    test: cmd => /\b(shred|wipefs|wipe)\b/.test(cmd),
  },
  {
    level: 'destructive',
    reason: 'raw disk write',
    test: cmd => /\bdd\b/.test(cmd) && /\bof=/.test(cmd),
  },
  {
    level: 'destructive',
    reason: 'filesystem format',
    test: cmd => /\bmkfs(\.\w+)?\b/.test(cmd),
  },
  {
    level: 'destructive',
    reason: 'git untracked file wipe',
    test: cmd =>
      /\bgit\s+clean\b/.test(cmd) &&
      /\s-[a-zA-Z]*[fdx]/.test(cmd),
  },
  {
    level: 'destructive',
    reason: 'docker resource prune',
    test: cmd => /\bdocker\b/.test(cmd) && /\bprune\b/.test(cmd),
  },
  {
    level: 'destructive',
    reason: 'file truncation',
    test: cmd => /\btruncate\b/.test(cmd) && /(-s\s*0|--size[=\s]+0)/.test(cmd),
  },
  {
    level: 'destructive',
    reason: 'kill all processes',
    test: cmd => /\bkill\b/.test(cmd) && /-9\s+-1\b/.test(cmd),
  },
  {
    level: 'destructive',
    reason: 'aggressive process kill',
    test: cmd => /\bpkill\b/.test(cmd) && /-9/.test(cmd),
  },
]

const LEVEL_ORDER: RiskLevel[] = ['safe', 'changes_files', 'network', 'elevated', 'destructive']

function maxLevel(a: RiskLevel, b: RiskLevel): RiskLevel {
  return LEVEL_ORDER.indexOf(a) >= LEVEL_ORDER.indexOf(b) ? a : b
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Analyse a command string and return its risk level + human-readable reasons. */
export function analyzeCommandRisk(raw: string): RiskResult {
  const cmd = raw.trim()
  if (!cmd) return { level: 'safe', reasons: [] }

  // Check trusted patterns first — skip analysis entirely
  if (isTrusted(cmd)) return { level: 'safe', reasons: [] }

  let level: RiskLevel = 'safe'
  const reasons: string[] = []

  for (const rule of RULES) {
    if (rule.test(cmd)) {
      level = maxLevel(level, rule.level)
      reasons.push(rule.reason)
    }
  }

  return { level, reasons }
}

// ─── Trust patterns (localStorage) ────────────────────────────────────────────

const TRUST_KEY = 'nimbus:trusted-commands'

export function getTrustedCommands(): string[] {
  try {
    return JSON.parse(localStorage.getItem(TRUST_KEY) ?? '[]')
  } catch {
    return []
  }
}

export function trustCommand(cmd: string): void {
  const existing = getTrustedCommands()
  if (!existing.includes(cmd)) {
    localStorage.setItem(TRUST_KEY, JSON.stringify([...existing, cmd]))
  }
}

function isTrusted(cmd: string): boolean {
  return getTrustedCommands().includes(cmd)
}

// ─── Display helpers ──────────────────────────────────────────────────────────

export const RISK_DISPLAY: Record<RiskLevel, { label: string; color: string; bg: string }> = {
  safe:          { label: 'SAFE',         color: 'var(--success)',  bg: 'rgba(106,247,160,0.08)' },
  changes_files: { label: 'CHANGES FILES', color: 'var(--warning)', bg: 'rgba(247,185,106,0.08)' },
  network:       { label: 'NETWORK',      color: 'var(--network)',  bg: 'rgba(106,180,247,0.08)' },
  elevated:      { label: 'ELEVATED',     color: 'var(--elevated)', bg: 'rgba(247,154,106,0.08)' },
  destructive:   { label: 'DESTRUCTIVE',  color: 'var(--danger)',   bg: 'rgba(247,106,106,0.10)' },
}
