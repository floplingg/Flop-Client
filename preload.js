// The only bridge between the interface and the backend. The page can call these and nothing else.
const { contextBridge, ipcRenderer } = require("electron");

async function call(channel, ...args) {
  const r = await ipcRenderer.invoke(channel, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

contextBridge.exposeInMainWorld("flop", {
  call,
  onLaunch: (fn) => ipcRenderer.on("launch-event", (_e, d) => fn(d)),
  onTask: (fn) => ipcRenderer.on("task", (_e, d) => fn(d)),
});
