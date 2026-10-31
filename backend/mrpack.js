// Import and export Modrinth modpacks (.mrpack files).
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const { download, safeJoin } = require("./util");
const instances = require("./instances");
const modrinth = require("./modrinth");

const TYPE_BY_FOLDER = { mods: "mod", resourcepacks: "resourcepack", shaderpacks: "shader" };

async function importPack(file, step = () => {}) {
  const zip = new AdmZip(file);
  const entry = zip.getEntry("modrinth.index.json");
  if (!entry) throw new Error("This file isn't a Modrinth modpack (no modrinth.index.json inside).");
  const index = JSON.parse(entry.getData().toString("utf8"));
  const deps = index.dependencies || {};
  if (deps.forge || deps.neoforge) throw new Error("Forge and NeoForge packs aren't supported yet. Fabric and Quilt packs work.");
  const loader = deps["fabric-loader"] ? "fabric" : deps["quilt-loader"] ? "quilt" : "vanilla";

  const inst = await instances.create({ name: index.name || path.basename(file, ".mrpack"), gameVersion: deps.minecraft, loader });
  inst.loaderVersion = deps["fabric-loader"] || deps["quilt-loader"] || null;

  const files = (index.files || []).filter((f) => f.env?.client !== "unsupported");
  let n = 0;
  for (const f of files) {
    n++;
    step(`Downloading ${n} of ${files.length}: ${path.basename(f.path)}`);
    await download(f.downloads[0], safeJoin(inst.dir, f.path), f.hashes.sha1);
  }

  step("Copying pack settings…");
  for (const prefix of ["overrides/", "client-overrides/"]) {
    for (const e of zip.getEntries()) {
      if (e.isDirectory || !e.entryName.startsWith(prefix)) continue;
      const dest = safeJoin(inst.dir, e.entryName.slice(prefix.length));
      await fs.promises.mkdir(path.dirname(dest), { recursive: true });
      await fs.promises.writeFile(dest, e.getData());
    }
  }

  step("Looking up names and icons on Modrinth…");
  const known = await modrinth.identify(files.map((f) => f.hashes.sha1)).catch(() => ({}));
  for (const f of files) {
    const folder = f.path.split("/")[0];
    const type = TYPE_BY_FOLDER[folder];
    if (!type) continue;
    const k = known[f.hashes.sha1];
    inst.content.push({
      projectId: k?.project?.id || null, versionId: k?.version?.id || null, slug: k?.project?.slug || "",
      title: k?.project?.title || path.basename(f.path).replace(/\.(jar|zip)$/i, ""), type,
      iconUrl: k?.project?.icon_url || "", fileName: path.basename(f.path), url: f.downloads[0],
      sha1: f.hashes.sha1, sha512: f.hashes.sha512, size: f.fileSize, enabled: true, versionName: k?.version?.version_number || "",
    });
  }
  await instances.save(inst);
  return inst;
}

async function exportPack(id, outFile) {
  const inst = await instances.get(id);
  const loaderKey = { fabric: "fabric-loader", quilt: "quilt-loader" }[inst.loader];
  const index = {
    formatVersion: 1, game: "minecraft", versionId: "1.0.0", name: inst.name,
    files: inst.content.filter((c) => c.enabled && c.url).map((c) => ({
      path: `${modrinth.FOLDER[c.type]}/${c.fileName}`,
      hashes: { sha1: c.sha1, sha512: c.sha512 },
      env: { client: "required", server: c.type === "mod" ? "optional" : "unsupported" },
      downloads: [c.url], fileSize: c.size,
    })),
    dependencies: { minecraft: inst.gameVersion, ...(loaderKey && inst.loaderVersion ? { [loaderKey]: inst.loaderVersion } : {}) },
  };
  const zip = new AdmZip();
  zip.addFile("modrinth.index.json", Buffer.from(JSON.stringify(index, null, 2)));
  for (const f of ["options.txt", "config"]) {
    const p = path.join(inst.dir, f);
    if (!fs.existsSync(p)) continue;
    if (fs.statSync(p).isDirectory()) zip.addLocalFolder(p, `overrides/${f}`);
    else zip.addLocalFile(p, "overrides");
  }
  zip.writeZip(outFile);
}

module.exports = { importPack, exportPack };
