/**
 * Site2WebMCP content script — discover DOM tools, annotate forms, request
 * imperative MAIN-world registration via the background → page bridge.
 */
(function () {
  "use strict";

  // Marker so demo/auto-webmcp.js can detect the extension and skip duplicate registration.
  try {
    document.documentElement.dataset.s2wmExtension = "1";
  } catch (_) {}

  const DEBOUNCE_MS = 550;
  const S2WM_ATTR_RE = /^data-s2wm|^toolname$|^tooldescription$|^toolautosubmit$|^toolparamdescription$/i;
  let debounceTimer = null;
  let lastSummary = null;
  let enabled = true;
  let applying = false;

  async function loadEnabled() {
    try {
      const res = await chrome.runtime.sendMessage({ type: "get-enabled" });
      enabled = !res || res.enabled !== false;
    } catch (_) {
      enabled = true;
    }
    return enabled;
  }

  function buildImperativePayload(plan) {
    return (plan.actions || []).map((a) => ({
      toolName: a.toolName,
      toolDescription: a.toolDescription,
      selector: a.selector,
      buttonText: a.buttonText,
      confirm: a.confirm,
      kind: a.kind,
      inputSchema: a.inputSchema,
      targets: a.targets || [],
      readOnly: !!a.readOnly,
    }));
  }

  async function scanAndApply() {
    if (!window.Site2WebMCP) {
      console.warn("[site2webmcp] discover.js not loaded");
      return null;
    }
    if (applying) return lastSummary;
    applying = true;
    try {
      await loadEnabled();

      if (!enabled) {
        Site2WebMCP.clearAnnotations();
        try {
          await chrome.runtime.sendMessage({ type: "clear-actions" });
        } catch (_) {}
        lastSummary = {
          hostname: location.hostname,
          href: location.href,
          title: document.title,
          toolCount: 0,
          tools: [],
          enabled: false,
        };
        chrome.runtime.sendMessage({ type: "tools-updated", count: 0 }).catch(() => {});
        return lastSummary;
      }

      // Abort previous registrations (background clears then re-registers).
      // Microtask pause reduces races with in-flight registerTool.
      await Promise.resolve();

      Site2WebMCP.clearAnnotations();
      const plan = Site2WebMCP.annotateForms(Site2WebMCP.discover());
      lastSummary = Object.assign(Site2WebMCP.summarize(plan), { enabled: true });

      try {
        await chrome.runtime.sendMessage({
          type: "register-actions",
          actions: buildImperativePayload(plan),
        });
      } catch (err) {
        console.warn("[site2webmcp] register-actions failed", err);
      }

      chrome.runtime
        .sendMessage({ type: "tools-updated", count: plan.toolCount })
        .catch(() => {});

      console.info(
        `[site2webmcp] annotated ${plan.forms.length} form(s), imperative ${plan.actions.length} action(s)`
      );
      return lastSummary;
    } finally {
      applying = false;
    }
  }

  function scheduleScan() {
    if (applying) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      scanAndApply().catch((err) => console.warn("[site2webmcp] scan failed", err));
    }, DEBOUNCE_MS);
  }

  function mutationsAreNoise(mutations) {
    if (!mutations || !mutations.length) return false;
    return mutations.every((m) => {
      if (m.type === "attributes") {
        const name = m.attributeName || "";
        return S2WM_ATTR_RE.test(name);
      }
      if (m.type === "characterData") return true;
      return false;
    });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "rescan") {
      scanAndApply()
        .then((summary) => sendResponse({ ok: true, summary }))
        .catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }
    if (message.type === "get-summary") {
      sendResponse({ ok: true, summary: lastSummary });
      return;
    }
    if (message.type === "set-enabled") {
      enabled = !!message.enabled;
      scanAndApply()
        .then((summary) => sendResponse({ ok: true, summary }))
        .catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }
    if (message.type === "get-debug-snippet") {
      const snippet = `const ctx = document.modelContext ?? navigator.modelContext;
if (!ctx) { console.warn('WebMCP not available — enable chrome://flags/#enable-webmcp-testing'); }
else { const tools = await ctx.getTools(); console.table(tools.map(t => ({name:t.name, description:t.description}))); tools; }`;
      sendResponse({ ok: true, snippet });
      return;
    }
  });

  const observer = new MutationObserver((mutations) => {
    if (mutationsAreNoise(mutations)) return;
    scheduleScan();
  });
  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "hidden",
        "aria-hidden",
        "data-s2wm",
        "data-s2wm-id",
        "toolname",
        "tooldescription",
        "toolautosubmit",
        "toolparamdescription",
      ],
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => scheduleScan());
  } else {
    scheduleScan();
  }

  window.addEventListener("popstate", () => scheduleScan());
  window.addEventListener("hashchange", () => scheduleScan());
})();
