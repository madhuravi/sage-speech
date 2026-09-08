# Sage Speech

A Chrome extension that reads text aloud using your browser's built-in
text-to-speech (the Web Speech API). It does two things:

- Reads the **AI summary shown at the top of your Google search results**.
- Reads **any text you highlight** on sites you explicitly enable — a small 🔊
  bubble appears next to your selection.

No servers, no API keys, no data leaves your machine.

> **Not affiliated with or endorsed by Google.** "Google" and related feature
> names are trademarks of Google LLC, used here only to describe where the
> extension works.

## Install (load unpacked)

1. Open `chrome://extensions` in Chrome.
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked** and select this folder.
4. Pin the extension from the puzzle-piece menu (optional).

## Use

1. Run a Google search that shows an AI summary at the top (e.g. a "what is…" question).
2. Either:
   - Click the sage **🔊 Listen** button next to the summary title, or
   - Open the extension popup and press **▶ Listen**.
3. Use **Pause / Resume / Stop**, and adjust **voice, speed, and pitch** in the popup.
   Those preferences are saved locally.

### Read highlighted text on any site

1. Open the extension popup on the site you want.
2. Under **Read highlighted text**, click **Enable on this site**. Chrome asks you
   to approve access to that one domain — the extension requests nothing up front.
3. Highlight any text on the page; a small sage **🔊** bubble appears next to it.
   Click it to read the selection, and click again to pause/resume.
4. Click **Disable on this site** any time to revoke that domain's access.

## How it works

- `speech.js` is a shared helper (voice ranking, settings, `speechSynthesis`
  playback) loaded before the other content scripts.
- `content.js` runs on `google.com/search` pages, locates the summary text
  (anchoring on the on-page label and ARIA hints rather than fragile class names),
  and speaks it. It auto-selects the highest-quality voice installed on your system.
- `selection.js` runs only on sites you've enabled; it shows the 🔊 bubble next to
  your selection and reads it.
- `background.js` (service worker) registers/unregisters `selection.js` per domain
  as you opt in or out, using **optional** host permissions granted one site at a time.
- `popup.html` / `popup.js` provide the control panel, the per-site toggle, and
  persist settings via `chrome.storage.sync`.
- Everything runs **on your device**. See [PRIVACY.md](./PRIVACY.md).

## Publishing to the Chrome Web Store

This build is prepared for public listing:

- **Name** avoids Google trademarks and the branded feature name.
- **Disclaimer** of non-affiliation appears in the popup, README, and privacy policy.
- **Privacy policy** ([PRIVACY.md](./PRIVACY.md)) states the extension is fully
  local — you'll paste its contents (or host it) and link it in the listing.
- **Permissions** are minimal: `activeTab`, `scripting`, `storage`, and the Google
  search hosts. Access to other sites is **optional** and requested one domain at a
  time only when you enable highlighted-text reading there.

Steps:

1. Register a Chrome Web Store developer account (one-time **$5** fee).
2. Zip the contents of this folder (not the parent) and upload it.
3. Fill in the listing: description, screenshots, category, and the **privacy
   policy link**. In the data-use section, declare that **no user data is collected
   or transmitted**.
4. Submit for review.

**Still your responsibility before a public launch:** the extension reads
Google-generated content from Google's page, which touches Google's Terms of
Service. Descriptive/nominative use of the feature name is generally acceptable,
but if you plan to publish widely — and especially if you ever monetize or add
cloud TTS — have a lawyer review the trademark and content-use angle. For personal
use or sharing the unpacked folder, none of this applies.

## Known limitations

- **Google changes its markup often.** If detection stops working, the selection
  heuristics in `content.js` (`byLabel`, `byAriaLabel`, `byHeadingRegion`) are
  where you'd adjust it.
- The summary loads asynchronously; the extension uses a `MutationObserver` to
  catch it, but very slow loads may need a second press.
- Voice quality depends on the voices your OS provides. Download an "Enhanced" or
  "Premium" system voice for the most natural result; the extension will prefer it
  automatically.

## Files

```
sage-speech/
├── manifest.json     # MV3 manifest
├── speech.js         # shared voice ranking + speechSynthesis playback
├── content.js        # finds the Google AI summary + inline Listen button
├── selection.js      # floating 🔊 bubble that reads highlighted text
├── background.js     # per-site opt-in for highlighted-text reading
├── popup.html        # control panel UI
├── popup.js          # popup logic, site toggle, settings persistence
├── icons/            # sage-green speaker icon (16/48/128 + source SVG)
├── PRIVACY.md        # privacy policy (fully local)
└── README.md
```
