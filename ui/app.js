// Flop Client interface. Talks to the backend only through window.flop.call(...).
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const api = (ch, ...a) => window.flop.call(ch, ...a);
const COLORS = ["#46b37a", "#f0c869", "#e0485c", "#9fd8ff", "#b58cff", "#ff9f5a", "#5fd3c4", "#dcc29a"];
const LOADERS = { fabric: "Fabric", quilt: "Quilt", vanilla: "Vanilla" };
const TYPES = { mod: "Mod", resourcepack: "Resource pack", shader: "Shader" };
const TYPE_PL = { all: "All", mod: "Mods", resourcepack: "Resource packs", shader: "Shaders" };

const S = {
  state: null, instances: [], versions: [], settings: { memory: 4, javaPath: "" },
  view: "play", instId: null, itab: "content", stab: "general", ctype: "all", cq: "",
  updates: {}, btype: "mod", bq: "", target: null, results: [], total: 0, installing: new Set(),
  play: { running: false, text: "", pct: 0, log: [] },
};

function toast(t) { const el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 3200); }
async function attempt(fn) { try { return await fn(); } catch (e) { toast(e.message); return undefined; } }
const blockBg = (c) => `background:linear-gradient(135deg,${c},${c}bb),repeating-conic-gradient(rgba(0,0,0,.14) 0 25%,transparent 0 50%) 0 0/10px 10px;background-blend-mode:multiply`;
const hours = (m) => (m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`);
const ago = (t) => { if (!t) return "never"; const m = Math.round((Date.now() - t) / 60000); if (m < 1) return "just now"; if (m < 60) return `${m}m ago`; const h = Math.round(m / 60); if (h < 24) return `${h}h ago`; return `${Math.round(h / 24)}d ago`; };
const inst = (id = S.instId) => S.instances.find((i) => i.id === id);
const icon = (c) => c.iconUrl ? `<div class="mi"><img src="${esc(c.iconUrl)}" alt=""></div>` : `<div class="mi" style="background:${COLORS[(c.title || "?").length % COLORS.length]}">${esc((c.title || "?")[0])}</div>`;
const itemKey = (c) => `${c.type}/${c.fileName}`;

window.flop.onTask(({ text }) => { $("#taskText").textContent = text; $("#taskbar").hidden = false; clearTimeout(S.taskT); S.taskT = setTimeout(() => ($("#taskbar").hidden = true), 2500); });

/* ================= accounts ================= */
async function refreshState() {
  S.state = await api("state");
  const st = S.state;
  $("#ver").textContent = `CLIENT · v${st.version}`;
  $("#accName").textContent = st.ms?.name || st.flop?.email?.split("@")[0] || "Not signed in";
  $("#accSub").textContent = [st.flop?.email, st.ms ? "Minecraft linked" : "Minecraft not linked"].filter(Boolean).join(" · ");
  $("#msBanner").hidden = !!st.ms;
  const needEmail = st.emailEnabled && !st.flop;
  $("#signin").hidden = !needEmail;
  if (needEmail) { emailStep("start"); requestAnimationFrame(() => paintLand($("#signScene"), 0.75)); }
}

let emailAddr = "", cooldown;
function emailStep(step, msg = "") {
  const c = $("#signCard");
  clearInterval(cooldown);
  if (step === "start") {
    c.innerHTML = `<span class="eyebrow">Welcome</span><h2>Sign in</h2>
      <p class="fine" style="font-size:14px">Enter your email and we'll send you a 6-digit code. No password needed.</p>
      <form id="emailForm" class="card" style="gap:10px" novalidate>
        <label class="fine" for="email" style="font-weight:600">Email</label>
        <input id="email" type="email" autocomplete="email" placeholder="you@example.com" value="${esc(emailAddr)}">
        <p class="err" id="emailErr" ${msg ? "" : "hidden"}>${esc(msg)}</p>
        <button class="btn primary" id="sendBtn" style="padding:12px">Email me a code</button>
      </form>`;
    $("#email").focus();
    $("#emailForm").onsubmit = async (e) => {
      e.preventDefault();
      const v = $("#email").value.trim().toLowerCase();
      const err = $("#emailErr");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { err.textContent = "Enter a full email address, like name@gmail.com."; err.hidden = false; return; }
      $("#sendBtn").disabled = true; $("#sendBtn").innerHTML = `<span class="busy"><span class="spinner"></span>Sending…</span>`;
      try { await api("email:send", v); emailAddr = v; emailStep("code"); }
      catch (ex) { err.textContent = ex.message; err.hidden = false; $("#sendBtn").disabled = false; $("#sendBtn").textContent = "Email me a code"; }
    };
  } else {
    c.innerHTML = `<span class="eyebrow">Check your inbox</span><h2>Enter the code</h2>
      <p class="fine" style="font-size:14px">We sent a 6-digit code to <b style="color:var(--fg)">${esc(emailAddr)}</b>. Check spam if it isn't there in a minute.</p>
      <form id="otpForm" class="card" style="gap:12px" novalidate>
        <div class="otp" id="otpBoxes" role="group" aria-label="6-digit code">${Array.from({ length: 6 }, (_, k) => `<input inputmode="numeric" maxlength="1" aria-label="Digit ${k + 1}" ${k === 0 ? 'autocomplete="one-time-code"' : 'autocomplete="off"'}>`).join("")}</div>
        <p class="err" id="otpErr" hidden></p>
        <button class="btn primary" id="verifyBtn" style="padding:12px">Verify and sign in</button>
      </form>
      <div class="row-links"><button class="link" id="resend">Resend code</button><button class="link" id="changeEmail">Use a different email</button></div>`;
    const boxes = [...document.querySelectorAll("#otpBoxes input")];
    const fill = (str) => { const d = str.replace(/\D/g, "").slice(0, 6).split(""); boxes.forEach((b, k) => (b.value = d[k] || "")); boxes[Math.min(d.length, 5)].focus(); if (d.length === 6) verify(); };
    const showErr = (m) => { const er = $("#otpErr"); er.textContent = m; er.hidden = false; };
    let verifying = false;
    async function verify() {
      const code = boxes.map((b) => b.value).join("");
      if (code.length < 6) return showErr("Enter all 6 digits.");
      if (verifying) return; verifying = true;
      $("#verifyBtn").innerHTML = `<span class="busy"><span class="spinner"></span>Checking…</span>`;
      try { await api("email:verify", emailAddr, code); await refreshState(); toast(`Signed in as ${emailAddr}`); }
      catch (ex) { showErr(ex.message); boxes.forEach((b) => (b.value = "")); boxes[0].focus(); $("#verifyBtn").textContent = "Verify and sign in"; }
      verifying = false;
    }
    boxes.forEach((b, k) => {
      b.addEventListener("input", () => { if (b.value.length > 1) return fill(b.value); b.value = b.value.replace(/\D/g, ""); $("#otpErr").hidden = true; if (b.value && k < 5) boxes[k + 1].focus(); if (boxes.every((x) => x.value)) verify(); });
      b.addEventListener("keydown", (e) => { if (e.key === "Backspace" && !b.value && k > 0) { boxes[k - 1].focus(); boxes[k - 1].value = ""; } });
      b.addEventListener("paste", (e) => { e.preventDefault(); fill(e.clipboardData.getData("text")); });
    });
    boxes[0].focus();
    $("#otpForm").onsubmit = (e) => { e.preventDefault(); verify(); };
    $("#changeEmail").onclick = () => emailStep("start");
    const rs = $("#resend"); let left = 60;
    const tick = () => { if (left > 0) { rs.disabled = true; rs.textContent = `Resend code in ${left--}s`; } else { rs.disabled = false; rs.textContent = "Resend code"; clearInterval(cooldown); } };
    tick(); cooldown = setInterval(tick, 1000);
    rs.onclick = async () => { try { await api("email:send", emailAddr); toast("New code sent"); left = 60; tick(); cooldown = setInterval(tick, 1000); } catch (ex) { showErr(ex.message); } };
  }
}

async function linkMicrosoft() {
  if (!S.state.msEnabled) return toast("Microsoft sign-in isn't set up yet. Follow START-HERE.md part 3, then restart Flop.");
  openModal(`<h3>Link Minecraft</h3><p class="fine" style="font-size:14px"><span class="spinner"></span>&nbsp; Getting a code from Microsoft…</p>`);
  let info;
  try { info = await api("ms:start"); } catch (e) { return openModal(`<h3>Link Minecraft</h3><p class="err">${esc(e.message)}</p><div class="actions"><button class="btn" data-close>Close</button></div>`); }
  openModal(`<h3>Link Minecraft</h3>
    <div class="code" id="mscode">${esc(info.userCode)}</div>
    <ol class="steps"><li>Press <b>Open Microsoft</b> below</li><li>Type the code above and sign in with the account that owns Minecraft</li><li>Come back here. Flop finishes on its own</li></ol>
    <p class="fine" id="msStatus"><span class="spinner"></span>&nbsp; Waiting for you to finish on Microsoft's page…</p>
    <div class="actions"><button class="btn" id="msCancel">Cancel</button><button class="btn" id="msCopy">Copy code</button><button class="btn primary" id="msOpen">Open Microsoft</button></div>`);
  $("#msOpen").onclick = () => attempt(() => api("open:url", info.url));
  $("#msCopy").onclick = () => navigator.clipboard.writeText(info.userCode).then(() => toast("Code copied"), () => {});
  $("#msCancel").onclick = () => { api("ms:cancel"); closeModal(); };
  try {
    const acct = await api("ms:wait");
    closeModal(); await refreshState(); toast(`Linked ${acct.name}. You're ready to play.`);
  } catch (e) {
    if (!$("#modal").hidden) $("#msStatus").innerHTML = `<span class="err">${esc(e.message)}</span>`;
  }
}

