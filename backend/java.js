// Finds out which Java a Minecraft version needs and downloads it from Adoptium (Eclipse Temurin).
const fs = require("fs");
const path = require("path");
const os = require("os");
const { P, getJSON, UA } = require("./util");

let manifestCache = null;
async function versionManifest() {
  if (!manifestCache) manifestCache = await getJSON("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json");
  return manifestCache;
}

async function releases() {
  const m = await versionManifest();
  return m.versions.filter((v) => v.type === "release").map((v) => v.id);
}

async function requiredJava(gameVersion) {
  const m = await versionManifest();
  const v = m.versions.find((x) => x.id === gameVersion);
  if (!v) throw new Error(`Minecraft ${gameVersion} isn't in Mojang's version list.`);
  const json = await getJSON(v.url);
  return json.javaVersion?.majorVersion || 8;
}

function findJavaBinary(dir, depth = 0) {
  if (depth > 6 || !fs.existsSync(dir)) return null;
  const exe = process.platform === "win32" ? "javaw.exe" : "java";
  const direct = path.join(dir, "bin", exe);
  if (fs.existsSync(direct)) return direct;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      const hit = findJavaBinary(path.join(dir, e.name), depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

async function ensureJava(major, onStep = () => {}) {
  const dir = path.join(P.runtimes(), `java-${major}`);
  const have = findJavaBinary(dir);
  if (have) return have;

  const osName = { win32: "windows", darwin: "mac", linux: "linux" }[process.platform];
  if (!osName) throw new Error("This operating system isn't supported for automatic Java downloads.");
  const arch = os.arch() === "arm64" ? "aarch64" : "x64";
  const tries = [];
  for (const a of arch === "aarch64" ? ["aarch64", "x64"] : ["x64"]) for (const kind of ["jre", "jdk"]) tries.push([a, kind]);

  let res = null;
  for (const [a, kind] of tries) {
    const url = `https://api.adoptium.net/v3/binary/latest/${major}/ga/${osName}/${a}/${kind}/hotspot/normal/eclipse`;
    const r = await fetch(url, { headers: { "User-Agent": UA() } });
    if (r.ok) { res = r; break; }
  }
  if (!res) throw new Error(`Couldn't download Java ${major}. Install it from adoptium.net and set its path in Flop's Settings.`);

  onStep(`Downloading Java ${major} (one time only)…`);
  await fs.promises.mkdir(dir, { recursive: true });
  const archive = path.join(dir, osName === "windows" ? "java.zip" : "java.tar.gz");
  await fs.promises.writeFile(archive, Buffer.from(await res.arrayBuffer()));

  onStep(`Unpacking Java ${major}…`);
  if (osName === "windows") await require("extract-zip")(archive, { dir: path.resolve(dir) });
  else await require("tar").x({ file: archive, cwd: dir });
  await fs.promises.unlink(archive);

  const bin = findJavaBinary(dir);
  if (!bin) throw new Error(`Java ${major} downloaded but couldn't be found inside the archive.`);
  if (process.platform !== "win32") await fs.promises.chmod(bin, 0o755);
  return bin;
}

module.exports = { releases, requiredJava, ensureJava, versionManifest };
