# Site2WebMCP

**Auto-expose any webpage’s forms and primary actions as [WebMCP](https://developer.chrome.com/docs/ai/webmcp/imperative-api) tools** so AI agents can use real site UI without a hand-written MCP server.

Chrome extension + shared DOM discovery heuristics + a localhost demo shop for the **OpenAI WebMCP Challenge** (deadline **Sep 3, 2026 1pm PT**).

## What it does

Site2WebMCP scans the live DOM and registers tools two ways:

1. **Declarative (preferred for forms)** — annotates `<form>` elements with `toolname`, `tooldescription`, and (for safe/search forms) `toolautosubmit`; fields get `toolparamdescription`. Chrome synthesizes tools natively.
2. **Imperative (buttons / non-form actions)** — injects a MAIN-world bridge that calls `document.modelContext.registerTool(...)` (fallback `navigator.modelContext`) for Add to cart / Checkout / Sign in style controls.

Agents then discover tools with `getTools()` and run them through the browser-mediated WebMCP APIs.

## Connect an AI agent

WebMCP is **in-page**, not a classic MCP connector. See **[docs/CONNECT_AGENT.md](docs/CONNECT_AGENT.md)** (also in the extension popup under **Connect an agent**).

Short version: open the demo in **ChatGPT desktop’s built-in browser** with model **Sol/Terra**, use **Site tools**, or debug in Chrome with the WebMCP flag + DevTools.

## Quick start (5 steps)

### 1. Enable WebMCP in Chrome

Open `chrome://flags/#enable-webmcp-testing` → **Enabled** → relaunch Chrome.

Secure context required: **HTTPS or `localhost`**.

### 2. Load the unpacked extension

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the `extension/` folder in this repo

### 3. Run the demo shop (live URL for judges)

```bash
cd demo
python -m http.server 8765
```

Open [http://localhost:8765](http://localhost:8765).

> **Use `localhost`, not `0.0.0.0` or a LAN IP.** WebMCP requires a [secure context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts). `http://0.0.0.0:8765` sets `isSecureContext === false`, so `document.modelContext` stays `undefined` even with the flag on.

The demo embeds the **same discovery logic** (`demo/discover.js` + `demo/auto-webmcp.js`), so tools appear even **without** the extension.

Optional helper:

```bash
python scripts/serve_demo.py
```

### 4. Verify tools in DevTools

On the demo page (or any http/https page with the extension), paste:

```js
const ctx = document.modelContext ?? navigator.modelContext;
if (!ctx) {
  console.warn("WebMCP unavailable — check the flag + secure context");
} else {
  const tools = await ctx.getTools();
  console.table(tools.map((t) => ({ name: t.name, description: t.description })));
  tools;
}
```

You should see tools such as `localhost_search`, `localhost_list_products`, `localhost_add_to_cart` (with a `product` enum), `localhost_view_cart`, and `localhost_checkout` (names depend on hostname + what the DOM exposes).

Execute one (after `getTools()`):

```js
const tools = await ctx.getTools();
const search = tools.find((t) => /search/i.test(t.name));
if (search) await ctx.executeTool(search, JSON.stringify({ q: "kettle", category: "kitchen" }));
```

Chrome also ships a **Model Context Tool Inspector** in DevTools when the flag is on.

### 5. Try with Codex / ChatGPT in-app browser

With the flag enabled and the demo (or extension) active, open the page in the ChatGPT / Codex browser surface and ask the agent to list page tools or search/add-to-cart. Prefer `localhost` or an HTTPS tunnel for the challenge live URL.

## Extension UI

Click the toolbar icon to:

- See hostname + discovered tool list
- Toggle enable/disable (clears annotations + aborts imperative registrations)
- Rescan the page
- Copy a DevTools debug snippet

Badge shows the tool count for the active tab.

## Architecture

```
shared/discover.js          # heuristics (source of truth)
extension/lib/discover.js   # copy for the MV3 package
demo/discover.js            # copy for the live demo
extension/
  manifest.json             # MV3
  content.js                # annotate forms + ask for imperative register
  background.js             # inject page-bridge.js (world: MAIN), badge
  page-bridge.js            # registerTool + AbortController lifecycle
  popup.*                   # tool list / toggle
demo/
  index.html + shop.js      # fake storefront
  auto-webmcp.js            # discovery + registration without extension
```

### Discovery heuristics (lean)

- Visible forms with ≥1 named text/search/email/number/select control
- Prefer search-like forms (`type=search`, `role=search`, search-ish action/labels)
- Tool names: `snake_case(hostname)_action` with numeric suffixes on collision
- Skip hidden / `aria-hidden` / zero-size nodes
- Cap ≈20 tools
- Login/password forms: allow fields in schema with clear descriptions; **no** `toolautosubmit`
- Destructive checkout/delete: no autosubmit; imperative clicks may require `{ confirm: true }`
- `MutationObserver` (debounced) re-runs on SPA DOM changes
- **Action-oriented tools (not one tool per SKU):** when many controls share the same action pattern (e.g. repeated “Add to cart” in product cards), they merge into **one** tool whose `product` enum is scraped from those cards’ ids/titles. Unique chrome (one cart icon, one checkout) stays a single non-parameterized tool. Nothing is registered from a built-in shop API — only from DOM matches.

## Python project

This repo is a `uv` project (`requires-python >= 3.14`) kept light — no runtime deps for the MVP. The useful artifacts are the extension + demo static files.

```bash
# optional
python scripts/serve_demo.py
```

## Challenge submission checklist

- [ ] Public GitHub repo
- [ ] Live demo URL (localhost for local judges, or HTTPS tunnel / hosted static)
- [ ] Short video: flag on → load extension or open demo → `getTools()` → agent uses a tool
- [ ] Mention Chrome flag + secure context in the write-up

## Roadmap (not in MVP)

- Mine same-origin JS/XHR for richer tool schemas
- Crawl docs / OpenAPI / sitemap for tool catalogs
- Honor `llms.txt` / site-declared MCP hints
- Per-origin allowlists and tighter confirmation UX

## Declarative-only note

On Chrome builds that fully implement the **declarative** form attributes, annotated forms alone can appear in `getTools()` without imperative `registerTool`. Button/link actions (Add to cart, etc.) still need the **imperative** path. Site2WebMCP always does both so agents get forms *and* primary actions.


## Troubleshooting

- **Duplicate tools on the demo page** (e.g. both `localhost_add_to_cart_N` and product-named add-to-cart, or two checkouts): the extension and `demo/auto-webmcp.js` both registered. Disable the extension on the demo tab **or** rely on the extension only (demo now skips registration when it detects `data-s2wm-extension="1"`). Reload after changing.
- **Amazon.ca only shows `search`**: declarative form attrs find the search box; product/cart actions need the **extension** imperative path. Reload the unpacked extension, then hard-reload the Amazon tab (`Ctrl/Cmd+Shift+R`). Expect grouped `add_to_cart` (asin/title enum when many cards; single-target on a product page), `buy_now`, and global `view_cart` — not one tool per SKU.
- **`modelContext` undefined**: use `http://localhost:…`, not `http://0.0.0.0:…` or a LAN IP (must be a secure context). Confirm `chrome://flags/#enable-webmcp-testing` is Enabled and Chrome was relaunched.
- **Tool count jitters across reloads**: should be much quieter now (stable `data-add` / `#add-to-cart-button` selectors + mutation noise filter). If it still flutters, ensure only one registrant (extension **or** demo) is active.

## License

MIT (or as specified by the challenge / repo owner).
