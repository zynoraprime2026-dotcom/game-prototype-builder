/* Al-Haqq Digital — Game Prototype Builder
   Shared API wiring for the Studio API (https://studio-api-nqpm.onrender.com)
   Each visitor gets their own developer key on first use; nothing is hardcoded. */
const API = "https://studio-api-nqpm.onrender.com";
const KEY_STORE = "gpb_key";

function getKey() { return localStorage.getItem(KEY_STORE); }

async function ensureKey() {
  let k = getKey();
  if (k) return k;
  const r = await fetch(API + "/v1/developers/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "gamer-" + Math.random().toString(36).slice(2, 10) + "@builder.app" }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.key) throw new Error(d.error || "Could not set up your studio access.");
  localStorage.setItem(KEY_STORE, d.key);
  return d.key;
}

/* One retry on 429 (free-tier limit), with a friendly message. */
async function call(path, opts = {}, retried = false) {
  await ensureKey();
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getKey(),
      ...(opts.headers || {}),
    },
  });
  if (res.status === 429 && !retried) {
    setBusy("The studio is busy (free tier limit). Trying again in a few seconds…");
    await new Promise((ok) => setTimeout(ok, 3000));
    return call(path, opts, true);
  }
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || "The studio had a problem (HTTP " + res.status + ").");
  return d;
}

/* First load of a page: show an asleep notice if the cold start is slow. */
function withWake(promise) {
  const shown = { v: false };
  const t = setTimeout(() => {
    if (!shown.v) { shown.v = true; setBusy("The studio was asleep — first load can be slow…"); }
  }, 5000);
  return promise.finally(() => { clearTimeout(t); shown.v = true; });
}

/* status helpers — pages define #status / #busy elements */
function setStatus(msg, cls) {
  const el = document.getElementById("status");
  if (el) { el.textContent = msg || ""; el.className = "status " + (cls || ""); }
}
function setBusy(msg) {
  const el = document.getElementById("busy");
  if (el) { el.textContent = msg || ""; el.style.display = msg ? "block" : "none"; }
}
function showErr(e) { setStatus(e.message || String(e), "err"); }

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
