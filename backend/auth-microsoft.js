// Microsoft sign-in using the "device code" flow: the player types a short code at microsoft.com/link.
// Chain: Microsoft token -> Xbox Live -> XSTS -> Minecraft services -> Minecraft profile.
// Needs your own Azure app ID in config.json (see START-HERE.md, part 3).
const { config, saveSecret, loadSecret, deleteSecret } = require("./util");

const MS = "https://login.microsoftonline.com/consumers/oauth2/v2.0";
const SCOPE = "XboxLive.signin offline_access";
const SECRET = "microsoft";

const enabled = () => !!config().microsoftClientId;

async function form(url, params) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, data };
}
async function post(url, body, headers = {}) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", ...headers }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

let pending = null; // current device-code attempt

async function startDeviceCode() {
  if (!enabled()) throw new Error("Microsoft sign-in isn't set up yet. Add your Azure app ID to config.json (START-HERE.md, part 3).");
  const { ok, data } = await form(`${MS}/devicecode`, { client_id: config().microsoftClientId, scope: SCOPE });
  if (!ok) throw new Error(data.error_description || "Microsoft didn't give us a sign-in code. Check your Azure app ID.");
  pending = { device: data.device_code, interval: (data.interval || 5) * 1000, expires: Date.now() + data.expires_in * 1000, cancelled: false };
  return { userCode: data.user_code, url: data.verification_uri, expiresIn: data.expires_in };
}

function cancel() { if (pending) pending.cancelled = true; }

// Waits until the player finishes on Microsoft's site, then signs in to Minecraft.
async function waitForDeviceCode() {
  const p = pending;
  if (!p) throw new Error("Start Microsoft sign-in first.");
  while (!p.cancelled) {
    if (Date.now() > p.expires) throw new Error("The code expired. Start again for a new one.");
    await new Promise((r) => setTimeout(r, p.interval));
    const { ok, data } = await form(`${MS}/token`, {
      grant_type: "urn:ietf:params:oauth:grant-type:device_code", client_id: config().microsoftClientId, device_code: p.device,
    });
    if (ok) { pending = null; return finish(data); }
    if (data.error === "authorization_pending") continue;
    if (data.error === "slow_down") { p.interval += 5000; continue; }
    if (data.error === "authorization_declined") throw new Error("Sign-in was cancelled on Microsoft's page.");
    if (data.error === "expired_token") throw new Error("The code expired. Start again for a new one.");
    throw new Error(data.error_description || "Microsoft sign-in failed.");
  }
  throw new Error("Sign-in cancelled.");
}

async function minecraftFromMicrosoft(msAccessToken) {
  const xbl = await post("https://user.auth.xboxlive.com/user/authenticate", {
    Properties: { AuthMethod: "RPS", SiteName: "user.auth.xboxlive.com", RpsTicket: `d=${msAccessToken}` },
    RelyingParty: "http://auth.xboxlive.com", TokenType: "JWT",
  });
  if (!xbl.ok) throw new Error("Xbox Live sign-in failed. Try again in a minute.");
  const uhs = xbl.data.DisplayClaims.xui[0].uhs;

  const xsts = await post("https://xsts.auth.xboxlive.com/xsts/authorize", {
    Properties: { SandboxId: "RETAIL", UserTokens: [xbl.data.Token] },
    RelyingParty: "rp://api.minecraftservices.com/", TokenType: "JWT",
  });
  if (!xsts.ok) {
    const code = xsts.data.XErr;
    if (code === 2148916233) throw new Error("This Microsoft account has no Xbox profile yet. Sign in once at xbox.com to create one.");
    if (code === 2148916238) throw new Error("This is a child account. An adult needs to add it to a Microsoft family first.");
    if (code === 2148916235) throw new Error("Xbox Live isn't available in this account's country.");
    throw new Error("Xbox sign-in was refused.");
  }

  const mc = await post("https://api.minecraftservices.com/authentication/login_with_xbox", { identityToken: `XBL3.0 x=${uhs};${xsts.data.Token}` });
  if (!mc.ok) {
    if (mc.status === 403) throw new Error("Mojang hasn't approved this app's Azure ID yet. See START-HERE.md, part 3, step 6.");
    throw new Error("Minecraft sign-in failed.");
  }
  const r = await fetch("https://api.minecraftservices.com/minecraft/profile", { headers: { Authorization: `Bearer ${mc.data.access_token}` } });
  if (r.status === 404) throw new Error("This Microsoft account doesn't own Minecraft: Java Edition.");
  if (!r.ok) throw new Error("Couldn't load your Minecraft profile.");
  const profile = await r.json();
  return { mcToken: mc.data.access_token, mcExpires: Date.now() + (mc.data.expires_in - 60) * 1000, uuid: profile.id, name: profile.name };
}

async function finish(msData) {
  const mc = await minecraftFromMicrosoft(msData.access_token);
  const acct = { refresh: msData.refresh_token, ...mc };
  saveSecret(SECRET, acct);
  return { name: acct.name, uuid: acct.uuid };
}

function account() {
  const a = loadSecret(SECRET);
  return a ? { name: a.name, uuid: a.uuid } : null;
}

// Returns a fresh login for minecraft-launcher-core, refreshing tokens if needed.
async function launchAuth() {
  let a = loadSecret(SECRET);
  if (!a) throw new Error("Link your Microsoft account first (top of the window).");
  if (Date.now() > a.mcExpires) {
    const { ok, data } = await form(`${MS}/token`, { grant_type: "refresh_token", client_id: config().microsoftClientId, refresh_token: a.refresh, scope: SCOPE });
    if (!ok) { deleteSecret(SECRET); throw new Error("Your Microsoft sign-in expired. Link your account again."); }
    a = { refresh: data.refresh_token || a.refresh, ...(await minecraftFromMicrosoft(data.access_token)) };
    saveSecret(SECRET, a);
  }
  return {
    access_token: a.mcToken, client_token: a.uuid, uuid: a.uuid, name: a.name,
    user_properties: "{}", meta: { type: "msa", demo: false },
  };
}

function signOut() { deleteSecret(SECRET); }

module.exports = { enabled, startDeviceCode, waitForDeviceCode, cancel, account, launchAuth, signOut };
