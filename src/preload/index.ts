import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('nimbus', {
  pty: {
    create: (opts: { id: string; cols: number; rows: number; cwd?: string }) =>
      ipcRenderer.invoke('pty:create', opts),
    write: (id: string, data: string) =>
      ipcRenderer.invoke('pty:write', { id, data }),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.invoke('pty:resize', { id, cols, rows }),
    kill: (id: string) =>
      ipcRenderer.invoke('pty:kill', { id }),
    onData: (id: string, cb: (data: string) => void) => {
      const handler = (_: unknown, data: string) => cb(data)
      ipcRenderer.on(`pty:data:${id}`, handler)
      return () => { ipcRenderer.removeListener(`pty:data:${id}`, handler) }
    },
    onExit: (id: string, cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on(`pty:exit:${id}`, handler)
      return () => { ipcRenderer.removeListener(`pty:exit:${id}`, handler) }
    },
  },
  apiKey: {
    store: (key: string) => ipcRenderer.invoke('apiKey:store', { key }),
    retrieve: () => ipcRenderer.invoke('apiKey:retrieve') as Promise<{ key: string | null }>,
    delete: () => ipcRenderer.invoke('apiKey:delete'),
  },
  window: {
    create: (initData?: unknown) => ipcRenderer.invoke('window:create', { initData }) as Promise<{ success: boolean }>,
    getInitData: () => ipcRenderer.invoke('window:getInitData') as Promise<unknown>,
  },
  workspace: {
    save: (name: string, data: string) =>
      ipcRenderer.invoke('workspace:save', { name, data }) as Promise<{ success: boolean; path?: string }>,
    onSaveRequest: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on('menu:save-workspace', handler)
      return () => { ipcRenderer.removeListener('menu:save-workspace', handler) }
    },
    onOpenRequest: (cb: (data: string) => void) => {
      const handler = (_: unknown, data: string) => cb(data)
      ipcRenderer.on('menu:open-workspace', handler)
      return () => { ipcRenderer.removeListener('menu:open-workspace', handler) }
    },
    onCloseRequest: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on('menu:close-workspace', handler)
      return () => { ipcRenderer.removeListener('menu:close-workspace', handler) }
    },
  },
  ai: {
    chat: (messages: { role: string; content: string }[], requestId: string, model?: string) =>
      ipcRenderer.invoke('ai:chat', { messages, requestId, model }),
    test: () => ipcRenderer.invoke('ai:test') as Promise<{ success: boolean; model?: string; error?: string }>,
    onToken: (requestId: string, cb: (token: string) => void) => {
      ipcRenderer.on(`ai:token:${requestId}`, (_, token) => cb(token))
      return () => ipcRenderer.removeAllListeners(`ai:token:${requestId}`)
    },
    onDone: (requestId: string, cb: () => void) => {
      ipcRenderer.on(`ai:done:${requestId}`, () => cb())
      return () => ipcRenderer.removeAllListeners(`ai:done:${requestId}`)
    },
    onError: (requestId: string, cb: (error: string) => void) => {
      ipcRenderer.on(`ai:error:${requestId}`, (_, error) => cb(error))
      return () => ipcRenderer.removeAllListeners(`ai:error:${requestId}`)
    },
  },
})
