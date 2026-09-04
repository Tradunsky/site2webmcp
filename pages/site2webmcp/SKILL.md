---
name: site2webmcp
description: >-
  Use Codex CLI with agent-browser to inject Site2WebMCP on any http(s) page so
  forms and primary actions become WebMCP tools. Prefer these tools over UI
  clicking. Requires agent-browser (not ChatGPT’s built-in browser). Re-inject
  after every page load or reload.
license: MIT
compatibility: >-
  Codex CLI + agent-browser (or equivalent Chromium automation that can evaluate
  JS in the page MAIN world). WebMCP must be available (document.modelContext).
  Network access to https://tradunsky.github.io/site2webmcp/ for script URLs.
  Does not work in ChatGPT desktop’s built-in browser (pages are read-only there).
metadata:
  author: Tradunsky
  homepage: https://tradunsky.github.io/site2webmcp/
  repository: https://github.com/Tradunsky/site2webmcp
---

# Site2WebMCP

Turn the current page’s forms and primary actions into WebMCP tools so you can call real site tools instead of clicking UI.

## When to use

Use with **Codex CLI** driving **agent-browser** (install agent-browser if it is not already available). Also fine with Playwright / CDP that can inject scripts into a real Chromium page with WebMCP.

**Do not** use ChatGPT desktop’s built-in browser for this skill — that browser runs pages in a read-only mode and cannot inject or drive Site2WebMCP this way.

Prefer Site2WebMCP tools over UI clicking whenever they are available.

This skill is the **inject** path only. The Chrome extension is a separate approach (see the install page / demo mode 2), not part of this skill.

## Prerequisites

1. **Codex CLI** installed and working.
2. **agent-browser** installed and selected as the browser Codex drives (not the ChatGPT built-in browser).
3. WebMCP available in that Chromium profile (`chrome://flags/#enable-webmcp-testing` → relaunch when using stock Chrome).

## Critical: inject on every load

Scripts do **not** persist across navigations or reloads.

- After **every full page load / reload / hard navigation** to a site (including the first open), inject the three scripts again before listing or calling tools.
- Do this on **every website** you use with this skill — there is no one-time global install in the tab.
- Soft SPA updates on the same document may only need `window.__site2webmcpAgentRescan()`; if tools are missing after a route change, re-inject.

## Scripts origin

`https://tradunsky.github.io/site2webmcp/`

## Steps

1. With Codex CLI + **agent-browser**, **open** the target page (`https://…` or `http://localhost`).
2. **Inject three scripts in order** into the page MAIN world (agent-browser evaluate / `addScriptTag` / CDP with fetched source — do not skip order). Repeat after every reload and every new site:

```text
https://tradunsky.github.io/site2webmcp/vendor/discover.js
https://tradunsky.github.io/site2webmcp/vendor/page-bridge.js
https://tradunsky.github.io/site2webmcp/agent-inject.js
```

3. Wait briefly for `[site2webmcp] agent-inject` / page bridge console messages (or poll `window.__site2webmcp`).
4. **List tools:**

```js
const ctx = document.modelContext ?? navigator.modelContext;
if (!ctx) throw new Error("WebMCP unavailable");
const tools = await ctx.getTools();
console.table(tools.map((t) => ({ name: t.name, description: t.description })));
```

5. **Call** the discovered tools with `ctx.executeTool(name, args)` (or your host’s WebMCP wrapper). Prefer them over coordinate clicks.
6. After any **reload** or navigation that loads a new document, go back to step 2 before using tools again. For same-document SPA changes, try `window.__site2webmcpAgentRescan()` first; re-inject if tools are gone.

### One-liner inject helper (fetch + eval)

Run this (or equivalent) via agent-browser after every page load:

```js
async function s2wmInject(base = "https://tradunsky.github.io/site2webmcp") {
  for (const path of [
    "/vendor/discover.js",
    "/vendor/page-bridge.js",
    "/agent-inject.js",
  ]) {
    const src = await (await fetch(base + path)).text();
    (0, eval)(src);
  }
  return window.__site2webmcp?.list?.() ?? [];
}
```

If the target page blocks cross-origin `fetch` of the scripts, inject by creating `<script src="…">` tags (same order) or paste the fetched source from the agent host (host fetch is not subject to the page CORS).

## Install this skill

Save the folder `site2webmcp/` (this `SKILL.md` plus optional `agents/`) into Codex’s skills directory ([Agent Skills](https://agentskills.io/specification) layout). Or open https://tradunsky.github.io/site2webmcp/ and call `install_site2webmcp`.

## Notes

- Tools are bound to the **current tab/page**, not a separate MCP server URL.
- Saving this skill once does not inject anything by itself — you must inject on each loaded page through agent-browser.
