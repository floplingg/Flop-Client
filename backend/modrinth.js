// Modrinth API v2: search, versions, installs with dependencies, updates.
const fs = require("fs");
const path = require("path");
const { getJSON, download, UA } = require("./util");

const API = "https://api.modrinth.com/v2";
const FOLDER = { mod: "mods", resourcepack: "resourcepacks", shader: "shaderpacks" };

async function api(p, opts = {}) {
  try {
    return await getJSON(API + p, {
      ...opts,
      headers: opts.body ? { "Content-Type": "application/json" } : {},
    });
  } catch (e) {
    if (e.status === 429) throw new Error("Modrinth is busy. Wait a minute and try again.");
    if (e.status === 404) throw new Error("That project wasn't found on Modrinth.");
    throw e;
  }
}

// Quilt runs most Fabric mods, so we search and install both.
const modLoaders = (loader) => (loader === "quilt" ? ["quilt", "fabric"] : [loader]);

function search({ query = "", type = "mod", gameVersion, loader, offset = 0 }) {
  const facets = [[`project_type:${type}`]];
  if (gameVersion) facets.push([`versions:${gameVersion}`]);
  if (type === "mod" && loader && loader !== "vanilla") facets.push(modLoaders(loader).map((l) => `categories:${l}`));
  const qs = new URLSearchParams({
    query, facets: JSON.stringify(facets), limit: "20", offset: String(offset),
    index: query ? "relevance" : "downloads",
  });
  return api(`/search?${qs}`);
}

const project = (id) => api(`/project/${encodeURIComponent(id)}`);

function versionsFor(projectId, type, inst) {
  const qs = new URLSearchParams({ game_versions: JSON.stringify([inst.gameVersion]) });
  if (type === "mod") qs.set("loaders", JSON.stringify(modLoaders(inst.loader)));
  if (type === "resourcepack") qs.set("loaders", JSON.stringify(["minecraft"]));
  return api(`/project/${encodeURIComponent(projectId)}/version?${qs}`);
}

function canHold(inst, type) {
  if (type === "resourcepack") return true;
  return inst.loader !== "vanilla"; // mods and shaders need a mod loader
}

// Install a project plus its required dependencies. Returns names of what was added.
async function install(inst, idOrSlug, onStep = () => {}, seen = new Set()) {
  const proj = await project(idOrSlug);
  const type = proj.project_type;
  if (!FOLDER[type]) throw new Error(`${proj.title} is a ${type}. Flop installs mods, resource packs and shaders.`);
  if (seen.has(proj.id)) return [];
  seen.add(proj.id);
  if (!canHold(inst, type)) throw new Error(`${proj.title} needs Fabric or Quilt. This instance is Vanilla.`);

  const existing = inst.content.find((c) => c.projectId === proj.id);
  if (existing) {
    if (!existing.enabled) { await setEnabled(inst, existing, true); return [`${proj.title} (turned back on)`]; }
    return [];
  }

  const versions = await versionsFor(proj.id, type, inst);
  if (!versions.length) {
    throw new Error(`${proj.title} has no file for Minecraft ${inst.gameVersion}${type === "mod" ? ` on ${inst.loader}` : ""} yet.`);
  }
  const v = versions[0];
  const added = [];

  for (const dep of v.dependencies || []) {
    if (dep.dependency_type === "required" && dep.project_id) {
      added.push(...(await install(inst, dep.project_id, onStep, seen)));
    }
  }
  // Shader packs need Iris to run.
  if (type === "shader") added.push(...(await install(inst, "iris", onStep, seen)));

  const file = v.files.find((f) => f.primary) || v.files[0];
  onStep(`Downloading ${proj.title}…`);
  const dest = path.join(inst.dir, FOLDER[type], file.filename);
  await download(file.url, dest, file.hashes.sha1);

  inst.content.push({
    projectId: proj.id, versionId: v.id, slug: proj.slug, title: proj.title,
    type, iconUrl: proj.icon_url || "",
    fileName: file.filename, url: file.url, sha1: file.hashes.sha1, sha512: file.hashes.sha512,
    size: file.size, enabled: true, versionName: v.version_number,
  });
  added.push(proj.title);
  return added;
}

async function setEnabled(inst, item, enabled) {
  const dir = path.join(inst.dir, FOLDER[item.type]);
  const on = path.join(dir, item.fileName), off = on + ".disabled";
  if (enabled && fs.existsSync(off)) await fs.promises.rename(off, on);
  if (!enabled && fs.existsSync(on)) await fs.promises.rename(on, off);
  item.enabled = enabled;
}

async function remove(inst, item) {
  const base = path.join(inst.dir, FOLDER[item.type], item.fileName);
  for (const f of [base, base + ".disabled"]) { try { await fs.promises.unlink(f); } catch {} }
  inst.content = inst.content.filter((c) => c !== item);
}

// Ask Modrinth which installed files have newer versions. Returns { sha1: newVersion }.
async function checkUpdates(inst) {
  const out = {};
  const groups = { mod: modLoaders(inst.loader), resourcepack: ["minecraft"], shader: ["iris", "optifine"] };
  for (const [type, loaders] of Object.entries(groups)) {
    const items = inst.content.filter((c) => c.type === type && c.sha1);
    if (!items.length || (type !== "resourcepack" && inst.loader === "vanilla")) continue;
    const res = await api("/version_files/update", {
      method: "POST",
      body: JSON.stringify({ hashes: items.map((i) => i.sha1), algorithm: "sha1", loaders, game_versions: [inst.gameVersion] }),
    });
    for (const it of items) {
      const nv = res[it.sha1];
      if (nv && nv.id !== it.versionId) out[it.sha1] = nv;
    }
  }
  return out;
}

async function applyUpdate(inst, item, newVersion) {
  const file = newVersion.files.find((f) => f.primary) || newVersion.files[0];
  const dir = path.join(inst.dir, FOLDER[item.type]);
  await download(file.url, path.join(dir, file.filename + (item.enabled ? "" : ".disabled")), file.hashes.sha1);
  if (file.filename !== item.fileName) {
    for (const f of [item.fileName, item.fileName + ".disabled"]) { try { await fs.promises.unlink(path.join(dir, f)); } catch {} }
  }
  Object.assign(item, {
    versionId: newVersion.id, fileName: file.filename, url: file.url, sha1: file.hashes.sha1,
    sha512: file.hashes.sha512, size: file.size, versionName: newVersion.version_number,
  });
}

// Used by .mrpack import to turn file hashes back into Modrinth projects.
async function identify(sha1s) {
  if (!sha1s.length) return {};
  const versions = await api("/version_files", { method: "POST", body: JSON.stringify({ hashes: sha1s, algorithm: "sha1" }) });
  const ids = [...new Set(Object.values(versions).map((v) => v.project_id))];
  const projects = ids.length ? await api(`/projects?ids=${encodeURIComponent(JSON.stringify(ids))}`) : [];
  const byId = Object.fromEntries(projects.map((p) => [p.id, p]));
  const out = {};
  for (const [sha1, v] of Object.entries(versions)) out[sha1] = { version: v, project: byId[v.project_id] };
  return out;
}

module.exports = { search, install, setEnabled, remove, checkUpdates, applyUpdate, identify, FOLDER, UA };
