import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell, safeStorage } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as pty from 'node-pty'
import * as os from 'os'
import Anthropic from '@anthropic-ai/sdk'

app.setName('Nimbus')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// ─── Security: Input validation ──────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function validatePtyId(id: unknown): string {
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    throw new Error('Invalid PTY id')
  }
  return id
}

function validateDimension(val: unknown, fallback: number): number {
  const n = typeof val === 'number' ? Math.floor(val) : fallback
  return Math.max(1, Math.min(n, 500))
}

// ─── Security: Environment filtering ─────────────────────────────────────────

const ENV_BLOCKLIST = new Set([
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'OPENAI_ORG_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'GITLAB_TOKEN',
  'NPM_TOKEN',
  'DOCKER_PASSWORD',
  'SLACK_TOKEN',
  'SLACK_BOT_TOKEN',
  'STRIPE_SECRET_KEY',
  'STRIPE_API_KEY',
  'TWILIO_AUTH_TOKEN',
  'SENDGRID_API_KEY',
  'DATABASE_URL',
  'REDIS_URL',
  'MONGO_URI',
  'SENTRY_AUTH_TOKEN',
  'SNYK_TOKEN',
  'VERCEL_TOKEN',
  'NETLIFY_AUTH_TOKEN',
  'HEROKU_API_KEY',
  'DIGITALOCEAN_ACCESS_TOKEN',
  'CLOUDFLARE_API_TOKEN',
])

function filteredEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, val] of Object.entries(process.env)) {
    if (val !== undefined && !ENV_BLOCKLIST.has(key)) {
      env[key] = val
    }
  }
  return env
}

// ─── Security: API key storage (macOS Keychain via safeStorage) ──────────────

const API_KEY_PATH = path.join(app.getPath('userData'), '.api-key')

// ─── Window ──────────────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f0f1a',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
    trafficLightPosition: { x: 16, y: 16 },
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  win.webContents.on('did-finish-load', () => {
    win.focus()
    win.webContents.focus()
  })

  win.on('enter-full-screen', () => win.webContents.send('window:fullscreen', true))
  win.on('leave-full-screen', () => win.webContents.send('window:fullscreen', false))

  // ── Security: Block in-app navigation to external URLs ──
  win.webContents.on('will-navigate', (event, url) => {
    const rendererUrl = process.env['ELECTRON_RENDERER_URL']
    if (url.startsWith('file://')) return
    if (rendererUrl && url.startsWith(rendererUrl)) return
    event.preventDefault()
  })

  // ── Security: External links open in system browser, not Electron ──
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  return win
}

// ─── Security: Content Security Policy ───────────────────────────────────────

function setupCSP() {
  const devSources = isDev
    ? " http://localhost:* ws://localhost:*"
    : ''
  // Vite dev server injects inline <script type="module"> for HMR — allow in dev only
  const devScriptExtra = isDev ? " 'unsafe-inline'" : ''

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'wasm-unsafe-eval'${devScriptExtra}${devSources}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com${devSources}`,
    "font-src 'self' https://fonts.gstatic.com data:",
    `connect-src 'self' https://api.anthropic.com${devSources}`,
    "img-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ')

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    })
  })
}

// ─── Shell integration ───────────────────────────────────────────────────────

let shellIntegrationDir: string | null = null

function setupShellIntegration(): string | null {
  try {
    const dir = path.join(app.getPath('userData'), 'shell-integration', 'zsh')
    fs.mkdirSync(dir, { recursive: true })

    const zshrc = path.join(dir, '.zshrc')
    const script = [
      '# Nimbus shell integration — auto-generated, do not edit',
      '# Restore real ZDOTDIR (or unset it) so user .zshrc loads correctly',
      'unset ZDOTDIR',
      '[[ -f ~/.zshrc ]] && builtin source ~/.zshrc',
      '# Re-point ZDOTDIR back to ourselves so precmd/preexec persist across subshells',
      'export ZDOTDIR="$NIMBUS_ZDOTDIR"',
      '',
      '__nimbus_preexec() {',
      '  builtin printf "\\033]633;E;%s\\007" "$1"',
      '  builtin printf "\\033]633;C\\007"',
      '}',
      '',
      '__nimbus_precmd() {',
      '  local __nimbus_exit=$?',
      '  builtin printf "\\033]633;D;%d\\007" $__nimbus_exit',
      '  builtin printf "\\033]633;P;Cwd=%s\\007" "$PWD"',
      '}',
      '',
      'autoload -Uz add-zsh-hook',
      'add-zsh-hook preexec __nimbus_preexec',
      'add-zsh-hook precmd __nimbus_precmd',
    ].join('\n') + '\n'

    fs.writeFileSync(zshrc, script, 'utf8')
    return dir
  } catch (err) {
    console.error('[nimbus] Failed to set up shell integration:', err)
    return null
  }
}

