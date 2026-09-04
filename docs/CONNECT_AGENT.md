# Connect an AI agent to Site2WebMCP tools

WebMCP tools are **bound to the web page** in the agent’s browser tab. There is no separate MCP server URL to paste into Cursor/Claude connector settings.

## Demo modes

1. **ChatGPT desktop + Skill** — open https://tradunsky.github.io/site2webmcp/, install the skill (`install_site2webmcp` or copy `site2webmcp/SKILL.md`), inject discover → page-bridge → agent-inject on each target page.
2. **Chrome extension + agent-browser (Codex)** — load `extension/`, use agent-browser/Chrome with the WebMCP flag. Matches the [demo video](https://www.youtube.com/watch?v=JejjEiZ4h3c).

## Install page

https://tradunsky.github.io/site2webmcp/

That page registers `install_site2webmcp`, `get_inject_snippet`, and `get_extension_install` when WebMCP is enabled. Use it to pull the skill and inject URLs.

## Codex + agent-browser (confirmed)

Codex **can** use tools this project registers on live sites (e.g. Amazon, Google) if it drives **agent-browser** / Chrome with either:

1. **Chrome extension** loaded (`extension/` unpacked), or
2. **Script inject** of the three Pages scripts (below) — same discover + bridge logic, no extension required.

It **cannot** see extension-registered tools in ChatGPT’s built-in browser (Chrome extensions do not run there). Use the **inject path** for ChatGPT desktop.

## What works today

| Client | How tools appear | Notes |
|--------|------------------|-------|
| **Codex + agent-browser (Chrome + extension)** | Page WebMCP from Site2WebMCP | Preferred for live-site demos with a persistent profile. |
| **Codex / Playwright / CDP (inject)** | Same tools via Pages scripts | No extension; re-inject after hard navigations. |
| **Chrome + WebMCP flag** | DevTools / Model Context Tool Inspector | Great for debugging. |
| **ChatGPT desktop → built-in browser** | Inject discover → page-bridge → agent-inject | Extension does not load here. |
| **Classic MCP connectors** (stdio / SSE) | **Do not see** these tools | Different protocol surface. |

## Skill install (Codex / ChatGPT desktop / Cursor)

1. Open https://tradunsky.github.io/site2webmcp/ and call `install_site2webmcp`, **or** copy the skill package from [`pages/site2webmcp/`](../pages/site2webmcp/) / https://tradunsky.github.io/site2webmcp/site2webmcp/SKILL.md
2. Save the folder as `site2webmcp/` (must contain `SKILL.md`) in your agent’s skills directory — [Agent Skills](https://agentskills.io/specification) layout used by ChatGPT, Codex, Claude, and compatible tools.
3. On each target page the agent controls, inject in order:

```text
https://tradunsky.github.io/site2webmcp/vendor/discover.js
https://tradunsky.github.io/site2webmcp/vendor/page-bridge.js
https://tradunsky.github.io/site2webmcp/agent-inject.js
```

4. List WebMCP tools and prefer them over UI clicking.

## Checklist — Chrome + extension

1. Enable `chrome://flags/#enable-webmcp-testing` → relaunch.
2. Load unpacked (or install from Chrome Web Store) the Site2WebMCP extension from **`extension/`** (path unchanged).
3. Open any `https://` site (or `http://localhost`).
4. DevTools on that page:

```js
const ctx = document.modelContext ?? navigator.modelContext;
const tools = await ctx.getTools();
console.table(tools.map(t => ({ name: t.name, description: t.description })));
```

5. Optional: Chrome Web Store **WebMCP - Model Context Tool Inspector**.

## Checklist — Codex

1. Chrome has WebMCP flag enabled.
2. Either load the Site2WebMCP extension **or** follow the skill’s inject steps.
3. Tell Codex to use **agent-browser** (not ChatGPT’s built-in browser) when using the extension path.
4. Open the target site; ask Codex to list site/WebMCP tools and run a short workflow (search, click_link, etc.).

## Checklist — ChatGPT desktop

1. Install the Site2WebMCP skill (from the install page or `pages/site2webmcp/SKILL.md`).
2. In the built-in browser, inject the three Pages scripts in order (extensions will not run).
3. List tools with `getTools()` / the product’s WebMCP UI and call them.

## If tools are empty

- Flag off / not relaunched after enabling.
- Insecure context (`http://0.0.0.0` or plain LAN IP) — use `https://` or `localhost`.
- Content script not injected — reload the page after installing/updating the extension.
- Inject path — confirm all three scripts ran in MAIN world (`window.Site2WebMCP`, `window.__site2webmcpBridgeInstalled`, `window.__site2webmcpAgentInjectInstalled`).
