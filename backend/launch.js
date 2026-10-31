// Gets everything ready and starts Minecraft for one instance.
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { Client } = require("minecraft-launcher-core");
const { P, getJSON, readJSON } = require("./util");
const instances = require("./instances");
const java = require("./java");
const msAuth = require("./auth-microsoft");

const LOADER_META = {
  fabric: "https://meta.fabricmc.net/v2/versions/loader",
  quilt: "https://meta.quiltmc.org/v3/versions/loader",
};
const running = new Map(); // instanceId -> child process

// Installs the Fabric or Quilt profile so the launcher library can use it.
async function ensureLoader(inst, step) {
  if (inst.loader === "vanilla") return null;
  const base = LOADER_META[inst.loader];
  if (!base) throw new Error(`${inst.loader} isn't supported yet. Use Fabric, Quilt or Vanilla.`);
  if (!inst.loaderVersion) {
    step(`Finding the newest ${inst.loader} loader for ${inst.gameVersion}…`);
    const list = await getJSON(`${base}/${inst.gameVersion}`);
    if (!list.length) throw new Error(`${inst.loader} doesn't support Minecraft ${inst.gameVersion} yet.`);
    const pick = list.find((x) => x.loader.stable !== false && !/beta|alpha|pre/i.test(x.loader.version)) || list[0];
    inst.loaderVersion = pick.loader.version;
    await instances.save(inst);
  }
  const profile = await getJSON(`${base}/${inst.gameVersion}/${inst.loaderVersion}/profile/json`);
  const file = path.join(P.shared(), "versions", profile.id, `${profile.id}.json`);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, JSON.stringify(profile, null, 2));
  return profile.id;
}

function runHook(cmd, cwd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd, timeout: 120000 }, (err, stdout, stderr) => (err ? reject(new Error(`Pre-launch command failed: ${stderr || err.message}`)) : resolve(stdout)));
  });
}

// emit({ type: "step"|"progress"|"log"|"started"|"closed"|"error", ... })
async function launch(id, emit) {
  if (running.has(id)) throw new Error("This instance is already running.");
  const inst = await instances.get(id);
  const settings = await readJSON(P.settings(), {});
  const step = (text) => emit({ type: "step", text });

  step("Checking your Microsoft sign-in…");
  const authorization = await msAuth.launchAuth();

  let javaPath = settings.javaPath;
  if (!javaPath) {
    step("Checking Java…");
    const major = await java.requiredJava(inst.gameVersion);
    javaPath = await java.ensureJava(major, step);
  }

  const custom = await ensureLoader(inst, step);
  if (inst.hook) { step(`Running pre-launch command…`); await runHook(inst.hook, inst.dir); }

  const mem = inst.memory || settings.memory || 4;
  const client = new Client();
  client.on("progress", (e) => emit({ type: "progress", task: e.type, done: e.task, total: e.total }));
  client.on("data", (line) => emit({ type: "log", line: String(line) }));
  client.on("debug", (line) => emit({ type: "log", line: String(line), debug: true }));

  step(`Downloading Minecraft ${inst.gameVersion} files (first launch takes a while)…`);
  const proc = await client.launch({
    root: P.shared(),
    version: { number: inst.gameVersion, type: "release", ...(custom ? { custom } : {}) },
    memory: { max: `${mem}G`, min: "1G" },
    authorization,
    javaPath,
    overrides: { gameDirectory: inst.dir },
    window: inst.window?.fullscreen ? { fullscreen: true } : { width: inst.window?.width || 1280, height: inst.window?.height || 720 },
  });
  if (!proc) throw new Error("Minecraft didn't start. Open the Logs tab for details.");

  running.set(id, proc);
  const started = Date.now();
  inst.lastPlayed = started;
  await instances.save(inst);
  emit({ type: "started" });

  proc.on("close", async (code) => {
    running.delete(id);
    try {
      const fresh = await instances.get(id);
      fresh.playMinutes = (fresh.playMinutes || 0) + Math.round((Date.now() - started) / 60000);
      await instances.save(fresh);
    } catch {}
    emit({ type: "closed", code });
  });
}

function stop(id) { const p = running.get(id); if (p) p.kill(); }
const isRunning = (id) => running.has(id);

module.exports = { launch, stop, isRunning };
