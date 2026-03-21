import { app, BrowserWindow, ipcMain, shell } from 'electron'
import * as path from 'path'
import * as pty from 'node-pty'
import * as os from 'os'

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

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
    },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    trafficLightPosition: { x: 16, y: 16 },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}

// PTY management
const ptyProcesses = new Map<string, pty.IPty>()

ipcMain.handle('pty:create', (_, { id, cols, rows }) => {
  const shell = os.platform() === 'win32' ? 'powershell.exe' : (process.env.SHELL || 'zsh')
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: cols || 80,
    rows: rows || 24,
    cwd: os.homedir(),
    env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' } as Record<string, string>,
  })

  ptyProcesses.set(id, ptyProcess)

  ptyProcess.onData((data) => {
    const win = BrowserWindow.getAllWindows()[0]
    win?.webContents.send(`pty:data:${id}`, data)
  })

  ptyProcess.onExit(() => {
    ptyProcesses.delete(id)
    const win = BrowserWindow.getAllWindows()[0]
    win?.webContents.send(`pty:exit:${id}`)
  })

  return { success: true }
})

ipcMain.handle('pty:write', (_, { id, data }) => {
  ptyProcesses.get(id)?.write(data)
})

ipcMain.handle('pty:resize', (_, { id, cols, rows }) => {
  ptyProcesses.get(id)?.resize(cols, rows)
})

ipcMain.handle('pty:kill', (_, { id }) => {
  ptyProcesses.get(id)?.kill()
  ptyProcesses.delete(id)
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
