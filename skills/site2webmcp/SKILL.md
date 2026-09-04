---
name: site2webmcp
description: >-
  Install and use Site2WebMCP on any http(s) page you control: inject discover,
  page-bridge, and agent-inject so WebMCP tools appear for forms and CTAs.
  Prefer these tools over UI clicking in Codex, ChatGPT desktop, Playwright, or CDP.
---

# Site2WebMCP

Turn the current page’s forms and primary actions into WebMCP tools so you can call real site tools instead of clicking UI.

## When to use

Any `http(s)` page where you control a Chromium browser that supports script injection and WebMCP (`document.modelContext` / `navigator.modelContext`), including:

- Codex + agent-browser / Playwright / CDP
- ChatGPT desktop browser (script injection path — Chrome extensions do **not** load there)
- Any agent that can evaluate JS in the page MAIN world

Prefer Site2WebMCP tools over UI clicking whenever they are available.

## Demo modes

**Mode 1 — ChatGPT desktop + Skill:** install this skill, then inject the three Pages scripts on each target page (extensions do not load in ChatGPT’s built-in browser).

**Mode 2 — Chrome extension + agent-browser (Codex):** load the Site2WebMCP `extension/` in Chrome and drive **agent-browser** — same path as the [demo video](https://www.youtube.com/watch?v=JejjEiZ4h3c). No inject required.

---

## Pages origin

Install + vendor scripts live at:

`https://tradunsky.github.io/site2webmcp/`

## Mode 1 steps — inject (ChatGPT desktop / any inject-capable agent)

1. **Open** the target page (`https://…` or `http://localhost`).
2. **Ensure WebMCP** is available in that browser profile (`chrome://flags/#enable-webmcp-testing` → relaunch when using stock Chrome).
3. **Inject three scripts in order** into the page MAIN world (evaluate / `addScriptTag` / CDP `Runtime.evaluate` with the fetched source — do not skip order):

```text
https://tradunsky.github.io/site2webmcp/vendor/discover.js
https://tradunsky.github.io/site2webmcp/vendor/page-bridge.js
https://tradunsky.github.io/site2webmcp/agent-inject.js
```

4. Wait briefly for `[site2webmcp] agent-inject` / page bridge console messages (or poll `window.__site2webmcp`).
5. **List tools:**

```js
const ctx = document.modelContext ?? navigator.modelContext;
if (!ctx) throw new Error("WebMCP unavailable");
const tools = await ctx.getTools();
console.table(tools.map((t) => ({ name: t.name, description: t.description })));
```

6. **Call** the discovered tools with `ctx.executeTool(name, args)` (or your host’s WebMCP wrapper). Prefer them over coordinate clicks.
7. On SPA navigations, re-run step 3 or call `window.__site2webmcpAgentRescan()` if already injected.

### One-liner inject helper (fetch + eval)

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

If the target page blocks cross-origin `fetch` of the scripts, inject by creating `<script src="…">` tags (same order) or paste the fetched source from your agent host (agent host fetch is not subject to the page CORS).

## Mode 2 details — Chrome extension

For interactive Chrome with the extension loaded unpacked / from the store:

1. Enable `chrome://flags/#enable-webmcp-testing` → relaunch.
2. Load unpacked from this repo’s `extension/` folder (or install from Chrome Web Store when published).
3. Open any site; tools appear automatically — no script injection needed.

The extension is optional when the agent can inject the three Pages scripts above.

## Notes

- Tools are bound to the **current tab/page**, not a separate MCP server URL.
- ChatGPT desktop built-in browser does not run Chrome extensions — use the inject path there.
- Codex should drive **agent-browser** (or equivalent) with WebMCP enabled, then inject or use the extension.
