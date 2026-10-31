// Flop Client: the main process. Opens the window and connects the interface to the backend.
const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("path");
const { P, readJSON, writeJSON } = require("./backend/util");
const instances = require("./backend/instances");
const modrinth = require("./backend/modrinth");
const java = require("./backend/java");
const launcher = require("./backend/launch");
const mrpack = require("./backend/mrpack");
const msAuth = require("./backend/auth-microsoft");
const emailAuth = require("./backend/auth-email");

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 900, minHeight: 600,
    backgroundColor: "#08120f", title: "Flop Client", autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, "ui", "index.html"));
  // Links in the interface open in the normal browser, never inside the launcher.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e) => e.preventDefault());
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

const send = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); };
const task = (text) => send("task", { text });

// Every handler returns { ok, data } or { ok:false, error } so the interface can show friendly messages.
function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try { return { ok: true, data: await fn(...args) }; }
    catch (err) { console.error(channel, err); return { ok: false, error: err.message || String(err) }; }
  });
}
const pub = (inst) => ({ ...inst, running: launcher.isRunning(inst.id) });
const itemKey = (c) => `${c.type}/${c.fileName}`;
const findItem = (inst, key) => { const c = inst.content.find((x) => itemKey(x) === key); if (!c) throw new Error("That item isn't installed anymore."); return c; };
const updateCache = {};

/* accounts */
handle("state", async () => ({
  version: app.getVersion(),
  emailEnabled: emailAuth.enabled(), flop: emailAuth.account(),
  msEnabled: msAuth.enabled(), ms: msAuth.account(),
}));
handle("email:send", (email) => emailAuth.sendCode(String(email).trim().toLowerCase()));
handle("email:verify", (email, code) => emailAuth.verify(String(email).trim().toLowerCase(), String(code).trim()));
handle("email:signout", () => emailAuth.signOut());
handle("ms:start", () => msAuth.startDeviceCode());
handle("ms:wait", () => msAuth.waitForDeviceCode());
handle("ms:cancel", () => msAuth.cancel());
handle("ms:signout", () => msAuth.signOut());

/* instances */
handle("versions", () => java.releases());
handle("inst:list", async () => (await instances.list()).map(pub));
handle("inst:get", async (id) => pub(await instances.get(id)));
handle("inst:create", async (o) => pub(await instances.create(o)));
handle("inst:update", async (id, patch) => pub(await instances.update(id, patch)));
handle("inst:remove", (id) => { if (launcher.isRunning(id)) throw new Error("Close the game before deleting this instance."); return instances.remove(id); });
handle("inst:duplicate", async (id) => pub(await instances.duplicate(id)));
handle("inst:worlds", (id) => instances.worlds(id));
handle("inst:log", (id) => instances.readLog(id));
handle("inst:open", async (id, sub = "") => { const p = path.join(P.instance(id), sub); await require("fs").promises.mkdir(p, { recursive: true }); return shell.openPath(p); });

/* content */
handle("content:toggle", async (id, key, enabled) => { const inst = await instances.get(id); await modrinth.setEnabled(inst, findItem(inst, key), enabled); return pub(await instances.save(inst)); });
handle("content:remove", async (id, key) => { const inst = await instances.get(id); await modrinth.remove(inst, findItem(inst, key)); return pub(await instances.save(inst)); });
handle("content:checkUpdates", async (id) => {
  const inst = await instances.get(id);
  updateCache[id] = await modrinth.checkUpdates(inst);
  return Object.keys(updateCache[id]);
});
handle("content:update", async (id, sha1s) => {
  const inst = await instances.get(id);
  const cache = updateCache[id] || {};
  let n = 0;
  for (const sha1 of sha1s) {
    const item = inst.content.find((c) => c.sha1 === sha1);
    if (!item || !cache[sha1]) continue;
    task(`Updating ${item.title}…`);
    await modrinth.applyUpdate(inst, item, cache[sha1]);
    delete cache[sha1];
    n++;
  }
  await instances.save(inst);
  return { updated: n, instance: pub(inst) };
});

/* Modrinth */
handle("mr:search", (params) => modrinth.search(params));
handle("mr:install", async (id, idOrSlugs) => {
  const inst = await instances.get(id);
  const added = [];
  try {
    for (const s of [].concat(idOrSlugs)) added.push(...(await modrinth.install(inst, s, task)));
  } finally { await instances.save(inst); }
  return { added, instance: pub(inst) };
});

/* modpacks */
handle("pack:import", async () => {
  const r = await dialog.showOpenDialog(win, { title: "Import a Modrinth modpack", filters: [{ name: "Modrinth modpack", extensions: ["mrpack"] }], properties: ["openFile"] });
  if (r.canceled || !r.filePaths[0]) return null;
  return pub(await mrpack.importPack(r.filePaths[0], task));
});
handle("pack:export", async (id) => {
  const inst = await instances.get(id);
  const r = await dialog.showSaveDialog(win, { title: "Export as .mrpack", defaultPath: `${inst.name}.mrpack`, filters: [{ name: "Modrinth modpack", extensions: ["mrpack"] }] });
  if (r.canceled || !r.filePath) return null;
  await mrpack.exportPack(id, r.filePath);
  return r.filePath;
});

/* launching */
handle("launch", (id) => launcher.launch(id, (ev) => send("launch-event", { id, ...ev })).catch((err) => { send("launch-event", { id, type: "error", error: err.message }); throw err; }));
handle("stop", (id) => launcher.stop(id));

/* settings */
handle("settings:get", () => readJSON(P.settings(), { memory: 4, javaPath: "" }));
handle("settings:set", async (s) => { const cur = await readJSON(P.settings(), {}); const next = { ...cur, ...s }; await writeJSON(P.settings(), next); return next; });
handle("settings:pickJava", async () => {
  const r = await dialog.showOpenDialog(win, { title: "Choose a java or javaw program", properties: ["openFile"] });
  return r.canceled ? null : r.filePaths[0];
});
handle("open:data", () => shell.openPath(P.root()));
handle("open:url", (url) => { if (/^https:\/\/(www\.)?(microsoft\.com|login\.live\.com|modrinth\.com|adoptium\.net)\//.test(url)) return shell.openExternal(url); throw new Error("That link isn't allowed."); });
