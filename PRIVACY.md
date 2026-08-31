# Privacy Policy — Sage Speech

_Last updated: 2026-08-31_

## Summary

**Sage does not collect, store, transmit, or share any personal data.** Everything
the extension does happens locally, inside your own browser.

## What the extension accesses

- **The text of the on-page AI summary on Google search results pages.** When you
  press "Listen," the extension reads that text from the page you are already
  viewing and passes it to your browser's built-in text-to-speech engine
  (the Web Speech API) so it can be spoken aloud.

## What the extension stores

- **Your preferences only** — chosen voice, speaking rate, and pitch — saved using
  Chrome's `storage.sync` so they persist across sessions. These settings never
  leave Google's sync of your own browser profile and are not accessible to us.

## What the extension does NOT do

- It does **not** send page content, search queries, or any other data to us or to
  any third-party server. There is no analytics, no tracking, and no network
  request made by this extension.
- The speech is generated **on your device** by your operating system / browser.
  No audio or text is uploaded anywhere.

## Permissions and why they are needed

- `activeTab` / `scripting` — to read the summary text on the search page you have open.
- `storage` — to remember your voice, rate, and pitch preferences.
- Host access to `google.com` search pages — so the extension only runs where the
  summary appears.

## Third parties

None. The extension uses no external services.

## Contact

Questions about this policy can be directed to the developer at the email listed on
the Chrome Web Store listing.

---

_Sage is an independent tool and is not affiliated with, endorsed by, or sponsored
by Google. "Google" and related feature names are trademarks of Google LLC and are
used here only descriptively to indicate where the extension works._
