/**
 * Site2WebMCP install page — registers WebMCP tools on THIS page for agents
 * that land here (install skill / get inject snippet / extension instructions).
 */
(function () {
  "use strict";

  const PAGES_ORIGIN = "https://tradunsky.github.io/site2webmcp";
  const SKILL_URL = PAGES_ORIGIN + "/site2webmcp/SKILL.md";
  const INJECT_URL = PAGES_ORIGIN + "/agent-inject.js";
  const DISCOVER_URL = PAGES_ORIGIN + "/vendor/discover.js";
  const BRIDGE_URL = PAGES_ORIGIN + "/vendor/page-bridge.js";

  let skillMarkdownCache = null;
  let controller = null;

  function getModelContext() {
    return document.modelContext || navigator.modelContext || null;
  }

  function toolResult(payload) {
    const text = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
    return {
      content: [{ type: "text", text }],
      structuredContent: typeof payload === "object" ? payload : { text },
      toString() {
        return text;
      },
    };
  }

  async function loadSkillMarkdown() {
    if (skillMarkdownCache) return skillMarkdownCache;
    try {
      const res = await fetch(new URL("site2webmcp/SKILL.md", location.href).href, { cache: "no-cache" });
      if (res.ok) {
        skillMarkdownCache = await res.text();
        return skillMarkdownCache;
      }
    } catch (_) {}
    const el = document.getElementById("skill-fallback");
    if (el) {
      skillMarkdownCache = el.textContent || "";
      return skillMarkdownCache;
    }
    return "# Site2WebMCP\n\nSee " + SKILL_URL;
  }

  function injectSnippet() {
    return [
      "// Site2WebMCP — inject in MAIN world, in this order:",
      "// 1) " + DISCOVER_URL,
      "// 2) " + BRIDGE_URL,
      "// 3) " + INJECT_URL,
      "",
      "async function site2webmcpInject(base = " + JSON.stringify(PAGES_ORIGIN) + ") {",
      "  const paths = ['/vendor/discover.js', '/vendor/page-bridge.js', '/agent-inject.js'];",
      "  for (const path of paths) {",
      "    const src = await (await fetch(base + path)).text();",
      "    (0, eval)(src);",
      "  }",
      "  return window.__site2webmcp?.list?.() ?? [];",
      "}",
      "",
      "// Or add <script src> tags in the same order.",
      "// agent-inject entry: " + INJECT_URL,
    ].join("\n");
  }

  function extensionInstructions() {
    return [
      "Chrome extension install (optional human path)",
      "",
      "1. Enable chrome://flags/#enable-webmcp-testing → Relaunch Chrome.",
      "2. chrome://extensions → Developer mode → Load unpacked → select the repo's extension/ folder.",
      "3. Or install from the Chrome Web Store once published.",
      "4. Open any https:// site (or http://localhost); click the Site2WebMCP popup to see tools.",
      "",
      "Repo: https://github.com/Tradunsky/site2webmcp",
      "Extension path in repo: extension/",
      "",
      "Note: Use Codex CLI + agent-browser (or plain Chrome).",
      "ChatGPT desktop built-in browser is read-only and is not supported.",
    ].join("\n");
  }

  function setStatus(kind, message) {
    const el = document.getElementById("webmcp-status");
    if (!el) return;
    el.dataset.kind = kind;
    el.textContent = message;
  }

  async function registerInstallTools() {
    const ctx = getModelContext();
    const banner = document.getElementById("webmcp-banner");
    if (!ctx || typeof ctx.registerTool !== "function") {
      if (banner) banner.hidden = false;
      setStatus(
        "warn",
        "WebMCP not available on this page. Enable chrome://flags/#enable-webmcp-testing and relaunch, then reload. Skill text below still works for copy-paste."
      );
      return { ok: false, reason: "no_model_context" };
    }
    if (banner) banner.hidden = true;

    if (controller) {
      try {
        controller.abort();
      } catch (_) {}
    }
    controller = new AbortController();
    const { signal } = controller;

    const tools = [
      {
        name: "install_site2webmcp",
        description:
          "Install the Site2WebMCP agent skill for Codex CLI + agent-browser. Returns skill markdown and inject instructions.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute: async () => {
          const skill = await loadSkillMarkdown();
          return toolResult({
            ok: true,
            skillMarkdown: skill,
            skillUrl: SKILL_URL,
            pagesOrigin: PAGES_ORIGIN,
            instructions: [
              "Save as a skill folder site2webmcp/SKILL.md (Agent Skills standard). Use with Codex CLI + agent-browser.",
              "On each target page, inject discover.js → page-bridge.js → agent-inject.js from " + PAGES_ORIGIN,
              "Then list WebMCP tools and prefer them over UI clicking.",
            ].join("\n"),
          });
        },
      },
      {
        name: "get_inject_snippet",
        description:
          "Return the JS snippet and Pages URLs to inject Site2WebMCP (discover + page-bridge + agent-inject) into any page the agent controls.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute: async () => {
          return toolResult({
            ok: true,
            pagesOrigin: PAGES_ORIGIN,
            urls: {
              discover: DISCOVER_URL,
              pageBridge: BRIDGE_URL,
              agentInject: INJECT_URL,
            },
            snippet: injectSnippet(),
            order: [DISCOVER_URL, BRIDGE_URL, INJECT_URL],
          });
        },
      },
      {
        name: "get_extension_install",
        description:
          "Short instructions for installing the Site2WebMCP Chrome extension (load unpacked or store).",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute: async () => {
          return toolResult({
            ok: true,
            text: extensionInstructions(),
            extensionPath: "extension/",
            repo: "https://github.com/Tradunsky/site2webmcp",
            flag: "chrome://flags/#enable-webmcp-testing",
          });
        },
      },
    ];

    const registered = [];
    for (const t of tools) {
      try {
        await ctx.registerTool(
          {
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            annotations: t.annotations,
            execute: t.execute,
          },
          { signal }
        );
        registered.push(t.name);
      } catch (err) {
        console.warn("[site2webmcp] registerTool failed", t.name, err);
      }
    }

    setStatus(
      "ok",
      "WebMCP tools registered on this page: " + registered.join(", ")
    );
    console.info("[site2webmcp] install-page tools:", registered);
    return { ok: true, registered };
  }

  async function hydrateSkillPanel() {
    const pre = document.getElementById("skill-body");
    if (!pre) return;
    const fallback = document.getElementById("skill-fallback");
    if (fallback && fallback.textContent && fallback.textContent.trim()) {
      pre.textContent = fallback.textContent;
    }
    const md = await loadSkillMarkdown();
    if (md) pre.textContent = md;
  }

  function wireCopyButtons() {
    document.querySelectorAll("[data-copy]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const sel = btn.getAttribute("data-copy");
        const target = sel ? document.querySelector(sel) : null;
        const text = target ? target.textContent : "";
        try {
          await navigator.clipboard.writeText(text);
          const prev = btn.textContent;
          btn.textContent = "Copied";
          setTimeout(() => {
            btn.textContent = prev;
          }, 1200);
        } catch (_) {
          btn.textContent = "Copy failed";
        }
      });
    });
  }

  function boot() {
    wireCopyButtons();
    hydrateSkillPanel().catch(() => {});
    registerInstallTools().catch((err) => {
      console.warn("[site2webmcp] install register failed", err);
      setStatus("warn", "Could not register WebMCP tools: " + String(err));
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
