# Sage Speech

A Chrome extension that reads the **AI summary shown at the top of your Google
search results** aloud, using your browser's built-in text-to-speech (the Web
Speech API). No servers, no API keys, no data leaves your machine.

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

## How it works

- `content.js` runs on `google.com/search` pages, locates the summary text
  (anchoring on the on-page label and ARIA hints rather than fragile class names),
  and speaks it with `speechSynthesis`. It auto-selects the highest-quality voice
  installed on your system.
- `popup.html` / `popup.js` provide the control panel and persist settings via
  `chrome.storage.sync`.
- Everything runs **on your device**. See [PRIVACY.md](./PRIVACY.md).

## Publishing to the Chrome Web Store

This build is prepared for public listing:

- **Name** avoids Google trademarks and the branded feature name.
- **Disclaimer** of non-affiliation appears in the popup, README, and privacy policy.
- **Privacy policy** ([PRIVACY.md](./PRIVACY.md)) states the extension is fully
  local — you'll paste its contents (or host it) and link it in the listing.
- **Permissions** are minimal (`activeTab`, `scripting`, `storage`, Google search hosts).

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
├── content.js        # finds the summary, inline button, speech engine
├── popup.html        # control panel UI
├── popup.js          # popup logic + settings persistence
├── icons/            # sage-green speaker icon (16/48/128 + source SVG)
├── PRIVACY.md        # privacy policy (fully local)
└── README.md
```
