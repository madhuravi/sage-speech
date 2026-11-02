// background.js — service worker.
// Manages the per-site opt-in for the "read highlighted text" feature.
//
// The whole flow is driven by permission events rather than popup messages: the
// popup only calls chrome.permissions.request()/remove() (which need its user
// gesture), and Chrome may close the popup the moment its prompt appears. So all
// the real work — registering the content script and injecting it into already-
// open tabs — happens here in response to permissions.onAdded / onRemoved, which
// fire reliably no matter what the popup does.

const SETTINGS_KEY = "enabledOrigins"; // array of origins, e.g. "https://example.com"

// Deterministic, id-safe script id for an origin.
function scriptId(origin) {
  return "sel_" + origin.replace(/[^a-zA-Z0-9]/g, "_");
}

function originPattern(origin) {
  return origin.replace(/\/+$/, "") + "/*";
}

function patternToOrigin(pattern) {
  return pattern.replace(/\/\*$/, "");
}

async function getEnabled() {
  const { [SETTINGS_KEY]: list } = await chrome.storage.local.get(SETTINGS_KEY);
  return Array.isArray(list) ? list : [];
}

async function setEnabled(list) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: [...new Set(list)] });
}

async function isRegistered(origin) {
  const scripts = await chrome.scripting.getRegisteredContentScripts({
    ids: [scriptId(origin)],
  });
  return scripts.length > 0;
}

async function registerSite(origin) {
  if (await isRegistered(origin)) return;
  await chrome.scripting.registerContentScripts([
    {
      id: scriptId(origin),
      matches: [originPattern(origin)],
      js: ["speech.js", "selection.js"],
      runAt: "document_idle",
      persistAcrossSessions: true,
    },
  ]);
}

async function unregisterSite(origin) {
  if (await isRegistered(origin)) {
    await chrome.scripting.unregisterContentScripts({ ids: [scriptId(origin)] });
  }
}

// Inject into tabs of this origin that are already open, so the feature works
// immediately without a reload. Newly loaded pages get it via the registration.
async function injectOpenTabs(origin) {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: originPattern(origin) });
  } catch (_) {
    return;
  }
  for (const tab of tabs) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["speech.js", "selection.js"],
      });
    } catch (_) {
      /* some pages block injection; they'll load it on next navigation */
    }
  }
}

async function enableOrigin(origin) {
  await registerSite(origin);
  const list = await getEnabled();
  await setEnabled([...list, origin]);
  await injectOpenTabs(origin);
}

async function disableOrigin(origin) {
  await unregisterSite(origin);
  const list = await getEnabled();
  await setEnabled(list.filter((o) => o !== origin));
}

// A permission was granted (from the popup's Enable button). Set the site up.
chrome.permissions.onAdded.addListener(async (perms) => {
  for (const pattern of perms.origins || []) {
    await enableOrigin(patternToOrigin(pattern));
  }
});

// A permission was revoked (popup's Remove button, or Chrome's own settings).
// Tear the site down so we never run where we're no longer allowed.
chrome.permissions.onRemoved.addListener(async (perms) => {
  for (const pattern of perms.origins || []) {
    await disableOrigin(patternToOrigin(pattern));
  }
});

// Host patterns the manifest already requires (not opt-in sites).
const REQUIRED_HOSTS = [
  "https://www.google.com/*",
  "https://www.google.co.uk/*",
];

// Reconcile everything to the real source of truth — the permissions Chrome
// actually holds. Runs on install and browser startup. This also recovers
// "orphaned" grants (permission granted but never recorded, e.g. if the popup
// closed mid-flow before this worker existed) and drops sites whose permission
// was revoked while the worker was asleep.
async function reconcile() {
  const all = await chrome.permissions.getAll();
  const optIn = (all.origins || [])
    .filter((p) => !REQUIRED_HOSTS.includes(p))
    .map(patternToOrigin);

  const stored = await getEnabled();
  for (const origin of stored) {
    if (!optIn.includes(origin)) await unregisterSite(origin);
  }
  for (const origin of optIn) {
    await registerSite(origin);
    await injectOpenTabs(origin); // reloaded extension → re-arm already-open tabs
  }
  await setEnabled(optIn);
}

chrome.runtime.onInstalled.addListener(reconcile);
chrome.runtime.onStartup.addListener(reconcile);

// Fallback for the popup: when the user clicks Enable but the permission was
// already granted, Chrome shows no prompt and fires no onAdded event — so the
// popup asks us to make sure the site is set up.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.action === "ensureSite" && msg.origin) {
    enableOrigin(msg.origin).then(() => sendResponse({ ok: true }));
    return true; // async response
  }
  return false;
});
