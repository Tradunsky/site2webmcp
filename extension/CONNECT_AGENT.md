# Connect an AI agent to Site2WebMCP tools

WebMCP tools are **bound to the web page** in the agent’s browser tab. There is no separate MCP server URL to paste into Cursor/Claude connector settings.

## Codex + agent-browser (confirmed)

Codex **can** use tools our extension registers on live sites (e.g. Amazon) if it drives **agent-browser** / Chrome where the extension is loaded. It **cannot** see those tools in ChatGPT’s built-in browser (extensions don’t run there).

## What works today

| Client | How tools appear | Notes |
|--------|------------------|-------|
| **Codex + agent-browser (Chrome + extension)** | Page WebMCP from Site2WebMCP | **Confirmed** on Amazon.ca. Prefer this for live-site demos. |
| **ChatGPT desktop → built-in browser** | Site tools only if the **page** registers them | Extension does **not** load here. Use demo `auto-webmcp.js` or site-native WebMCP. Sol/Terra. |
| **Chrome + WebMCP flag** | DevTools / Model Context Tool Inspector | Great for debugging; not a full agent loop unless you drive it. |
| **Classic MCP connectors** (stdio / SSE / Cursor MCP) | **Do not see** these tools | Different protocol surface. |

## Important: Chrome extension vs ChatGPT browser

The **Site2WebMCP Chrome extension does not run inside ChatGPT’s in-app browser**.

For a real agent test:

1. Serve the **demo** (`demo/` — includes `auto-webmcp.js` so tools register without the extension):
   ```bash
   cd demo && python -m http.server 8765
   ```
2. Open **`http://localhost:8765/`** in the **ChatGPT desktop built-in browser** (same machine). If localhost is blocked, tunnel/host the `demo/` folder on HTTPS and open that URL instead.
3. Confirm Site tools in the address bar (arrow / Site tools).
4. Ask Codex/ChatGPT to list tools and run a workflow (search → add to cart → view cart).

Use the extension when browsing in **Chrome** (Amazon, etc.) with the flag enabled — then verify with the Tool Inspector or DevTools `getTools()`.

## Checklist — ChatGPT / Codex

1. Update ChatGPT desktop to latest.
2. Model: **GPT-5.6 Sol** or **Terra**.
3. Settings → Browser → Permissions → **Enable site tools** (if present).
4. Open the demo (or other tool-exposing) URL in the **built-in** browser — not Chrome-via-ChatGPT.
5. Address bar → **Site tools** → **Available site tools**.
6. Prompt example:

```
List the site tools on this page. Then search for "kettle",
add Electric Kettle to the cart using site tools only, and summarize the cart.
```

## Checklist — Chrome debug

1. `chrome://flags/#enable-webmcp-testing` → Enabled → relaunch.
2. Load unpacked `extension/` (optional on the demo; required on arbitrary sites).
3. Open `http://localhost:8765/` (**localhost**, not `0.0.0.0`).
4. DevTools:

```js
const ctx = document.modelContext ?? navigator.modelContext;
console.table((await ctx.getTools()).map(t => ({ name: t.name, description: t.description })));
```

5. Optional: Chrome Web Store **WebMCP - Model Context Tool Inspector**.

## If Site tools are empty in ChatGPT

- Wrong browser surface (must be in-app browser).
- Wrong model (Luna) or Enterprise/Edu workspace.
- Page never registered tools (demo scripts blocked; or only the extension path was used in ChatGPT).
- `localhost` unreachable from the app — use an HTTPS tunnel.
- Secure context / origin issues on the page.

## Checkpoint

Code restore point for this architecture discussion: git commit `0605632` on branch `master` (“Checkpoint: DOM→WebMCP Chrome extension + demo shop”). Agent-connect docs land in the this docs tree + extension popup.
