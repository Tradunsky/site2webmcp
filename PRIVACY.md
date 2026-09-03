# Privacy policy — Site2WebMCP

**Last updated:** 3 September 2026

Site2WebMCP is a Chrome extension that reads the **page you already have open** and registers [WebMCP](https://developer.chrome.com/docs/ai/webmcp/imperative-api) tools from visible forms and actions. It is made by [Slava Tradunsky](https://github.com/Tradunsky).

## What the extension accesses

On each http(s) tab, the extension’s content scripts look at the **current page’s DOM** (forms, buttons, links, labels) so it can expose those as in-page tools for an AI agent in that same tab.

It also sees the tab’s hostname so the popup can show which site you are on and how many tools were found.

## What is not collected

Site2WebMCP does **not**:

- send page content, tool lists, or browsing history to a server
- create an account, analytics, crash reports, or advertising IDs
- sell or share data with third parties
- store your browsing history or page contents on disk (there is no `storage` permission)

All discovery and tool registration happen **locally in the tab**. Closing the tab discards that in-memory state.

## Permissions, in plain language

- **Host access (`http://*/*`, `https://*/*`)** — the extension must run on whatever site you (or an agent using your browser) have open. It does not crawl the web in the background.
- **`scripting`** — injects a small page-world script so tools can be registered on `document.modelContext`. Isolated content scripts cannot call that API.

Uninstalling the extension removes the scripts. Nothing remains on our servers because there are none.

## Children

The extension is not directed at children and does not knowingly collect data from children.

## Changes

If this policy changes, the date at the top will be updated in this file: [PRIVACY.md](https://github.com/Tradunsky/site2webmcp/blob/master/PRIVACY.md).

## Contact

Questions: open an issue on [github.com/Tradunsky/site2webmcp](https://github.com/Tradunsky/site2webmcp).
