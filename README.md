# Site2WebMCP

**Chrome extension that turns the current page’s forms and primary actions into [WebMCP](https://developer.chrome.com/docs/ai/webmcp/imperative-api) tools** so AI agents can use real sites without a hand-written MCP server or pixel clicking.

MIT licensed. Works on any `http(s)` page where WebMCP is available (Chrome flag / capable agent browser).

## What it does

1. **Declarative (forms)** — annotates discoverable `<form>` elements with `toolname` / `tooldescription` / `toolautosubmit` when safe.
2. **Imperative (actions)** — registers tools via `document.modelContext.registerTool` for CTAs, search fill+submit, `click_link`, `find_in_page`, and related page-derived actions.

Tools are discovered from the live DOM (then deduped). Same-action controls with different entities become one tool with a parameter enum when possible.

## Install (developers)

1. Enable `chrome://flags/#enable-webmcp-testing` → relaunch Chrome.
2. `chrome://extensions` → Developer mode → **Load unpacked** → select the `extension/` folder.
3. Open any website → click the extension popup to see discovered tools.

Or install from the Chrome Web Store once published.

## Connect an agent

See **[docs/CONNECT_AGENT.md](docs/CONNECT_AGENT.md)** (also linked from the extension popup).

Short version: point **Codex at agent-browser/Chrome** with the extension loaded; or debug with the WebMCP flag + DevTools `getTools()` / `executeTool`.

## Verify in DevTools

```js
const ctx = document.modelContext ?? navigator.modelContext;
if (!ctx) {
  console.warn("WebMCP unavailable — check the flag + secure context (https or localhost)");
} else {
  const tools = await ctx.getTools();
  console.table(tools.map((t) => ({ name: t.name, description: t.description })));
}
```

## Repo layout

```
extension/     # Chrome MV3 extension (store package root)
shared/        # discover.js source of truth → copied to extension/lib/
docs/          # agent connect + video notes
LICENSE        # MIT
```

After editing `shared/discover.js`, copy it to `extension/lib/discover.js` before packing.

## Packaging for Chrome Web Store

Zip the **contents** of `extension/` so `manifest.json` is at the zip root. Do not include `docs/`, `.git`, or media assets unless you intend to ship them.

## Troubleshooting

- **`modelContext` undefined:** enable the WebMCP testing flag; use `https://` or `http://localhost` (not `0.0.0.0`).
- **No tools:** reload the page after loading/updating the extension; check the popup toggle.
- **Duplicate search tools:** update to latest; discovery dedupes `search` vs `search_query` after scan.
