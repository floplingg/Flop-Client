// Instances: each one is a folder with instance.json plus its own mods, worlds and settings.
const fs = require("fs");
const path = require("path");
const { P, readJSON, writeJSON } = require("./util");

const COLORS = ["#46b37a", "#f0c869", "#e0485c", "#9fd8ff", "#b58cff", "#ff9f5a", "#5fd3c4", "#dcc29a"];

function withDir(inst) { return Object.defineProperty(inst, "dir", { value: P.instance(inst.id), enumerable: false }); }

async function list() {
  await fs.promises.mkdir(P.instances(), { recursive: true });
  const ids = await fs.promises.readdir(P.instances());
  const out = [];
  for (const id of ids) {
    const inst = await readJSON(path.join(P.instance(id), "instance.json"), null);
    if (inst) out.push(withDir(inst));
  }
  return out.sort((a, b) => (b.lastPlayed || b.created) - (a.lastPlayed || a.created));
}

async function get(id) {
  const inst = await readJSON(path.join(P.instance(id), "instance.json"), null);
  if (!inst) throw new Error("That instance doesn't exist anymore.");
  return withDir(inst);
}

async function save(inst) { await writeJSON(path.join(inst.dir, "instance.json"), inst); return inst; }

function slug(name) { return (name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "instance").slice(0, 24); }

async function create({ name, gameVersion, loader = "fabric", color }) {
  const all = await list();
  const id = `${slug(name)}-${Date.now().toString(36)}`;
  const inst = withDir({
    id, name: (name || "New instance").slice(0, 40), gameVersion, loader, loaderVersion: null,
    color: color || COLORS[all.length % COLORS.length], created: Date.now(), lastPlayed: null, playMinutes: 0,
    memory: null, window: { width: 1280, height: 720, fullscreen: false }, hook: "", content: [],
  });
  for (const sub of ["mods", "resourcepacks", "shaderpacks", "saves"]) await fs.promises.mkdir(path.join(inst.dir, sub), { recursive: true });
  return save(inst);
}

async function update(id, patch) {
  const inst = await get(id);
  const allowed = ["name", "color", "gameVersion", "loader", "memory", "window", "hook"];
  for (const k of allowed) if (k in patch) inst[k] = patch[k];
  if ("gameVersion" in patch || "loader" in patch) inst.loaderVersion = null; // pick a matching loader next launch
  return save(inst);
}

async function remove(id) { await fs.promises.rm(P.instance(id), { recursive: true, force: true }); }

async function duplicate(id) {
  const src = await get(id);
  const copy = await create({ name: `${src.name} (copy)`, gameVersion: src.gameVersion, loader: src.loader, color: src.color });
  await fs.promises.cp(src.dir, copy.dir, { recursive: true, force: true, filter: (p) => !p.endsWith("instance.json") });
  Object.assign(copy, { content: src.content, memory: src.memory, window: src.window, hook: src.hook, loaderVersion: src.loaderVersion });
  return save(copy);
}

async function worlds(id) {
  const dir = path.join(P.instance(id), "saves");
  try {
    const names = await fs.promises.readdir(dir);
    const out = [];
    for (const n of names) {
      const st = await fs.promises.stat(path.join(dir, n));
      if (st.isDirectory()) out.push({ name: n, modified: st.mtimeMs });
    }
    return out.sort((a, b) => b.modified - a.modified);
  } catch { return []; }
}

async function readLog(id) {
  const f = path.join(P.instance(id), "logs", "latest.log");
  try {
    const st = await fs.promises.stat(f);
    const fh = await fs.promises.open(f, "r");
    const len = Math.min(st.size, 200_000);
    const buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, st.size - len);
    await fh.close();
    return buf.toString("utf8");
  } catch { return ""; }
}

module.exports = { list, get, save, create, update, remove, duplicate, worlds, readLog, COLORS };
