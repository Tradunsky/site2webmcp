# Site2WebMCP

Turn the current page’s forms and primary actions into WebMCP tools so you can call real site tools instead of clicking UI.

## When to use

Any `http(s)` page where you control a Chromium browser that can **inject scripts** into the page MAIN world and where WebMCP is available (`document.modelContext` / `navigator.modelContext`), including:

- ChatGPT desktop (built-in browser)
- Codex / Playwright / CDP / agent-browser **via script inject**
- Any agent that can evaluate JS in the page

Prefer Site2WebMCP tools over UI clicking whenever they are available.

This skill is the **inject** path. The Chrome extension is a separate product path (documented on the install page), not part of this skill.

## Scripts origin

`https://tradunsky.github.io/site2webmcp/`

## Steps

1. **Open** the target page (`https://…` or `http://localhost`).
2. **Ensure WebMCP** is available in that browser profile (`chrome://flags/#enable-webmcp-testing` → relaunch when using stock Chrome).
3. **Inject three scripts in order** into the page MAIN world (evaluate / `addScriptTag` / CDP with fetched source — do not skip order):

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

## Notes

- Tools are bound to the **current tab/page**, not a separate MCP server URL.
- Re-inject after hard navigations; soft SPA updates may only need `__site2webmcpAgentRescan()`.

