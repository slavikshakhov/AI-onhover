import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("region", {
  frame: () => ipcRenderer.invoke("capture:frame"),
  select: (rect: unknown, demoImage?: string) =>
    ipcRenderer.invoke("capture:select", rect, demoImage),
  failed: () => ipcRenderer.invoke("capture:failed"),
  cancel: () => ipcRenderer.invoke("capture:cancel"),
});
