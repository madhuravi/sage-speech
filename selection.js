// selection.js — the "read highlighted text" feature.
// Injected only on sites the user has explicitly enabled (see background.js).
// When the user selects text, a small floating 🔊 bubble appears next to it;
// clicking it reads the selection aloud via the shared speech module.

(() => {
  "use strict";
  if (window.__sageSelection) return; // injected once per frame
  window.__sageSelection = true;

  const S = window.__sageSpeech;
  const synth = S.synth;

  let currentText = ""; // the selection captured when the bubble was shown

  // --- Floating bubble (isolated in a shadow root so page CSS can't touch it) ---
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;z-index:2147483647;top:0;left:0;display:none;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      button {
        all: unset;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: #788d63;
        color: #fff;
        font: 15px/1 system-ui, Arial, sans-serif;
        cursor: pointer;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        user-select: none;
      }
      button:hover { background: #6b7f57; }
    </style>
    <button type="button" title="Read aloud">🔊</button>
  `;
  const bubble = root.querySelector("button");

  function render(state) {
    if (state === "playing") { bubble.textContent = "⏸"; bubble.title = "Pause"; }
    else if (state === "paused") { bubble.textContent = "▶"; bubble.title = "Resume"; }
    else { bubble.textContent = "🔊"; bubble.title = "Read aloud"; }
  }

  function showBubble(text, rect) {
    currentText = text;
    // Position just below the end of the selection, clamped to the viewport.
    const left = Math.min(rect.left, window.innerWidth - 40);
    const top = Math.min(rect.bottom + 6, window.innerHeight - 40);
    host.style.left = `${Math.max(4, left)}px`;
    host.style.top = `${Math.max(4, top)}px`;
    host.style.display = "block";
    synth.cancel(); // a fresh selection starts fresh
    render("idle");
  }

  function hideBubble() {
    host.style.display = "none";
  }

  // Attach the host once the DOM body exists.
  function mount() {
    (document.body || document.documentElement).appendChild(host);
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });

  bubble.addEventListener("mousedown", (e) => {
    // Prevent this click from collapsing the current text selection.
    e.preventDefault();
  });
  bubble.addEventListener("click", (e) => {
    e.stopPropagation();
    const st = S.statusOf();
    if (st === "playing") {
      synth.pause();
      render("paused");
    } else if (st === "paused") {
      synth.resume();
      render("playing");
    } else if (currentText) {
      S.speakText(currentText, {
        onstart: () => render("playing"),
        onend: () => { render("idle"); if (selectionEmpty()) hideBubble(); },
        onerror: () => { render("idle"); if (selectionEmpty()) hideBubble(); },
      });
    }
  });

  function selectionEmpty() {
    const sel = window.getSelection();
    return !sel || sel.isCollapsed || !sel.toString().trim();
  }

  // --- React to the user changing their selection ---
  function onSelectionChanged(e) {
    // Ignore interactions with our own bubble.
    if (e && e.composedPath && e.composedPath().includes(host)) return;

    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : "";

    if (text) {
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (rect && (rect.width || rect.height)) showBubble(text, rect);
      return;
    }

    // No selection: hide the bubble unless we're mid-playback (keep the control).
    if (S.statusOf() === "idle") hideBubble();
  }

  document.addEventListener("mouseup", onSelectionChanged);
  document.addEventListener("keyup", (e) => {
    // Keyboard selection (Shift+arrows, Ctrl/Cmd+A).
    if (e.shiftKey || e.key === "a" || e.key === "A") onSelectionChanged(e);
  });
  // The bubble is viewport-fixed, so it drifts from the text on scroll — hide it
  // (unless something is playing, so the pause/resume control stays reachable).
  window.addEventListener(
    "scroll",
    () => { if (S.statusOf() === "idle") hideBubble(); },
    { passive: true }
  );
})();
