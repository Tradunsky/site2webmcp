/**
 * Site2WebMCP agent-inject — MAIN-world scan + register bootstrap for agents.
 *
 * Prerequisites (inject in order from the Pages origin):
 *   1) vendor/discover.js
 *   2) vendor/page-bridge.js
 *   3) agent-inject.js  (this file)
 *
 * Mirrors extension/content.js scan payload, then dispatches the same
 * CustomEvents page-bridge.js already listens for (site2webmcp:register).
 * Does not fork discover or bridge logic.
 */
(function () {
  "use strict";

  const DEBOUNCE_MS = 550;
  const S2WM_ATTR_RE = /^data-s2wm|^toolname$|^tooldescription$|^toolautosubmit$|^toolparamdescription$/i;

  if (window.__site2webmcpAgentInjectInstalled) {
    if (typeof window.__site2webmcpAgentRescan === "function") {
      window.__site2webmcpAgentRescan();
    }
    return;
  }
  window.__site2webmcpAgentInjectInstalled = true;

  let debounceTimer = null;
  let applying = false;
  let lastSummary = null;

  function buildImperativePayload(plan) {
    return (plan.actions || []).map((a) => ({
      toolName: a.toolName,
      toolDescription: a.toolDescription,
      selector: a.selector,
      buttonText: a.buttonText,
      confirm: a.confirm,
      kind: a.kind,
      readOnly: a.readOnly,
      inputSchema: a.inputSchema,
      targets: a.targets,
      fieldName: a.fieldName,
      inputSelector: a.inputSelector,
      formSelector: a.formSelector,
      submitSelector: a.submitSelector,
    }));
  }

  function scanAndApply() {
    if (!window.Site2WebMCP) {
      console.warn(
        "[site2webmcp] agent-inject: Site2WebMCP missing — inject vendor/discover.js first"
      );
      return null;
    }
    if (!window.__site2webmcpBridgeInstalled) {
      console.warn(
        "[site2webmcp] agent-inject: page bridge missing — inject vendor/page-bridge.js before this file"
      );
    }
    if (applying) return lastSummary;
    applying = true;
    try {
      Site2WebMCP.clearAnnotations();
      const plan = Site2WebMCP.annotateForms(Site2WebMCP.discover());
      lastSummary = Site2WebMCP.summarize(plan);
      const actions = buildImperativePayload(plan);

      window.dispatchEvent(
        new CustomEvent("site2webmcp:register", { detail: { actions } })
      );

      try {
        document.documentElement.dataset.s2wmAgentInject = "1";
      } catch (_) {}

      console.info(
        `[site2webmcp] agent-inject: annotated ${plan.forms.length} form(s), imperative ${plan.actions.length} action(s)`
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
      try {
        scanAndApply();
      } catch (err) {
        console.warn("[site2webmcp] agent-inject scan failed", err);
      }
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

  window.__site2webmcpAgentRescan = function () {
    return scanAndApply();
  };

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

  window.addEventListener("popstate", () => scheduleScan());
  window.addEventListener("hashchange", () => scheduleScan());

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => scheduleScan());
  } else {
    scheduleScan();
  }

  console.info("[site2webmcp] agent-inject ready");
})();