/* ================= modal ================= */
function openModal(html) { $("#modalBody").innerHTML = html; $("#modal").hidden = false; }
function closeModal() { $("#modal").hidden = true; }
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#modal").hidden) closeModal(); });

/* ================= routing ================= */
function go(view, id) {
  S.view = view; if (id) S.instId = id;
  document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== `v-${view}`));
  document.querySelectorAll("nav button").forEach((b) => b.setAttribute("aria-current", b.dataset.go === view));
  renderRail();
  ({ play: renderPlay, library: renderLibrary, instance: renderInstance, browse: renderBrowse, packs: renderPacks, settings: renderSettings })[view]();
  $("main").scrollTop = 0; window.scrollTo(0, 0);
}
async function reloadInstances() { S.instances = await api("inst:list"); if (!inst(S.target)) S.target = S.instances[0]?.id || null; renderRail(); }
function replaceInst(i) { const k = S.instances.findIndex((x) => x.id === i.id); if (k >= 0) S.instances[k] = i; else S.instances.unshift(i); renderRail(); }

function renderRail() {
  $("#instCount").textContent = S.instances.length || "";
  $("#rlist").innerHTML = S.instances.map((i) => `<button class="ritem" data-open="${esc(i.id)}" aria-current="${S.view === "instance" && S.instId === i.id}"><div class="block" style="${blockBg(i.color)}"></div><span><b>${esc(i.name)}</b><small>${esc(i.gameVersion)} · ${LOADERS[i.loader]}${i.running ? " · running" : ""}</small></span></button>`).join("");
}