// ─── PTY management ──────────────────────────────────────────────────────────

const MAX_PTY_COUNT = 20
const MAX_WRITE_LENGTH = 1_048_576 // 1MB
const ptyProcesses = new Map<string, pty.IPty>()

ipcMain.handle('pty:create', (_, args) => {
  const id = validatePtyId(args?.id)
  const cols = validateDimension(args?.cols, 80)
  const rows = validateDimension(args?.rows, 24)

  if (ptyProcesses.has(id)) {
    // Reconnect to existing PTY — happens in React StrictMode where effects
    // run twice: the first RAF creates the PTY before the cleanup's kill
    // arrives, so the second RAF finds it already running. Resize to the
    // requested dimensions and treat it as success.
    const existing = ptyProcesses.get(id)!
    try { existing.resize(cols, rows) } catch { /* ignore stale resize */ }
    return { success: true }
  }
  if (ptyProcesses.size >= MAX_PTY_COUNT) {
    return { success: false, error: 'Maximum terminal limit reached' }
  }

  // Resolve initial CWD — fall back to home if path no longer exists
  const rawCwd = typeof args?.cwd === 'string' ? args.cwd : null
  let resolvedCwd = os.homedir()
  if (rawCwd) {
    try {
      if (fs.statSync(rawCwd).isDirectory()) resolvedCwd = rawCwd
    } catch { /* directory gone, use home */ }
  }

  const userShell = os.platform() === 'win32' ? 'powershell.exe' : (process.env.SHELL || 'zsh')
  const isZsh = userShell.endsWith('zsh')
  const shellArgs = isZsh ? ['-o', 'NO_PROMPT_SP'] : []

  const integrationEnv: Record<string, string> = {}
  if (isZsh && shellIntegrationDir) {
    integrationEnv['ZDOTDIR'] = shellIntegrationDir
    integrationEnv['NIMBUS_ZDOTDIR'] = shellIntegrationDir
  }

  const ptyProcess = pty.spawn(userShell, shellArgs, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: resolvedCwd,
    env: {
      ...filteredEnv(),
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM: 'Nimbus',
      SHELL_SESSIONS_DISABLE: '1',
      ...integrationEnv,
    },
  })

  ptyProcesses.set(id, ptyProcess)

  ptyProcess.onData((data) => {
    // Broadcast to ALL windows — any window may own this PTY
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(`pty:data:${id}`, data)
    }
  })

  ptyProcess.onExit(() => {
    ptyProcesses.delete(id)
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(`pty:exit:${id}`)
    }
  })

  return { success: true }
})

ipcMain.handle('pty:write', (_, args) => {
  const id = validatePtyId(args?.id)
  const data = args?.data
  if (typeof data !== 'string' || data.length > MAX_WRITE_LENGTH) {
    throw new Error('Invalid write data')
  }
  const proc = ptyProcesses.get(id)
  if (!proc) throw new Error('PTY not found')
  proc.write(data)
})

ipcMain.handle('pty:resize', (_, args) => {
  const id = validatePtyId(args?.id)
  const cols = validateDimension(args?.cols, 80)
  const rows = validateDimension(args?.rows, 24)
  const proc = ptyProcesses.get(id)
  if (!proc) throw new Error('PTY not found')
  proc.resize(cols, rows)
})

ipcMain.handle('pty:kill', (_, args) => {
  const id = validatePtyId(args?.id)
  const proc = ptyProcesses.get(id)
  if (proc) {
    proc.kill()
    ptyProcesses.delete(id)
  }
})

// ─── API key storage (Keychain-encrypted) ────────────────────────────────────

