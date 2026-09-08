// popup.js — controls the active tab and persists settings.
//   • On Google search pages: drives the AI Overview playback (play/pause/…).
//   • On any page: lets the user enable/disable the "read highlighted text"
//     reader for that site (a per-domain permission opt-in).

const $ = (id) => document.getElementById(id);
const statusEl = $("status");
const hintEl = $("hint");

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function onGoogleSearch(tab) {
  return tab && /^https:\/\/www\.google\.[^/]+\/search/.test(tab.url || "");
}

// Message the active tab's content script; resolve to null if none is present.
async function send(action, extra = {}) {
  const tab = await activeTab();
  if (!tab) return null;
  try {
    return await chrome.tabs.sendMessage(tab.id, { action, ...extra });
  } catch (_) {
    return null;
  }
}

function setStatus(text) {
  statusEl.textContent = text;
}

function reflect(status) {
  const playing = status === "playing";
  const paused = status === "paused";
  $("pause").disabled = !playing;
  $("resume").disabled = !paused;
  $("stop").disabled = status === "idle" || !status;
  if (playing) setStatus("Speaking…");
  else if (paused) setStatus("Paused");
  else setStatus("Ready");
}

// ---- Voices (read from the popup's own speech engine — always available) ----
// Mirrors the ranking in speech.js so we can label the auto-selected default.
function scoreVoice(v) {
  const name = (v.name || "").toLowerCase();
  const lang = (v.lang || "").toLowerCase();
  let s = 0;
  if (/^en(-|_|$)/.test(lang)) s += 100;
  if (/^en[-_]us/.test(lang)) s += 10;
  if (name.includes("premium")) s += 120;
  else if (name.includes("enhanced")) s += 90;
  if (name.includes("neural")) s += 90;
  if (name.includes("siri")) s += 80;
  if (name.includes("natural")) s += 70;
  if (name.includes("google")) s += 60;
  if (name.includes("compact")) s -= 80;
  if (name.includes("eloquence")) s -= 60;
  if (/(ava|zoe|evan|allison|samantha|jenny|aria|serena)/.test(name)) s += 15;
  return s;
}

// getVoices() can be empty on first call; wait briefly for the async load.
function getLocalVoices() {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const now = synth.getVoices();
    if (now.length) return resolve(now);
    const done = () => resolve(synth.getVoices());
    synth.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 500);
  });
}

// ---- Settings persistence --------------------------------------------------
const defaults = { rate: 1.0, pitch: 1.0, voiceURI: "" };

function loadSettings() {
  return new Promise((res) => chrome.storage.sync.get(defaults, res));
}
function saveSettings(patch) {
  chrome.storage.sync.set(patch);
}

// ---- Per-site "read highlighted text" toggle -------------------------------
function siteOrigin(tab) {
  try {
    const u = new URL(tab.url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.origin;
  } catch (_) {
    return null;
  }
}

function originPattern(origin) {
  return origin + "/*";
}

function hostOf(origin) {
  try {
    return new URL(origin).host;
  } catch (_) {
    return origin;
  }
}

async function getEnabledOrigins() {
  const { enabledOrigins } = await chrome.storage.local.get("enabledOrigins");
  return Array.isArray(enabledOrigins) ? enabledOrigins : [];
}

// Grant/revoke go through the permissions API; the background worker reacts to
// permissions.onAdded / onRemoved to register or tear down the reader. The popup
// just re-renders when chrome.storage.local (the enabled-sites list) changes.
async function initSiteToggle(tab) {
  const section = $("siteSection");
  const toggle = $("siteToggle");
  const hint = $("siteHint");
  const listEl = $("siteList");
  section.hidden = false;

  const origin = siteOrigin(tab); // null on chrome://, extension pages, etc.
  const host = origin ? hostOf(origin) : "";
  let enabledList = []; // kept current by render(), read synchronously on click

  async function render() {
    const enabled = await getEnabledOrigins();
    enabledList = enabled;

    // --- Current-site toggle ---
    if (!origin) {
      toggle.hidden = true;
      hint.textContent = "This feature can't run on this kind of page.";
    } else {
      toggle.hidden = false;
      const on = enabled.includes(origin);
      toggle.textContent = on ? "Disable on this site" : "Enable on this site";
      hint.innerHTML = on
        ? `Select any text on <b>${host}</b> and a 🔊 button appears to read it.`
        : `Turn on to read any text you highlight on <b>${host}</b> aloud.`;
    }

    // --- List of all enabled sites, each revocable ---
    listEl.textContent = "";
    if (!enabled.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No sites enabled yet.";
      listEl.appendChild(empty);
      return;
    }
    for (const o of enabled) {
      const row = document.createElement("div");
      row.className = "site-item";
      const name = document.createElement("span");
      name.textContent = hostOf(o);
      name.title = o;
      const rm = document.createElement("button");
      rm.className = "remove";
      rm.textContent = "Remove";
      rm.addEventListener("click", () =>
        chrome.permissions.remove({ origins: [originPattern(o)] })
      );
      row.append(name, rm);
      listEl.appendChild(row);
    }
  }

  toggle.addEventListener("click", () => {
    if (!origin) return;
    // Call the permissions API synchronously — chrome.permissions.request() only
    // works inside a user gesture, so we must not await anything before it.
    if (enabledList.includes(origin)) {
      chrome.permissions.remove({ origins: [originPattern(origin)] });
    } else {
      chrome.permissions.request({ origins: [originPattern(origin)] });
    }
    // The background worker reacts to the permission change and updates storage;
    // render() re-runs via the storage listener below. (This handler may not even
    // survive the prompt closing the popup — which is why the real work lives in
    // the background.)
  });

  // Re-render whenever the background worker changes the enabled-sites list.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.enabledOrigins) render();
  });

  await render();
}