/* ================= play ================= */
function renderPlay() {
  const v = $("#v-play");
  const sel = S.target && inst(S.target) ? S.target : S.instances[0]?.id;
  const p = S.play;
  v.innerHTML = `<div class="hero"><div class="stage"><canvas id="scene" aria-hidden="true"></canvas>
      <span class="eyebrow">${S.instances.length ? "Ready to launch" : "Let's set you up"}</span>
      <h1>Fast as <em>frost.</em><br>Light as a needle.</h1>
      <p>${S.instances.length ? "Pick an instance and press Play. The first launch downloads the game, so give it a few minutes." : "Make your first instance to get started. Fabric is a good pick: it runs Sodium, Iris and most Modrinth mods."}</p>
      <div class="launch-row">${S.instances.length
        ? `<select id="playSel" aria-label="Instance to launch">${S.instances.map((i) => `<option value="${esc(i.id)}" ${i.id === sel ? "selected" : ""}>${esc(i.name)} · ${esc(i.gameVersion)} ${LOADERS[i.loader]}</option>`).join("")}</select>
           ${inst(sel)?.running ? `<button class="play stop" data-stop="${esc(sel)}">STOP</button>` : `<button class="play" data-launch="${esc(sel)}" ${p.running ? "disabled" : ""}>${p.running ? "STARTING…" : "PLAY"}</button>`}`
        : `<button class="play" data-addinst>+ ADD INSTANCE</button>`}</div></div>
    <div class="stats">
      <div class="stat wide"><small>Status</small><div class="progress"><b style="font-size:15px;font-family:var(--sans)" id="pText">${esc(p.text || "Idle")}</b><div class="track"><div class="fill" id="pFill" style="width:${p.pct}%"></div></div></div></div>
      <div class="stat wide"><small>Game output</small><pre class="log" id="pLog" style="height:220px">${esc(p.log.slice(-200).join("\n") || "Output from Minecraft shows up here.")}</pre></div>
    </div></div>`;
  const s = $("#playSel"); if (s) s.onchange = () => { S.target = s.value; renderPlay(); };
  requestAnimationFrame(() => paintLand($("#scene"), 0.82));
}

async function launch(id) {
  if (!S.state.ms) return linkMicrosoft();
  S.target = id;
  S.play = { running: true, text: "Starting…", pct: 0, log: [], id };
  if (S.view !== "play") go("play"); else renderPlay();
  try { await api("launch", id); }
  catch (e) { S.play.running = false; S.play.text = e.message; if (S.view === "play") renderPlay(); toast(e.message); }
}
window.flop.onLaunch((ev) => {
  const p = S.play;
  if (ev.type === "step") p.text = ev.text;
  if (ev.type === "progress" && ev.total) { p.pct = Math.round((ev.done / ev.total) * 100); p.text = `Downloading ${ev.task} (${ev.done} of ${ev.total})`; }
  if (ev.type === "log" && !ev.debug) { p.log.push(ev.line.trimEnd()); if (p.log.length > 500) p.log.splice(0, 100); }
  if (ev.type === "started") { p.running = false; p.text = "Minecraft is running."; p.pct = 100; const i = inst(ev.id); if (i) i.running = true; renderRail(); if (S.view === "play") renderPlay(); }
  if (ev.type === "closed") { p.text = ev.code ? `Minecraft closed with code ${ev.code}. Check Logs for details.` : "Minecraft closed."; p.pct = 0; reloadInstances().then(() => (S.view === "play" ? renderPlay() : S.view === "instance" && renderInstance())); }
  if (ev.type === "error") { p.running = false; p.text = ev.error; }
  if (S.view === "play") {
    const t = $("#pText"), f = $("#pFill"), l = $("#pLog");
    if (t) t.textContent = p.text; if (f) f.style.width = p.pct + "%";
    if (l && ev.type === "log" && !ev.debug) { l.textContent = p.log.slice(-200).join("\n"); l.scrollTop = 1e9; }
  }
});

/* ================= library ================= */
function renderLibrary() {
  $("#v-library").innerHTML = `<div class="head"><div><span class="eyebrow">Your setups</span><h2 class="title">Library</h2><p class="sub">Each instance keeps its own version, loader, content, worlds and settings.</p></div>
    <div class="iactions"><button class="btn" data-import>Import .mrpack</button><button class="btn primary" data-addinst>+ Add instance</button></div></div>
    <div class="inst-grid">${S.instances.map((i) => `<button class="inst" data-open="${esc(i.id)}">
      <div class="inst-top"><div class="block" style="${blockBg(i.color)}"></div><div><b>${esc(i.name)}</b><small style="color:var(--muted);font-size:12px">Played ${ago(i.lastPlayed)}</small></div></div>
      <div class="meta"><span class="chip gold">${esc(i.gameVersion)}</span><span class="chip">${LOADERS[i.loader]}</span><span class="chip">${i.content.length} items</span></div></button>`).join("") || `<div class="empty">No instances yet. Press Add instance to make one.</div>`}</div>`;
}

