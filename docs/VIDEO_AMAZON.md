# Video: Amazon search happy path (1–2 min)

Marketing shot list alignment.

**Preferred climax:** Codex using **agent-browser** (Chrome with Site2WebMCP loaded) on Amazon — Slava confirmed this works.

**Backup climax:** DevTools / Model Context Tool Inspector `executeTool`.

**Still true:** ChatGPT’s *built-in* browser does not load the Chrome extension; don’t imply that path. Do imply Codex + agent-browser + extension.

## Prep (off camera)

1. Chrome with `chrome://flags/#enable-webmcp-testing` → **Enabled** → relaunch.
2. `chrome://extensions` → Load unpacked → `extension/` (reload after pulls).
3. Optional: install **WebMCP - Model Context Tool Inspector**.
4. Open `https://www.amazon.ca/` (or amazon.com). Stay on HTTPS homepage or SERP.

## On camera (~90s)

| Time | Shot |
|------|------|
| 0:00–0:08 | Title card Site2WebMCP |
| 0:08–0:24 | Amazon.ca + extension popup showing tools (search / search_query / cart) |
| 0:24–0:32 | Highlight nav search form / tool chips |
| 0:32–0:48 | **Codex + agent-browser** lists tools → search workflow → SERP updates (backup: DevTools `executeTool`) |
| 0:48–0:56 | Optional: site has no first-party WebMCP, tools still present |
| 0:56–1:12 | End card |

Prefer **search** over add-to-cart (login/CAPTCHA risk).

## Codex + agent-browser

1. Chrome has WebMCP flag + unpacked Site2WebMCP.
2. Tell Codex to use **agent-browser** (not the ChatGPT built-in browser).
3. Open Amazon.ca in that Chrome session; ask Codex to list WebMCP/site tools and search (e.g. electric kettle).
4. On camera: show Codex turn + Amazon updating — zero site-authored WebMCP.

## DevTools snippets (page console on amazon.ca)

List tools:

```js
const ctx = document.modelContext ?? navigator.modelContext;
const tools = await ctx.getTools();
console.table(tools.map(t => ({ name: t.name, description: t.description })));
```

Run search (imperative fill+submit — most reliable for video):

```js
const ctx = document.modelContext ?? navigator.modelContext;
const tools = await ctx.getTools();
const search = tools.find(t => /search_query/i.test(t.name)) || tools.find(t => /search/i.test(t.name));
console.log("using", search?.name);
await ctx.executeTool(search, JSON.stringify({ q: "electric kettle" }));
```

If `executeTool` wants the tool name string on your build:

```js
await ctx.executeTool(search.name, JSON.stringify({ q: "electric kettle" }));
```

Expect navigation or SERP update. Tools re-register after load — popup **Rescan** if needed.

## Risks

- Flag off / insecure context → no `modelContext`.
- Amazon A/B DOM → if `#twotabsearchtextbox` missing, search_query won’t appear; check popup.
- Full page navigation clears in-page tools until content script runs again (fine for video).
- Bilingual amazon.ca labels — tool names still hostname-based.
