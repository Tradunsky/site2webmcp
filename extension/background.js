/**
 * Site2WebMCP service worker — inject MAIN-world bridge, register tools, badge.
 */
"use strict";

const BRIDGE_FILE = "page-bridge.js";

async function setBadge(tabId, count) {
  try {
    const text = count > 0 ? String(count) : "";
    await chrome.action.setBadgeText({ tabId, text });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#0B57D0" });
  } catch (_) {
    /* tab may be gone */
  }
}

async function injectBridge(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [BRIDGE_FILE],
      world: "MAIN",
    });
    return true;
  } catch (err) {
    console.warn("[site2webmcp] bridge inject failed", err);
    return false;
  }
}

/**
 * Dispatch register/clear inside the PAGE world so the bridge receives it.
 * (Isolated-world CustomEvents do not cross into MAIN.)
 */
async function pageDispatch(tabId, eventName, detail) {
  await injectBridge(tabId);
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (name, detailObj) => {
      window.dispatchEvent(new CustomEvent(name, { detail: detailObj }));
    },
    args: [eventName, detail || {}],
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab && sender.tab.id;

  if (message.type === "inject-bridge") {
    if (tabId == null) {
      sendResponse({ ok: false, error: "no_tab" });
      return;
    }
    injectBridge(tabId).then((ok) => sendResponse({ ok }));
    return true;
  }

  if (message.type === "register-actions") {
    if (tabId == null) {
      sendResponse({ ok: false, error: "no_tab" });
      return;
    }
    pageDispatch(tabId, "site2webmcp:register", { actions: message.actions || [] })
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === "clear-actions") {
    if (tabId == null) {
      sendResponse({ ok: false, error: "no_tab" });
      return;
    }
    pageDispatch(tabId, "site2webmcp:clear", {})
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === "tools-updated") {
    if (tabId != null) {
      setBadge(tabId, message.count || 0);
    }
    sendResponse({ ok: true });
    return;
  }

  if (message.type === "popup-scan") {
    chrome.tabs.query({ active: true, currentWindow: true }).then(async (tabs) => {
      const tab = tabs[0];
      if (!tab || tab.id == null) {
        sendResponse({ ok: false, error: "no_tab" });
        return;
      }
      try {
        const res = await chrome.tabs.sendMessage(tab.id, { type: "rescan" });
        sendResponse(res || { ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      }
    });
    return true;
  }
});

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "loading") {
    setBadge(tabId, 0);
  }
});

console.info("[site2webmcp] background ready");