/* ================= add instance ================= */
async function openAddInstance() {
  if (!S.versions.length) S.versions = (await attempt(() => api("versions"))) || [];
  if (!S.versions.length) return toast("Couldn't load Minecraft versions. Check your internet connection.");
  let color = COLORS[S.instances.length % COLORS.length];
  openModal(`<h3>Add instance</h3>
    <form id="niForm" style="display:flex;flex-direction:column;gap:14px">
      <div class="field"><label for="niName">Name</label><input id="niName" maxlength="40" placeholder="e.g. Schematic Builds"></div>
      <div class="field"><label>Icon color</label><div class="swatches" id="niSw"></div></div>
      <div class="two"><div class="field"><label for="niVer">Game version</label><select id="niVer">${S.versions.map((v) => `<option>${esc(v)}</option>`).join("")}</select></div>
      <div class="field"><label for="niLoader">Loader</label><select id="niLoader"><option value="fabric">Fabric</option><option value="quilt">Quilt</option><option value="vanilla">Vanilla</option></select></div></div>
      <p class="fine">Fabric runs Sodium, Iris, Litematica and most Modrinth mods. Vanilla can only use resource packs.</p>
      <div class="actions"><button type="button" class="btn" data-import>Import .mrpack instead</button><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" id="niCreate">Create</button></div>
    </form>`);
  const sw = () => ($("#niSw").innerHTML = COLORS.map((c) => `<button type="button" class="swatch" style="background:${c}" data-ni="${c}" aria-pressed="${c === color}" aria-label="Color ${c}"></button>`).join(""));
  sw(); $("#niSw").onclick = (e) => { const b = e.target.closest("[data-ni]"); if (b) { color = b.dataset.ni; sw(); } };
  $("#niName").focus();
  $("#niForm").onsubmit = async (e) => {
    e.preventDefault();
    $("#niCreate").disabled = true;
    const i = await attempt(() => api("inst:create", { name: $("#niName").value.trim() || "New instance", gameVersion: $("#niVer").value, loader: $("#niLoader").value, color }));
    if (!i) { $("#niCreate").disabled = false; return; }
    closeModal(); replaceInst(i); S.target = i.id; S.itab = "content"; go("instance", i.id); toast(`Created ${i.name}`);
  };
}
async function importPack() {
  closeModal();
  const i = await attempt(() => api("pack:import"));
  if (i) { await reloadInstances(); go("instance", i.id); toast(`Imported ${i.name}`); }
}

/* ================= instance page ================= */
async function renderInstance() {
  const i = inst(); const v = $("#v-instance");
  if (!i) return go("library");
  const counts = { all: i.content.length }; Object.keys(TYPES).forEach((t) => (counts[t] = i.content.filter((c) => c.type === t).length));
  const upd = S.updates[i.id] || null;
  let body = "";
  if (S.itab === "content") {
    const list = i.content.filter((c) => (S.ctype === "all" || c.type === S.ctype) && (!S.cq || c.title.toLowerCase().includes(S.cq)));
    const nUpd = upd ? upd.length : 0;
    body = `<div class="toolbar"><input type="search" id="cq" placeholder="Search ${counts.all} items" value="${esc(S.cq)}" aria-label="Search installed content">
        ${upd === null ? `<button class="btn" data-check>Check for updates</button>` : nUpd ? `<button class="btn" data-updall>Update all (${nUpd})</button>` : `<span class="fine">Everything is up to date</span>`}
        <button class="btn primary" data-addcontent>+ Add content</button></div>
      <div class="chips">${Object.keys(TYPE_PL).filter((t) => t === "all" || counts[t]).map((t) => `<button class="fchip" data-ctype="${t}" aria-pressed="${t === S.ctype}">${TYPE_PL[t]} · ${counts[t]}</button>`).join("")}</div>
      ${list.length ? `<div class="table"><div class="trow th"><span>On</span><span></span><span>Name</span><span class="typec">Type</span><span></span></div>${list.map((c) => `
        <div class="trow ${c.enabled ? "" : "off"}"><button class="sw" role="switch" aria-checked="${c.enabled}" aria-label="Turn ${esc(c.title)} on or off" data-toggle="${esc(itemKey(c))}"></button>
          ${icon(c)}
          <div class="name"><b>${esc(c.title)}</b><small>${esc(c.versionName || c.fileName)}</small></div>
          <span class="chip typec">${TYPES[c.type]}</span>
          <span class="meta">${upd && upd.includes(c.sha1) ? `<button class="upd" data-upd="${esc(c.sha1)}">Update</button>` : ""}<button class="icon-btn" aria-label="Remove ${esc(c.title)}" data-remove="${esc(itemKey(c))}">✕</button></span></div>`).join("")}</div>`
        : `<div class="table"><div class="empty">${counts.all ? "Nothing matches that filter." : "No content yet. Press Add content to browse Modrinth, or grab a Flop pack."}</div></div>`}`;
  } else if (S.itab === "worlds") {
    const worlds = (await attempt(() => api("inst:worlds", i.id))) || [];
    body = `<div class="toolbar"><span class="fine" style="flex:1">${worlds.length} world${worlds.length === 1 ? "" : "s"}</span><button class="btn sm" data-openfolder="saves">Open saves folder</button></div>
      ${worlds.length ? `<div class="table">${worlds.map((w) => `<div class="trow wrow"><div class="block" style="${blockBg(i.color)};width:36px;height:36px"></div><div class="name"><b>${esc(w.name)}</b><small>Played ${ago(w.modified)}</small></div><button class="btn sm primary" data-launch="${esc(i.id)}">Play</button></div>`).join("")}</div>`
        : `<div class="table"><div class="empty">No worlds yet. Launch the instance and create one.</div></div>`}`;
  } else if (S.itab === "logs") {
    const log = (await attempt(() => api("inst:log", i.id))) || "";
    body = `<div class="toolbar"><span class="fine" style="flex:1">logs/latest.log</span><button class="btn sm" data-refreshlog>Refresh</button><button class="btn sm" data-copylog>Copy</button><button class="btn sm" data-openfolder="logs">Open logs folder</button></div>
      <pre class="log" id="ilog" style="height:auto;min-height:260px;max-height:60vh">${esc(log || "No logs yet. Launch the instance to see output here.")}</pre>`;
  } else body = instanceSettings(i);

  v.innerHTML = `<div class="ihead"><div class="block" style="${blockBg(i.color)}"></div>
    <div class="grow"><h2>${esc(i.name)}</h2><div class="meta"><span class="chip gold">${esc(i.gameVersion)}</span><span class="chip">${LOADERS[i.loader]}${i.loaderVersion ? " " + esc(i.loaderVersion) : ""}</span><span class="chip">${hours(i.playMinutes || 0)} played</span>${i.running ? `<span class="chip ice">Running</span>` : ""}</div></div>
    <div class="iactions"><button class="btn" data-addcontent>Add content</button>${i.running ? `<button class="btn danger" data-stop="${esc(i.id)}">■ Stop</button>` : `<button class="btn primary" data-launch="${esc(i.id)}">▶ Play</button>`}</div></div>
    <div class="tabs" role="tablist">${[["content", "Content", counts.all], ["worlds", "Worlds", ""], ["logs", "Logs", ""], ["settings", "Settings", ""]].map(([k, n, c]) => `<button role="tab" data-itab="${k}" aria-selected="${k === S.itab}">${n}${c !== "" ? `<span class="n">${c}</span>` : ""}</button>`).join("")}</div>
    ${body}`;
  const q = $("#cq");
  if (q) q.oninput = (e) => { S.cq = e.target.value.toLowerCase(); const pos = e.target.selectionStart; renderInstance().then(() => { const n = $("#cq"); n.focus(); n.setSelectionRange(pos, pos); }); };
}