ipcMain.handle('apiKey:store', async (_, args) => {
  const key = args?.key
  if (typeof key !== 'string' || key.length === 0 || key.length > 256) {
    throw new Error('Invalid API key')
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('System encryption not available')
  }
  const encrypted = safeStorage.encryptString(key)
  fs.writeFileSync(API_KEY_PATH, encrypted)
  return { success: true }
})

ipcMain.handle('apiKey:retrieve', async () => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('System encryption not available')
  }
  if (!fs.existsSync(API_KEY_PATH)) {
    return { key: null }
  }
  const encrypted = fs.readFileSync(API_KEY_PATH)
  const key = safeStorage.decryptString(encrypted)
  return { key }
})

ipcMain.handle('apiKey:delete', async () => {
  if (fs.existsSync(API_KEY_PATH)) {
    fs.unlinkSync(API_KEY_PATH)
  }
  return { success: true }
})

// ─── AI chat (streamed via main process — key never touches renderer) ────────

function getApiKey(): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('System encryption not available')
  }
  if (!fs.existsSync(API_KEY_PATH)) {
    throw new Error('No API key configured')
  }
  const encrypted = fs.readFileSync(API_KEY_PATH)
  return safeStorage.decryptString(encrypted)
}

const VALID_MODELS = new Set([
  'claude-sonnet-4-20250514',
  'claude-opus-4-20250514',
  'claude-haiku-4-5-20251001',
])

ipcMain.handle('ai:chat', async (event, args) => {
  const requestId = args?.requestId
  const messages = args?.messages
  const model = args?.model
  if (typeof requestId !== 'string' || !Array.isArray(messages)) {
    throw new Error('Invalid chat request')
  }
  const selectedModel = (typeof model === 'string' && VALID_MODELS.has(model))
    ? model
    : 'claude-sonnet-4-20250514'

  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) throw new Error('No window available')

  console.log('[nimbus:ai] Chat request', { requestId: requestId.slice(0, 8), model: selectedModel, messageCount: messages.length })

  try {
    const apiKey = getApiKey()
    console.log('[nimbus:ai] API key retrieved, length:', apiKey.length)

    const client = new Anthropic({ apiKey })

    console.log('[nimbus:ai] Starting stream...')
    const stream = client.messages.stream({
      model: selectedModel,
      max_tokens: 4096,
      system: 'You are Nimbus AI, a helpful assistant embedded in a terminal app. Keep responses concise and terminal-focused. When suggesting commands, format them as code blocks. You can see the user\'s terminal context when provided.',
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    })

    let tokenCount = 0
    stream.on('text', (text) => {
      tokenCount++
      if (tokenCount === 1) console.log('[nimbus:ai] First token received')
      win.webContents.send(`ai:token:${requestId}`, text)
    })

    stream.on('error', (err) => {
      console.error('[nimbus:ai] Stream error:', err.message)
    })

    const timeoutMs = 120_000
    const result = await Promise.race([
      stream.finalMessage(),
      new Promise((_, reject) =>
        setTimeout(() => { stream.abort(); reject(new Error('Request timed out after 2 minutes')) }, timeoutMs)
      ),
    ])

    console.log('[nimbus:ai] Complete, tokens:', tokenCount)
    win.webContents.send(`ai:done:${requestId}`)
    return { success: true, usage: (result as { usage?: unknown })?.usage }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[nimbus:ai] Error:', message)
    win.webContents.send(`ai:error:${requestId}`, message)
    return { success: false, error: message }
  }
})

// Quick connectivity test — non-streaming, tiny request
ipcMain.handle('ai:test', async () => {
  try {
    const apiKey = getApiKey()
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'hi' }],
    })
    return { success: true, model: msg.model }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
})

// ─── Window management ──────────────────────────────────────────────────────

// Pending init data for new windows — keyed by window webContents id
const pendingWindowData = new Map<number, unknown>()

ipcMain.handle('window:create', (_, args) => {
  const win = createWindow()
  // If init data was provided (e.g. tab or workspace being moved), store it
  // so the new window can retrieve it on load
  if (args?.initData) {
    pendingWindowData.set(win.webContents.id, args.initData)
  }
  return { success: true }
})

