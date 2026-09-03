# Connect an AI agent to Site2WebMCP tools

WebMCP tools are **bound to the web page** in the agent’s browser tab. There is no separate MCP server URL to paste into Cursor/Claude connector settings.

## Codex + agent-browser (confirmed)

Codex **can** use tools this extension registers on live sites (e.g. Amazon, Google) if it drives **agent-browser** / Chrome where Site2WebMCP is loaded. It **cannot** see those tools in ChatGPT’s built-in browser (Chrome extensions do not run there).

## What works today

| Client | How tools appear | Notes |
|--------|------------------|-------|
| **Codex + agent-browser (Chrome + extension)** | Page WebMCP from Site2WebMCP | Preferred path for live-site demos. |
| **Chrome + WebMCP flag** | DevTools / Model Context Tool Inspector | Great for debugging. |
| **ChatGPT desktop → built-in browser** | Only if the **page** itself registers WebMCP | Extension does not load here. |
| **Classic MCP connectors** (stdio / SSE) | **Do not see** these tools | Different protocol surface. |

## Checklist — Chrome + extension

1. Enable `chrome://flags/#enable-webmcp-testing` → relaunch.
2. Load unpacked (or install from Chrome Web Store) the Site2WebMCP extension.
3. Open any `https://` site (or `http://localhost`).
4. DevTools on that page:

```js
const ctx = document.modelContext ?? navigator.modelContext;
const tools = await ctx.getTools();
console.table(tools.map(t => ({ name: t.name, description: t.description })));
```

5. Optional: Chrome Web Store **WebMCP - Model Context Tool Inspector**.

## Checklist — Codex

1. Chrome has WebMCP flag + Site2WebMCP loaded.
2. Tell Codex to use **agent-browser** (not ChatGPT’s built-in browser).
3. Open the target site; ask Codex to list site/WebMCP tools and run a short workflow (search, click_link, etc.).

## If tools are empty

- Flag off / not relaunched after enabling.
- Insecure context (`http://0.0.0.0` or plain LAN IP) — use `https://` or `localhost`.
- Extension disabled on that tab.
- Content script not injected — reload the page after installing/updating.
