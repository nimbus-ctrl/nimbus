import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('nimbus', {
  pty: {
    create: (opts: { id: string; cols: number; rows: number }) =>
      ipcRenderer.invoke('pty:create', opts),
    write: (id: string, data: string) =>
      ipcRenderer.invoke('pty:write', { id, data }),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.invoke('pty:resize', { id, cols, rows }),
    kill: (id: string) =>
      ipcRenderer.invoke('pty:kill', { id }),
    onData: (id: string, cb: (data: string) => void) => {
      ipcRenderer.on(`pty:data:${id}`, (_, data) => cb(data))
      return () => ipcRenderer.removeAllListeners(`pty:data:${id}`)
    },
    onExit: (id: string, cb: () => void) => {
      ipcRenderer.on(`pty:exit:${id}`, () => cb())
      return () => ipcRenderer.removeAllListeners(`pty:exit:${id}`)
    },
  },
})
