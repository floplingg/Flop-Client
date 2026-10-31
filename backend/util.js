// Small shared helpers: paths, JSON files, secrets, downloads, config.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { app, safeStorage } = require("electron");

const P = {
  root: () => app.getPath("userData"),
  shared: () => path.join(app.getPath("userData"), "shared"),
  instances: () => path.join(app.getPath("userData"), "instances"),
  instance: (id) => path.join(app.getPath("userData"), "instances", id),
  runtimes: () => path.join(app.getPath("userData"), "runtimes"),
  settings: () => path.join(app.getPath("userData"), "settings.json"),
  secret: (name) => path.join(app.getPath("userData"), "secrets", name + ".bin"),
};

async function readJSON(file, fallback) {
  try { return JSON.parse(await fs.promises.readFile(file, "utf8")); } catch { return fallback; }
}
async function writeJSON(file, data) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.promises.rename(tmp, file);
}

// Tokens are encrypted with the operating system's keychain when it is available.
function saveSecret(name, obj) {
  const file = P.secret(name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const text = JSON.stringify(obj);
  const buf = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text, "utf8");
  fs.writeFileSync(file, buf);
}
function loadSecret(name) {
  try {
    const buf = fs.readFileSync(P.secret(name));
    const text = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString("utf8");
    return JSON.parse(text);
  } catch { return null; }
}
function deleteSecret(name) { try { fs.unlinkSync(P.secret(name)); } catch {} }

let _config;
function config() {
  if (!_config) {
    try { _config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config.json"), "utf8")); }
    catch { _config = {}; }
  }
  return _config;
}
const UA = () => `flop-client/${require("../package.json").version} (${config().contactEmail || "contact-not-set"})`;

async function getJSON(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { "User-Agent": UA(), ...(opts.headers || {}) } });
  if (!r.ok) {
    const err = new Error(`Request to ${new URL(url).host} failed (${r.status})`);
    err.status = r.status;
    try { err.body = await r.json(); } catch {}
    throw err;
  }
  return r.json();
}

// Download a file, check its SHA-1 when we know it, then move it into place.
async function download(url, dest, sha1) {
  const r = await fetch(url, { headers: { "User-Agent": UA() } });
  if (!r.ok) throw new Error(`Download failed (${r.status}) for ${path.basename(dest)}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (sha1) {
    const got = crypto.createHash("sha1").update(buf).digest("hex");
    if (got !== sha1) throw new Error(`${path.basename(dest)} was damaged while downloading. Try again.`);
  }
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  await fs.promises.writeFile(dest + ".part", buf);
  await fs.promises.rename(dest + ".part", dest);
  return buf.length;
}

// Refuse paths like "../../something" coming from modpack files.
function safeJoin(base, rel) {
  const full = path.resolve(base, rel);
  if (!full.startsWith(path.resolve(base) + path.sep)) throw new Error(`Unsafe file path in pack: ${rel}`);
  return full;
}

module.exports = { P, readJSON, writeJSON, saveSecret, loadSecret, deleteSecret, config, UA, getJSON, download, safeJoin };