// ---- Init ------------------------------------------------------------------
async function init() {
  const tab = await activeTab();

  // Voice dropdown (independent of the page).
  const voiceSel = $("voice");
  const settings = await loadSettings();
  const voices = await getLocalVoices();
  if (voices.length) {
    const autoVoice = voices.reduce((best, v) =>
      scoreVoice(v) > scoreVoice(best) ? v : best
    );
    const selectedURI = settings.voiceURI || (autoVoice && autoVoice.voiceURI) || "";
    for (const v of voices) {
      const opt = document.createElement("option");
      opt.value = v.voiceURI;
      const isAuto = !settings.voiceURI && autoVoice && v.voiceURI === autoVoice.voiceURI;
      opt.textContent = `${v.name} (${v.lang})${isAuto ? " — auto" : ""}`;
      if (v.voiceURI === selectedURI) opt.selected = true;
      voiceSel.appendChild(opt);
    }
  } else {
    const opt = document.createElement("option");
    opt.textContent = "System default";
    voiceSel.appendChild(opt);
  }

  // Sliders.
  $("rate").value = settings.rate;
  $("pitch").value = settings.pitch;
  $("rateVal").textContent = `${Number(settings.rate).toFixed(1)}×`;
  $("pitchVal").textContent = Number(settings.pitch).toFixed(1);

  // Per-site highlighted-text toggle.
  await initSiteToggle(tab);

  // Google AI Overview controls.
  if (!onGoogleSearch(tab)) {
    ["play", "pause", "resume", "stop"].forEach((id) => ($(id).disabled = true));
    setStatus("Open a Google search to read its AI summary.");
    hintEl.textContent =
      "The buttons above read Google's AI summary. Highlighted-text reading works via the toggle below.";
    return;
  }

  hintEl.textContent =
    "Press Listen to read the AI summary at the top of the results.";
  const st = await send("status");
  if (st) {
    reflect(st.status);
    if (!st.hasOverview) setStatus("No AI summary detected on this page.");
  } else {
    setStatus("Reload the search page, then reopen this popup.");
  }
}

// ---- Event wiring ----------------------------------------------------------
$("play").addEventListener("click", async () => {
  const r = await send("play");
  if (!r) setStatus("Could not reach the page — try reloading it.");
  else if (r.reason === "not-found") setStatus("No AI summary found.");
  else reflect(r.status || "playing");
});

$("pause").addEventListener("click", async () => reflect((await send("pause"))?.status));
$("resume").addEventListener("click", async () => reflect((await send("resume"))?.status));
$("stop").addEventListener("click", async () => reflect((await send("stop"))?.status || "idle"));

$("rate").addEventListener("input", (e) => {
  const v = Number(e.target.value);
  $("rateVal").textContent = `${v.toFixed(1)}×`;
  saveSettings({ rate: v });
});
$("pitch").addEventListener("input", (e) => {
  const v = Number(e.target.value);
  $("pitchVal").textContent = v.toFixed(1);
  saveSettings({ pitch: v });
});
$("voice").addEventListener("change", (e) => saveSettings({ voiceURI: e.target.value }));

init();
