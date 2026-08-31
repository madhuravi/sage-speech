// content.js — runs on Google search result pages.
// Responsibilities:
//   1. Locate the "AI Overview" block (best-effort, resilient to Google's markup churn).
//   2. Inject a floating "Listen" button when an overview is present.
//   3. Speak the overview text via the Web Speech API.
//   4. Respond to commands from the popup (play / pause / resume / stop / status).

(() => {
  "use strict";

  const synth = window.speechSynthesis;
  let currentUtterance = null;

  // ---------------------------------------------------------------------------
  // 1. Finding the AI Overview text
  // ---------------------------------------------------------------------------
  // Google renders the AI Overview with obfuscated, frequently-changing class
  // names, so we anchor on stable-ish signals instead: the visible "AI Overview"
  // label and ARIA hints. We collect a few candidate strategies and take the
  // first that yields a reasonable amount of text.

  function normalize(text) {
    return (text || "")
      .replace(/\s+/g, " ")
      .replace(/\bAI Overview\b/gi, "")
      .replace(/\bShow more\b/gi, "")
      .replace(/\bShow less\b/gi, "")
      .trim();
  }

  // Returns the element whose visible text is exactly "AI Overview" — the title.
  // Used both to extract the body text and to anchor the Listen button.
  function findTitleEl() {
    const nodes = document.querySelectorAll("h1, h2, h3, span, div, strong");
    for (const el of nodes) {
      if (el.textContent.trim().toLowerCase() === "ai overview") return el;
    }
    return null;
  }

  function byLabel() {
    // Anchor on the title, then walk up to an ancestor holding the body copy.
    const title = findTitleEl();
    if (!title) return "";
    let container = title;
    for (let i = 0; i < 6 && container.parentElement; i++) {
      container = container.parentElement;
      const txt = normalize(container.innerText);
      if (txt.length > 120) return txt;
    }
    return "";
  }

  function byAriaLabel() {
    const el = document.querySelector(
      '[aria-label*="AI Overview" i], [aria-label*="AI-generated" i]'
    );
    if (el) {
      const txt = normalize(el.innerText);
      if (txt.length > 80) return txt;
    }
    return "";
  }

  function byHeadingRegion() {
    // Some layouts wrap the overview in a role="complementary" or a labelled region.
    const regions = document.querySelectorAll(
      '[role="complementary"], [role="region"], [data-attrid]'
    );
    for (const r of regions) {
      const hay = (r.getAttribute("aria-label") || r.innerText || "").toLowerCase();
      if (hay.includes("ai overview")) {
        const txt = normalize(r.innerText);
        if (txt.length > 120) return txt;
      }
    }
    return "";
  }

  function getOverviewText() {
    const strategies = [byLabel, byAriaLabel, byHeadingRegion];
    for (const strat of strategies) {
      try {
        const txt = strat();
        if (txt && txt.length > 80) return txt;
      } catch (_) {
        /* keep trying other strategies */
      }
    }
    return "";
  }

  // ---------------------------------------------------------------------------
  // 2. Speech control
  // ---------------------------------------------------------------------------
  async function loadSettings() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(
          { rate: 1.0, pitch: 1.0, voiceURI: "" },
          (v) => resolve(v)
        );
      } catch (_) {
        resolve({ rate: 1.0, pitch: 1.0, voiceURI: "" });
      }
    });
  }

  // Rank a voice by likely quality. Higher is better. Used only for the default
  // choice — an explicit user selection in the popup always wins.
  function scoreVoice(v) {
    const name = (v.name || "").toLowerCase();
    const lang = (v.lang || "").toLowerCase();
    let s = 0;

    // Language: strongly prefer English; en-US edges out other English locales.
    if (/^en(-|_|$)/.test(lang)) s += 100;
    if (/^en[-_]us/.test(lang)) s += 10;

    // Quality tiers, best first. macOS "Premium"/"Enhanced" and neural/Siri
    // voices are far more natural than the legacy defaults.
    if (name.includes("premium")) s += 120;
    else if (name.includes("enhanced")) s += 90;
    if (name.includes("neural")) s += 90;
    if (name.includes("siri")) s += 80;
    if (name.includes("natural")) s += 70;
    // Chrome's bundled network voices ("Google US English") sound good too.
    if (name.includes("google")) s += 60;

    // Penalize the tinny legacy voices.
    if (name.includes("compact")) s -= 80;
    if (name.includes("eloquence")) s -= 60;

    // Gentle nudge toward voices Google/Apple tend to ship as the nicer defaults.
    if (/(ava|zoe|evan|allison|samantha|jenny|aria|serena)/.test(name)) s += 15;

    return s;
  }

  function pickVoice(voiceURI) {
    const voices = synth.getVoices();
    if (!voices.length) return null;

    // An explicit user choice from the popup always takes precedence.
    if (voiceURI) {
      const match = voices.find((v) => v.voiceURI === voiceURI);
      if (match) return match;
    }

    // Otherwise pick the highest-scoring available voice.
    return voices.reduce((best, v) =>
      scoreVoice(v) > scoreVoice(best) ? v : best
    );
  }

  async function speak() {
    const text = getOverviewText();
    if (!text) {
      flashButton("No summary found");
      return { ok: false, reason: "not-found" };
    }

    synth.cancel(); // clear anything queued
    const settings = await loadSettings();

    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = settings.rate;
    utter.pitch = settings.pitch;
    const voice = pickVoice(settings.voiceURI);
    if (voice) utter.voice = voice;

    utter.onend = () => {
      currentUtterance = null;
      updateButton("idle");
    };
    utter.onerror = () => {
      currentUtterance = null;
      updateButton("idle");
    };

    currentUtterance = utter;
    synth.speak(utter);
    updateButton("playing");
    return { ok: true };
  }

  function statusOf() {
    if (synth.speaking && synth.paused) return "paused";
    if (synth.speaking) return "playing";
    return "idle";
  }

  // ---------------------------------------------------------------------------
  // 3. Floating button UI
  // ---------------------------------------------------------------------------
  let btn = null;

  function createButton() {
    const b = document.createElement("button");
    b.id = "aiov-listen-btn";
    b.type = "button";
    b.textContent = "🔊 Listen";
    Object.assign(b.style, {
      display: "inline-flex",
      alignItems: "center",
      verticalAlign: "middle",
      marginLeft: "10px",
      padding: "3px 12px",
      borderRadius: "16px",
      border: "none",
      background: "#788d63",
      color: "#fff",
      font: "500 13px/1.4 system-ui, Arial, sans-serif",
      cursor: "pointer",
      whiteSpace: "nowrap",
    });
    b.addEventListener("click", () => {
      const st = statusOf();
      if (st === "playing") {
        synth.pause();
        updateButton("paused");
      } else if (st === "paused") {
        synth.resume();
        updateButton("playing");
      } else {
        speak();
      }
    });
    return b;
  }

  // Insert (or re-insert) the button right after the "AI Overview" title.
  // Google re-renders this region, so the button can get detached — re-attach
  // whenever the title exists but our button isn't currently in the document.
  function ensureButton() {
    const title = findTitleEl();
    if (!title || !getOverviewText()) return;
    if (btn && document.contains(btn)) return;
    if (!btn) btn = createButton();
    title.insertAdjacentElement("afterend", btn);
    updateButton(statusOf());
  }

  function updateButton(state) {
    if (!btn) return;
    if (state === "playing") btn.textContent = "⏸ Pause";
    else if (state === "paused") btn.textContent = "▶ Resume";
    else btn.textContent = "🔊 Listen";
  }

  function flashButton(msg) {
    if (!btn) return;
    const prev = btn.textContent;
    btn.textContent = msg;
    setTimeout(() => updateButton(statusOf() === "idle" ? "idle" : statusOf()), 1800);
  }

  // ---------------------------------------------------------------------------
  // 4. Wait for the (async, lazy-loaded) overview, then show the button
  // ---------------------------------------------------------------------------
  const observer = new MutationObserver(() => {
    ensureButton();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  ensureButton(); // in case it's already present

  // Voices can load asynchronously.
  if (typeof synth.onvoiceschanged !== "undefined") {
    synth.onvoiceschanged = () => {};
  }

  // ---------------------------------------------------------------------------
  // 5. Popup <-> content messaging
  // ---------------------------------------------------------------------------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg && msg.action) {
      case "play":
        speak().then((r) => sendResponse({ status: statusOf(), ...r }));
        return true; // async response
      case "pause":
        synth.pause();
        updateButton("paused");
        sendResponse({ status: statusOf() });
        break;
      case "resume":
        synth.resume();
        updateButton("playing");
        sendResponse({ status: statusOf() });
        break;
      case "stop":
        synth.cancel();
        updateButton("idle");
        sendResponse({ status: "idle" });
        break;
      case "status":
        sendResponse({ status: statusOf(), hasOverview: !!getOverviewText() });
        break;
      case "voices": {
        const defaultVoice = pickVoice("");
        sendResponse({
          defaultVoiceURI: defaultVoice ? defaultVoice.voiceURI : "",
          voices: synth.getVoices().map((v) => ({
            name: v.name,
            lang: v.lang,
            voiceURI: v.voiceURI,
          })),
        });
        break;
      }
      default:
        sendResponse({ error: "unknown-action" });
    }
    return false;
  });
})();
