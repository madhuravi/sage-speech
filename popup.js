// popup.js — controls the active Google tab's content script and persists settings.

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

// Send a message to the content script; resolve to null on any failure
// (e.g. the content script isn't injected on this page).
async function send(action, extra = {}) {
  const tab = await activeTab();
  if (!tab || !onGoogleSearch(tab)) return null;
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

// ---- Settings persistence --------------------------------------------------
const defaults = { rate: 1.0, pitch: 1.0, voiceURI: "" };

function loadSettings() {
  return new Promise((res) => chrome.storage.sync.get(defaults, res));
}
function saveSettings(patch) {
  chrome.storage.sync.set(patch);
}

// ---- Init ------------------------------------------------------------------
async function init() {
  const tab = await activeTab();
  if (!onGoogleSearch(tab)) {
    setStatus("Not a Google search page.");
    hintEl.textContent =
      "This works on Google search results that show an AI summary at the top.";
    ["play", "pause", "resume", "stop"].forEach((id) => ($(id).disabled = true));
    return;
  }

  // Populate voices from the content script (they live in the page context).
  const voicesResp = await send("voices");
  const voiceSel = $("voice");
  const settings = await loadSettings();

  if (voicesResp && voicesResp.voices && voicesResp.voices.length) {
    // If the user hasn't picked a voice, show the one the extension auto-selects.
    const selectedURI = settings.voiceURI || voicesResp.defaultVoiceURI || "";
    for (const v of voicesResp.voices) {
      const opt = document.createElement("option");
      opt.value = v.voiceURI;
      const isAuto = !settings.voiceURI && v.voiceURI === voicesResp.defaultVoiceURI;
      opt.textContent = `${v.name} (${v.lang})${isAuto ? " — auto" : ""}`;
      if (v.voiceURI === selectedURI) opt.selected = true;
      voiceSel.appendChild(opt);
    }
  } else {
    const opt = document.createElement("option");
    opt.textContent = "System default";
    voiceSel.appendChild(opt);
  }

  // Restore slider state.
  $("rate").value = settings.rate;
  $("pitch").value = settings.pitch;
  $("rateVal").textContent = `${Number(settings.rate).toFixed(1)}×`;
  $("pitchVal").textContent = Number(settings.pitch).toFixed(1);

  // Current playback status + whether an overview exists.
  const st = await send("status");
  if (st) {
    reflect(st.status);
    if (!st.hasOverview) {
      setStatus("No AI summary detected on this page.");
    }
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