function instanceSettings(i) {
  const sec = { general: "General", install: "Installation", java: "Java & memory", window: "Window", hooks: "Launch hooks" };
  let p = "";
  if (S.stab === "general") p = `<h3>General</h3>
    <div class="field"><label for="sName">Name</label><input id="sName" data-set="name" value="${esc(i.name)}" maxlength="40"></div>
    <div class="field"><label>Icon color</label><div class="swatches">${COLORS.map((c) => `<button class="swatch" style="background:${c}" data-color="${c}" aria-pressed="${c === i.color}" aria-label="Color ${c}"></button>`).join("")}</div></div>
    <div class="field"><label>Manage</label><div class="iactions"><button class="btn" data-dup>Duplicate</button><button class="btn" data-export>Export .mrpack</button><button class="btn" data-openfolder="">Open folder</button></div></div>
    <div class="danger-zone"><div><b>Delete instance</b><p class="fine">Removes its worlds, content and settings from this computer.</p></div><button class="btn danger" data-delinst>Delete</button></div>`;
  if (S.stab === "install") p = `<h3>Installation</h3>
    <div class="two"><div class="field"><label for="sVer">Game version</label><select id="sVer" data-set="gameVersion">${(S.versions.length ? S.versions : [i.gameVersion]).map((x) => `<option ${x === i.gameVersion ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></div>
    <div class="field"><label for="sLoader">Loader</label><select id="sLoader" data-set="loader">${Object.entries(LOADERS).map(([k, n]) => `<option value="${k}" ${k === i.loader ? "selected" : ""}>${n}</option>`).join("")}</select></div></div>
    <p class="fine">After changing the version, press Check for updates on the Content tab. Mods built for the old version may not load until you update or remove them.</p>`;
  if (S.stab === "java") p = `<h3>Java &amp; memory</h3>
    <label class="check"><input type="checkbox" data-set="memOn" ${i.memory ? "checked" : ""}> Custom memory for this instance</label>
    <div class="field"><label for="sMem">Memory: <span style="color:var(--gold);font-family:var(--mono)" id="sMemV">${i.memory || S.settings.memory} GB</span></label><input type="range" id="sMem" data-set="memory" min="2" max="16" value="${i.memory || S.settings.memory}" ${i.memory ? "" : "disabled"}></div>
    <p class="fine">Flop downloads the right Java for this Minecraft version on its own. To use your own Java, set it in Settings.</p>`;
  if (S.stab === "window") p = `<h3>Window</h3>
    <label class="check"><input type="checkbox" data-set="fullscreen" ${i.window.fullscreen ? "checked" : ""}> Start in fullscreen</label>
    <div class="two"><div class="field"><label for="sW">Width</label><input id="sW" type="number" min="640" data-set="width" value="${i.window.width}" ${i.window.fullscreen ? "disabled" : ""}></div>
    <div class="field"><label for="sH">Height</label><input id="sH" type="number" min="480" data-set="height" value="${i.window.height}" ${i.window.fullscreen ? "disabled" : ""}></div></div>`;
  if (S.stab === "hooks") p = `<h3>Launch hooks</h3>
    <div class="field"><label for="sHook">Pre-launch command</label><input id="sHook" data-set="hook" value="${esc(i.hook)}" placeholder="e.g. a backup script"></div>
    <p class="fine">Runs in the instance folder before the game starts. Leave empty to skip.</p>`;
  return `<div class="isettings"><div class="snav" role="tablist">${Object.entries(sec).map(([k, n]) => `<button role="tab" data-stab="${k}" aria-selected="${k === S.stab}">${n}</button>`).join("")}</div><div class="spanel">${p}</div></div>`;
}

$("#v-instance").addEventListener("input", (e) => { if (e.target.id === "sMem") $("#sMemV").textContent = e.target.value + " GB"; });
$("#v-instance").addEventListener("change", async (e) => {
  const k = e.target.dataset.set; if (!k) return;
  const i = inst(); const val = e.target.type === "checkbox" ? e.target.checked : e.target.value;
  const patch = {};
  if (k === "name") patch.name = val.trim() || i.name;
  if (k === "gameVersion" || k === "loader") { patch[k] = val; delete S.updates[i.id]; }
  if (k === "memOn") patch.memory = val ? S.settings.memory : null;
  if (k === "memory") patch.memory = +val;
  if (k === "fullscreen") patch.window = { ...i.window, fullscreen: val };
  if (k === "width" || k === "height") patch.window = { ...i.window, [k]: Math.max(+e.target.min, +val || 0) };
  if (k === "hook") patch.hook = val.trim();
  const n = await attempt(() => api("inst:update", i.id, patch));
  if (n) { replaceInst(n); renderInstance(); if (k === "gameVersion" || k === "loader") toast(`Switched to ${n.gameVersion} ${LOADERS[n.loader]}`); }
});

/* ================= browse ================= */
let searchT;
function renderBrowse() {
  const t = inst(S.target);
  const v = $("#v-browse");
  v.innerHTML = `${S.view === "browse" && S.fromInst ? `<button class="backlink" data-open="${esc(S.fromInst)}">← Back to ${esc(inst(S.fromInst)?.name || "instance")}</button>` : ""}
    <div class="head"><div><span class="eyebrow">Live from Modrinth</span><h2 class="title">Browse content</h2><p class="sub">Results are filtered to what works on the instance you install into. Required dependencies come along automatically.</p></div></div>
    <div class="toolbar"><input id="bq" type="search" placeholder="Search Modrinth, e.g. Litematica" value="${esc(S.bq)}" aria-label="Search Modrinth">
      <label class="fine" for="target">Install to</label>
      <select id="target">${S.instances.map((i) => `<option value="${esc(i.id)}" ${i.id === S.target ? "selected" : ""}>${esc(i.name)} · ${esc(i.gameVersion)} ${LOADERS[i.loader]}</option>`).join("") || `<option>No instances yet</option>`}</select></div>
    <div class="chips">${Object.keys(TYPES).map((k) => `<button class="fchip" data-btype="${k}" aria-pressed="${k === S.btype}">${TYPE_PL[k]}</button>`).join("")}</div>
    <div class="results" id="results">${!t ? `<div class="empty">Make an instance first, then come back to install content.</div>` : t.loader === "vanilla" && S.btype !== "resourcepack" ? `<div class="empty">${esc(t.name)} is a Vanilla instance. Mods and shaders need Fabric or Quilt (change it in the instance's Settings → Installation).</div>` : `<div class="empty"><span class="spinner"></span>&nbsp; Searching Modrinth…</div>`}</div>`;
  $("#bq").oninput = (e) => { S.bq = e.target.value; clearTimeout(searchT); searchT = setTimeout(() => runSearch(0), 350); };
  $("#target").onchange = (e) => { S.target = e.target.value; renderBrowse(); };
  if (t && !(t.loader === "vanilla" && S.btype !== "resourcepack")) runSearch(0);
}
async function runSearch(offset) {
  const t = inst(S.target); if (!t) return;
  const token = (runSearch.token = Symbol());
  try {
    const r = await api("mr:search", { query: S.bq.trim(), type: S.btype, gameVersion: t.gameVersion, loader: t.loader, offset });
    if (token !== runSearch.token) return;
    S.results = offset ? S.results.concat(r.hits) : r.hits; S.total = r.total_hits;
    drawResults();
  } catch (e) { if ($("#results")) $("#results").innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}
function drawResults() {
  const t = inst(S.target); const box = $("#results"); if (!box || !t) return;
  const nf = new Intl.NumberFormat("en", { notation: "compact" });
  box.innerHTML = S.results.length ? S.results.map((h) => {
    const installed = t.content.some((c) => c.projectId === h.project_id && c.enabled);
    const busy = S.installing.has(h.project_id);
    return `<div class="res">${icon({ iconUrl: h.icon_url, title: h.title })}
      <div class="body"><b>${esc(h.title)}<small>by ${esc(h.author)}</small></b><p>${esc(h.description)}</p>
        <span class="stats-line">${nf.format(h.downloads)} downloads · ${nf.format(h.follows)} followers</span></div>
      <div class="act"><button class="btn sm ${installed ? "" : "primary"}" data-install="${esc(h.project_id)}" ${installed || busy ? "disabled" : ""}>${installed ? "Installed ✓" : busy ? "Installing…" : "Install"}</button></div></div>`;
  }).join("") + (S.results.length < S.total ? `<button class="btn" data-more style="align-self:center">Load more</button>` : "")
    : `<div class="empty">Nothing found for "${esc(S.bq)}" on ${esc(t.gameVersion)} ${LOADERS[t.loader]}.</div>`;
}
async function installInto(id, ids, label) {
  ids.forEach((x) => S.installing.add(x)); if (S.view === "browse") drawResults();
  try {
    const r = await api("mr:install", id, ids);
    replaceInst(r.instance);
    toast(r.added.length ? `Installed ${r.added.join(", ")}` : `${label || "That"} was already installed`);
  } catch (e) { toast(e.message); await reloadInstances(); }
  ids.forEach((x) => S.installing.delete(x));
  if (S.view === "browse") drawResults(); if (S.view === "instance") renderInstance(); if (S.view === "packs") renderPacks();
}

/* ================= Flop packs ================= */
const PACKS = [
  { id: "perf", name: "Performance", desc: "Big FPS gains and lower memory use. Safe on any server.", slugs: ["sodium", "lithium", "ferrite-core", "entityculling"] },
  { id: "shaders", name: "Shaders", desc: "Iris plus Complementary Reimagined, a bright shader that stays close to the vanilla look.", slugs: ["iris", "complementary-reimagined"] },
  { id: "qol", name: "Quality of life", desc: "Mod list button, smooth zoom and hunger values on food.", slugs: ["modmenu", "zoomify", "appleskin"] },
  { id: "build", name: "Building", desc: "Litematica schematics, MiniHUD overlays and Tweakeroo placement tools.", slugs: ["litematica", "minihud", "tweakeroo"] },
];
function renderPacks() {
  const t = inst(S.target);
  $("#v-packs").innerHTML = `<div class="head"><div><span class="eyebrow">One click</span><h2 class="title">Flop packs</h2><p class="sub">Hand-picked Modrinth sets. Each one installs the right versions for your instance, plus anything they need.</p></div>
      <div class="toolbar"><label class="fine" for="ptarget">Install to</label><select id="ptarget">${S.instances.map((i) => `<option value="${esc(i.id)}" ${i.id === S.target ? "selected" : ""}>${esc(i.name)} · ${esc(i.gameVersion)} ${LOADERS[i.loader]}</option>`).join("") || `<option>No instances yet</option>`}</select></div></div>
    <div class="packs">${PACKS.map((p) => `<div class="pack"><span class="eyebrow">${p.slugs.length} projects</span><h3>${p.name}</h3><p>${p.desc}</p><button class="btn primary" data-pack="${p.id}" ${!t || t.loader === "vanilla" || p.slugs.some((s) => S.installing.has(s)) ? "disabled" : ""}>${p.slugs.some((s) => S.installing.has(s)) ? "Installing…" : t?.loader === "vanilla" ? "Needs Fabric or Quilt" : "Install pack"}</button></div>`).join("")}
      <div class="pack soon"><span class="eyebrow">Coming next</span><h3>Flop PvP mod</h3><p>Keystrokes, CPS, armor HUD, toggle sprint and the Right Shift mod menu. This is your own Fabric mod, built in part 5 of the guide.</p></div></div>`;
  $("#ptarget").onchange = (e) => { S.target = e.target.value; renderPacks(); };
}

/* ================= settings ================= */
function renderSettings() {
  const st = S.state, s = S.settings;
  $("#v-settings").innerHTML = `<div class="head"><div><span class="eyebrow">Launcher</span><h2 class="title">Settings</h2></div></div>
    <div class="settings">
      <div class="row"><label for="gMem">Default memory <span id="gMemV">${s.memory} GB</span></label><input id="gMem" type="range" min="2" max="16" value="${s.memory}"><p class="fine">Instances use this unless they set their own.</p></div>
      <div class="row"><label>Java</label><p class="fine" style="word-break:break-all">${s.javaPath ? esc(s.javaPath) : "Automatic. Flop downloads the right Java for each version."}</p><div class="iactions"><button class="btn sm" data-pickjava>Choose Java…</button>${s.javaPath ? `<button class="btn sm" data-autojava>Use automatic</button>` : ""}</div></div>
      <div class="row"><label>Flop account</label><p class="fine">${st.flop ? esc(st.flop.email) : st.emailEnabled ? "Not signed in" : "Email sign-in isn't set up (guide part 4)."}</p>${st.flop ? `<button class="btn sm" data-emailout style="align-self:flex-start">Sign out</button>` : ""}</div>
      <div class="row"><label>Minecraft account</label><p class="fine">${st.ms ? `Linked as ${esc(st.ms.name)}` : "Not linked"}</p>${st.ms ? `<button class="btn sm" data-msout style="align-self:flex-start">Unlink</button>` : `<button class="btn sm primary" data-mslink style="align-self:flex-start">Link Microsoft account</button>`}</div>
      <div class="row"><label>Files</label><p class="fine">Instances, Java and game files live in Flop's data folder.</p><button class="btn sm" data-opendata style="align-self:flex-start">Open data folder</button></div>
    </div>`;
  $("#gMem").oninput = (e) => ($("#gMemV").textContent = e.target.value + " GB");
  $("#gMem").onchange = async (e) => { S.settings = await api("settings:set", { memory: +e.target.value }); };
}

/* ================= clicks ================= */
let pendingDelete = null;
document.addEventListener("click", async (e) => {
  const t = e.target.closest("button"); if (!t || t.disabled) return;
  const d = t.dataset, i = inst();
  if (d.go) { S.fromInst = null; go(d.go); }
  else if (d.open) { S.itab = "content"; S.ctype = "all"; S.cq = ""; S.target = d.open; go("instance", d.open); }
  else if ("addinst" in d) openAddInstance();
  else if ("import" in d) importPack();
  else if ("close" in d) closeModal();
  else if ("mslink" in d) linkMicrosoft();
  else if (d.launch) launch(d.launch);
  else if (d.stop) attempt(() => api("stop", d.stop));
  else if ("addcontent" in d) { S.target = S.instId; S.fromInst = S.instId; S.btype = S.ctype === "all" ? "mod" : S.ctype; go("browse"); }
  else if (d.itab) { S.itab = d.itab; renderInstance(); }
  else if (d.stab) { S.stab = d.stab; renderInstance(); }
  else if (d.ctype) { S.ctype = d.ctype; renderInstance(); }
  else if (d.toggle) { const c = i.content.find((x) => itemKey(x) === d.toggle); const n = await attempt(() => api("content:toggle", i.id, d.toggle, !c.enabled)); if (n) { replaceInst(n); renderInstance(); } }
  else if (d.remove) { const c = i.content.find((x) => itemKey(x) === d.remove); const n = await attempt(() => api("content:remove", i.id, d.remove)); if (n) { replaceInst(n); renderInstance(); toast(`Removed ${c.title}`); } }
  else if ("check" in d) { t.disabled = true; t.innerHTML = `<span class="busy"><span class="spinner"></span>Checking…</span>`; const r = await attempt(() => api("content:checkUpdates", i.id)); if (r) S.updates[i.id] = r; renderInstance(); }
  else if (d.upd || "updall" in d) {
    t.disabled = true;
    const r = await attempt(() => api("content:update", i.id, d.upd ? [d.upd] : S.updates[i.id]));
    if (r) { replaceInst(r.instance); S.updates[i.id] = (S.updates[i.id] || []).filter((h) => (d.upd ? h !== d.upd : false)); toast(`Updated ${r.updated} item${r.updated === 1 ? "" : "s"}`); }
    renderInstance();
  }
  else if (d.color) { const n = await attempt(() => api("inst:update", i.id, { color: d.color })); if (n) { replaceInst(n); renderInstance(); } }
  else if ("dup" in d) { const n = await attempt(() => api("inst:duplicate", i.id)); if (n) { replaceInst(n); go("instance", n.id); toast(`Duplicated as ${n.name}`); } }
  else if ("export" in d) { const p = await attempt(() => api("pack:export", i.id)); if (p) toast(`Saved ${p}`); }
  else if ("openfolder" in d) attempt(() => api("inst:open", i.id, d.openfolder));
  else if ("refreshlog" in d) renderInstance();
  else if ("copylog" in d) navigator.clipboard.writeText($("#ilog").textContent).then(() => toast("Log copied"), () => {});
  else if ("delinst" in d) {
    if (pendingDelete !== i.id) { pendingDelete = i.id; t.textContent = "Click again to delete"; setTimeout(() => { if (pendingDelete === i.id) { pendingDelete = null; if (t.isConnected) t.textContent = "Delete"; } }, 3000); return; }
    pendingDelete = null;
    if ((await attempt(() => api("inst:remove", i.id))) !== undefined) { toast(`Deleted ${i.name}`); await reloadInstances(); go("library"); }
  }
  else if (d.install) installInto(S.target, [d.install], S.results.find((h) => h.project_id === d.install)?.title);
  else if ("more" in d) { t.disabled = true; runSearch(S.results.length); }
  else if (d.btype) { S.btype = d.btype; S.results = []; renderBrowse(); }
  else if (d.pack) { const p = PACKS.find((x) => x.id === d.pack); installInto(S.target, p.slugs, p.name); renderPacks(); }
  else if ("pickjava" in d) { const p = await attempt(() => api("settings:pickJava")); if (p) { S.settings = await api("settings:set", { javaPath: p }); renderSettings(); } }
  else if ("autojava" in d) { S.settings = await api("settings:set", { javaPath: "" }); renderSettings(); }
  else if ("emailout" in d) { await api("email:signout"); await refreshState(); renderSettings(); }
  else if ("msout" in d) { await api("ms:signout"); await refreshState(); renderSettings(); }
  else if ("opendata" in d) api("open:data");
});

/* ================= scenery ================= */
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
function fit(c) { if (!c) return [null]; const r = c.getBoundingClientRect(), dpr = devicePixelRatio || 1; if (!r.width) return [null]; c.width = r.width * dpr; c.height = r.height * dpr; const x = c.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); return [x, r.width, r.height]; }
function paintLand(c, moonX) {
  const [x, w, h] = fit(c); if (!x) return;
  x.fillStyle = "rgba(240,200,105,.9)"; x.beginPath(); x.arc(w * moonX, h * 0.22, 22, 0, 7); x.fill();
  x.fillStyle = "rgba(240,200,105,.12)"; x.beginPath(); x.arc(w * moonX, h * 0.22, 60, 0, 7); x.fill();
  const px = 14;
  [[0.62, "#0f2a21"], [0.72, "#0b1f19"]].forEach(([base, col], k) => { x.fillStyle = col; for (let i = 0; i < w / px + 1; i++) { const hh = h * base - Math.round((Math.sin(i * 0.35 + k * 2) + Math.sin(i * 0.13)) * 3) * px; x.fillRect(i * px, hh, px, h - hh); } });
  for (let i = 0; i < 9; i++) { const tx = (((i * 137) % 100) / 100) * w, ty = h * 0.6 + ((i * 53) % 20), s = 6; x.fillStyle = "#1f6e46"; for (let r = 0; r < 4; r++) x.fillRect(tx - (r + 1) * s, ty - 60 + r * s * 2.2, (r + 1) * s * 2, s * 2.2); x.fillStyle = "#5a3a22"; x.fillRect(tx - s / 2, ty - 60 + 4 * s * 2.2, s, s * 2); }
}
const snow = $("#snow"); const flakes = Array.from({ length: 80 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.8 + 0.4, s: Math.random() * 0.0008 + 0.0003 }));
let sctx, sw, sh; const sizeSnow = () => ([sctx, sw, sh] = fit(snow));
function loop() { if (sctx) { sctx.clearRect(0, 0, sw, sh); sctx.fillStyle = "rgba(255,255,255,.6)"; for (const f of flakes) { f.y += f.s * 8; f.x += Math.sin(f.y * 20) * 0.0004; if (f.y > 1) { f.y = 0; f.x = Math.random(); } sctx.beginPath(); sctx.arc(f.x * sw, f.y * sh, f.r, 0, 7); sctx.fill(); } } if (!reduce) requestAnimationFrame(loop); }
addEventListener("resize", () => { sizeSnow(); if (S.view === "play") paintLand($("#scene"), 0.82); if (!$("#signin").hidden) paintLand($("#signScene"), 0.75); });

/* ================= start ================= */
(async function boot() {
  sizeSnow(); loop();
  try {
    S.settings = await api("settings:get");
    await refreshState();
    await reloadInstances();
    S.target = S.instances[0]?.id || null;
    go("play");
    api("versions").then((v) => (S.versions = v)).catch(() => {});
  } catch (e) { document.body.insertAdjacentHTML("beforeend", `<div class="toast">Flop couldn't start: ${esc(e.message)}</div>`); }
})();
