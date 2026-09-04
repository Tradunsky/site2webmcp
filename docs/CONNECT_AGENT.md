# Connect an AI agent to Site2WebMCP tools

WebMCP tools are **bound to the web page** in the agent’s browser tab. There is no separate MCP server URL to paste into Cursor/Claude connector settings.

## Demo modes

1. **Codex CLI + Skill + agent-browser** — install the `site2webmcp` skill, drive **agent-browser** (not ChatGPT’s built-in browser), inject discover → page-bridge → agent-inject on each target page after every load.
2. **Chrome extension + agent-browser** — load `extension/`, use agent-browser/Chrome with the WebMCP flag. Matches the [demo video](https://www.youtube.com/watch?v=JejjEiZ4h3c).

**Not supported:** ChatGPT desktop’s built-in browser — pages run read-only there; it cannot load the extension or run this skill’s inject path.

## Install page

https://tradunsky.github.io/site2webmcp/

That page registers `install_site2webmcp`, `get_inject_snippet`, and `get_extension_install` when WebMCP is enabled. Use it to pull the skill and inject URLs.

## Codex CLI + agent-browser (required for the skill)

1. Install **agent-browser** and point **Codex CLI** at it.
2. Enable WebMCP in that Chromium profile (`chrome://flags/#enable-webmcp-testing` → relaunch when using stock Chrome).
3. Either:
   - **Skill / inject:** install `pages/site2webmcp/` and inject the three Pages scripts on each loaded page, or
   - **Extension:** load unpacked `extension/` so tools appear without inject.

## What works today

| Client | How tools appear | Notes |
|--------|------------------|-------|
| **Codex CLI + agent-browser + skill (inject)** | Pages scripts → WebMCP | Demo mode 1. Re-inject after every reload. |
| **Codex CLI + agent-browser + extension** | Extension content scripts | Demo mode 2 / video path. |
| **Chrome + WebMCP flag** | DevTools / Tool Inspector | Debugging. |
| **ChatGPT desktop built-in browser** | **Does not work** | Read-only pages; no extension; no inject skill. |
| **Classic MCP connectors** (stdio / SSE) | **Do not see** these tools | Different protocol surface. |

## Skill install (Codex CLI)

1. Open https://tradunsky.github.io/site2webmcp/ and call `install_site2webmcp`, **or** copy [`pages/site2webmcp/`](../pages/site2webmcp/) / https://tradunsky.github.io/site2webmcp/site2webmcp/SKILL.md
2. Save the folder as `site2webmcp/` (must contain `SKILL.md`) in Codex’s skills directory — [Agent Skills](https://agentskills.io/specification) layout.
3. Ensure **agent-browser** is installed and used by Codex CLI.
4. On each target page, after every full load, inject in order:

```text
https://tradunsky.github.io/site2webmcp/vendor/discover.js
https://tradunsky.github.io/site2webmcp/vendor/page-bridge.js
https://tradunsky.github.io/site2webmcp/agent-inject.js
```

5. List WebMCP tools and prefer them over UI clicking.

## Checklist — Chrome + extension (demo mode 2)

1. Enable `chrome://flags/#enable-webmcp-testing` → relaunch.
2. Load unpacked (or install from Chrome Web Store) the Site2WebMCP extension from **`extension/`**.
3. Point Codex CLI at **agent-browser** / Chrome with that profile.
4. Open any `https://` site (or `http://localhost`).
5. DevTools (optional):

```js
const ctx = document.modelContext ?? navigator.modelContext;
const tools = await ctx.getTools();
console.table(tools.map(t => ({ name: t.name, description: t.description })));
```

## Checklist — Codex CLI + skill (demo mode 1)

1. Install agent-browser; configure Codex CLI to use it.
2. Install the Site2WebMCP skill.
3. Enable the WebMCP flag in the agent-browser Chromium profile.
4. Open the target site; inject the three scripts; list tools; run a short workflow.

## If tools are empty

- Using ChatGPT’s built-in browser instead of agent-browser.
- Flag off / not relaunched after enabling.
- Insecure context (`http://0.0.0.0` or plain LAN IP) — use `https://` or `localhost`.
- Extension path — reload the page after installing/updating.
- Inject path — confirm all three scripts ran in MAIN world (`window.Site2WebMCP`, `window.__site2webmcpBridgeInstalled`, `window.__site2webmcpAgentInjectInstalled`); re-inject after reload.