ipcMain.handle('window:getInitData', (event) => {
  const id = event.sender.id
  const data = pendingWindowData.get(id) ?? null
  pendingWindowData.delete(id)
  return data
})

ipcMain.handle('window:isFullscreen', (event) => {
  return BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false
})

// ─── Workspace snapshots ─────────────────────────────────────────────────────

ipcMain.handle('workspace:save', async (event, args) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return { success: false }
  const name = typeof args?.name === 'string' ? args.name : 'workspace'
  const data = args?.data
  if (typeof data !== 'string') return { success: false }

  const result = await dialog.showSaveDialog(win, {
    defaultPath: `${name}.nimbus`,
    filters: [{ name: 'Nimbus Workspace', extensions: ['nimbus'] }],
  })
  if (result.canceled || !result.filePath) return { success: false }
  fs.writeFileSync(result.filePath, data, 'utf-8')
  return { success: true, path: result.filePath }
})

// ─── Project root detection ──────────────────────────────────────────────────

const PROJECT_ROOT_MARKERS = [
  '.git', 'package.json', 'go.mod', 'Cargo.toml', 'pyproject.toml',
  'setup.py', 'Makefile', 'pom.xml', 'build.gradle', '.hg', '.svn',
]

ipcMain.handle('project:detectRoot', (_, args) => {
  const cwd = args?.cwd
  if (typeof cwd !== 'string' || !cwd) return { root: null }

  try {
    let dir = path.resolve(cwd)
    const home = os.homedir()
    const root = path.parse(dir).root

    while (dir !== root) {
      for (const marker of PROJECT_ROOT_MARKERS) {
        if (fs.existsSync(path.join(dir, marker))) {
          return { root: dir }
        }
      }
      const parent = path.dirname(dir)
      // Stop at home directory to avoid false positives
      if (parent === home || parent === dir) break
      dir = parent
    }
  } catch { /* ignore */ }

  return { root: null }
})

// ─── History preference (synced with renderer via IPC) ───────────────────────

// Tracks the renderer's current state so the menu checkmark stays in sync.
// Defaults to true; renderer corrects this on load via 'prefs:history-state'.
let historyEnabled = true

ipcMain.on('prefs:history-state', (_, enabled: boolean) => {
  historyEnabled = enabled
  // Update the live menu item's checked property
  const menu = Menu.getApplicationMenu()
  const viewMenu = menu?.items.find(item => item.label === 'View')
  const historyItem = viewMenu?.submenu?.items.find(item => item.id === 'toggle-history')
  if (historyItem) historyItem.checked = enabled
})

// ─── App lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  shellIntegrationDir = setupShellIntegration()
  setupCSP()

  // Set "Nimbus" in the macOS menu bar (overrides "Electron" in dev mode)
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Nimbus',
      submenu: [
        { role: 'about', label: 'About Nimbus' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: 'Hide Nimbus' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit Nimbus' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Save Workspace…',
          accelerator: 'CmdOrCtrl+S',
          click: (_, win) => { win?.webContents.send('menu:save-workspace') },
        },
        {
          label: 'Open Workspace…',
          accelerator: 'CmdOrCtrl+O',
          click: async (_, win) => {
            if (!win) return
            const result = await dialog.showOpenDialog(win, {
              filters: [{ name: 'Nimbus Workspace', extensions: ['nimbus'] }],
              properties: ['openFile'],
            })
            if (result.canceled || !result.filePaths[0]) return
            try {
              const content = fs.readFileSync(result.filePaths[0], 'utf-8')
              win.webContents.send('menu:open-workspace', content)
            } catch {
              // File read failed — ignore silently
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Close Workspace',
          accelerator: 'CmdOrCtrl+Shift+W',
          click: (_, win) => { win?.webContents.send('menu:close-workspace') },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          id: 'toggle-history',
          label: 'Show History',
          type: 'checkbox',
          checked: historyEnabled,
          accelerator: 'CmdOrCtrl+Shift+H',
          click: (menuItem, win) => {
            historyEnabled = menuItem.checked
            win?.webContents.send('menu:toggle-history', menuItem.checked)
          },
        },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isDev ? [
          { type: 'separator' as const },
          { role: 'toggleDevTools' as const },
        ] : []),
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
