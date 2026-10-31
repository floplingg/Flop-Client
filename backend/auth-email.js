// Flop accounts: sign in with a 6-digit code sent to your email.
// Uses Supabase Auth (free tier is plenty). Setup is in START-HERE.md, part 4.
// Note: this is your *Flop* account. Playing Minecraft still needs a linked Microsoft account.
const { config, saveSecret, loadSecret, deleteSecret } = require("./util");

const SECRET = "flop-account";
const enabled = () => !!(config().supabaseUrl && config().supabaseAnonKey);

async function call(path, body) {
  const base = config().supabaseUrl.replace(/\/$/, "");
  const r = await fetch(base + path, {
    method: "POST",
    headers: { apikey: config().supabaseAnonKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

async function sendCode(email) {
  if (!enabled()) throw new Error("Email sign-in isn't set up yet (START-HERE.md, part 4).");
  const { ok, status, data } = await call("/auth/v1/otp", { email, create_user: true });
  if (status === 429) throw new Error("Too many codes sent. Wait a minute, then press Resend.");
  if (!ok) throw new Error(data.msg || data.error_description || "Couldn't send the code. Check the email address.");
}

async function verify(email, token) {
  const { ok, data } = await call("/auth/v1/verify", { type: "email", email, token });
  if (!ok || !data.access_token) throw new Error("That code isn't right or has expired.");
  const acct = { email: data.user?.email || email, userId: data.user?.id, refresh: data.refresh_token };
  saveSecret(SECRET, acct);
  return { email: acct.email };
}

function account() {
  const a = loadSecret(SECRET);
  return a ? { email: a.email } : null;
}

function signOut() { deleteSecret(SECRET); }

module.exports = { enabled, sendCode, verify, account, signOut };
