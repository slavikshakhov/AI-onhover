import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("assistant", {
  setSessionContext: (context: string) =>
    ipcRenderer.invoke("session:set", context),
  transcribeContext: (clip: unknown) =>
    ipcRenderer.invoke("session:transcribe", clip),
  details: (version: string, path: number[]) =>
    ipcRenderer.invoke("details", version, path),
  code: (version: string, path: number[], budget: unknown) =>
    ipcRenderer.invoke("code", version, path, budget),
  capture: () => ipcRenderer.invoke("screenshot:capture"),
  removeScreenshot: () => ipcRenderer.invoke("screenshot:remove"),
  analyzeScreenshot: (id: string, budget: unknown) =>
    ipcRenderer.invoke("screenshot:analyze", id, budget),
  askScreenshot: (id: string, r: unknown) =>
    ipcRenderer.invoke("screenshot:ask", id, r),
  shortenScreenshot: (shotId: string, id: string, budget: unknown) =>
    ipcRenderer.invoke("screenshot:shorten", shotId, id, budget),
  config: () => ipcRenderer.invoke("config"),
  ask: (r: unknown) => ipcRenderer.invoke("ask", r),
  shorten: (id: string, budget: unknown) =>
    ipcRenderer.invoke("shorten", id, budget),
  reset: () => ipcRenderer.invoke("reset"),
  pin: (value: boolean) => ipcRenderer.invoke("pin", value),
  microphone: () => ipcRenderer.invoke("microphone"),
  onBlur: (fn: () => void) => {
    const listener = () => fn();
    ipcRenderer.on("window-blur", listener);
    return () => ipcRenderer.removeListener("window-blur", listener);
  },
});
