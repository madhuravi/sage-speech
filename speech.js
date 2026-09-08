// speech.js — shared Web Speech helpers, loaded before every other content
// script. It exposes a small API on window.__sageSpeech (content scripts of the
// same extension share an isolated world, so the other scripts can read it).
//
// Responsibilities: load the user's saved settings, rank/choose a voice, speak
// arbitrary text, and report playback status. UI lives in the other scripts.

(() => {
  "use strict";
  if (window.__sageSpeech) return; // idempotent — may be injected more than once

  const synth = window.speechSynthesis;

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

  // Speak `text`, replacing anything currently playing. Callbacks are optional.
  async function speakText(text, { onstart, onend, onerror } = {}) {
    synth.cancel(); // clear anything queued
    const settings = await loadSettings();

    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = settings.rate;
    utter.pitch = settings.pitch;
    const voice = pickVoice(settings.voiceURI);
    if (voice) utter.voice = voice;

    utter.onend = () => onend && onend();
    utter.onerror = () => onerror && onerror();

    synth.speak(utter);
    if (onstart) onstart();
  }

  function statusOf() {
    if (synth.speaking && synth.paused) return "paused";
    if (synth.speaking) return "playing";
    return "idle";
  }

  window.__sageSpeech = { synth, speakText, statusOf };
})();
