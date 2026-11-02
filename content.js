// content.js — runs on Google search result pages.
// Responsibilities:
//   1. Locate the "AI Overview" block (best-effort, resilient to Google's markup churn).
//   2. Inject an inline "Listen" button next to the overview title.
//   3. Speak the overview text via the shared speech module (speech.js).
//   4. Respond to commands from the popup (play / pause / resume / stop / status).

(() => {
  "use strict";

  const { synth, speakText, statusOf } = window.__sageSpeech;

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
  // 2. Speak the overview
  // ---------------------------------------------------------------------------
  async function speak() {
    const text = getOverviewText();
    if (!text) {
      flashButton("No summary found");
      return { ok: false, reason: "not-found" };
    }
    await speakText(text, {
      onstart: () => updateButton("playing"),
      onend: () => updateButton("idle"),
      onerror: () => updateButton("idle"),
    });
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // 3. Inline button UI
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
    btn.textContent = msg;
    setTimeout(() => updateButton(statusOf()), 1800);
  }

  // ---------------------------------------------------------------------------
  // 4. Wait for the (async, lazy-loaded) overview, then show the button
  // ---------------------------------------------------------------------------
  const observer = new MutationObserver(() => {
    ensureButton();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  ensureButton(); // in case it's already present

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
        // Report the intended state directly: synth.pause() is async, so
        // statusOf() often still reads "playing" here and leaves the popup's
        // Resume button disabled until a second click.
        sendResponse({ status: "paused" });
        break;
      case "resume":
        synth.resume();
        updateButton("playing");
        sendResponse({ status: "playing" });
        break;
      case "stop":
        synth.cancel();
        updateButton("idle");
        sendResponse({ status: "idle" });
        break;
      case "status":
        sendResponse({ status: statusOf(), hasOverview: !!getOverviewText() });
        break;
      default:
        sendResponse({ error: "unknown-action" });
    }
    return false;
  });
})();
