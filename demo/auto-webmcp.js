/**
 * Demo auto-WebMCP — same discovery + registration path as the extension,
 * so judges hitting the live URL get tools without installing the extension.
 *
 * If the Chrome extension is active on this page, skip imperative registerTool
 * and annotateForms (extension owns discovery) to avoid duplicate tools.
 *
 * Understands grouped action descriptors (targets + product enum, list_products,
 * view_cart enrichment). DemoShop is only used inside execute after DOM discovery.
 */
(function () {
  "use strict";

  let controller = null;
  let applying = false;
  const registeredNames = [];
  const DEBOUNCE_MS = 550;
  const S2WM_ATTR_RE = /^data-s2wm|^toolname$|^tooldescription$|^toolautosubmit$|^toolparamdescription$/i;

  function extensionActive() {
    const root = document.documentElement;
    if (root && root.dataset && root.dataset.s2wmExtension === "1") return true;
    if (window.__site2webmcpBridgeInstalled) return true;
    if (root && root.hasAttribute("data-s2wm-extension")) return true;
    return false;
  }

  function getModelContext() {
    return document.modelContext || navigator.modelContext || null;
  }

  function toolResult(payload) {
    const text = typeof payload === "string" ? payload : JSON.stringify(payload);
    return {
      content: [{ type: "text", text }],
      toString() {
        return text;
      },
    };
  }

  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function demoCart() {
    try {
      if (window.DemoShop && typeof DemoShop.getCart === "function") return DemoShop.getCart();
    } catch (_) {}
    return null;
  }

  function listProductsPayload() {
    try {
      if (window.DemoShop && typeof DemoShop.listProducts === "function") {
        return { ok: true, products: DemoShop.listProducts() };
      }
    } catch (_) {}
    if (window.Site2WebMCP && typeof Site2WebMCP.scrapeProducts === "function") {
      return { ok: true, products: Site2WebMCP.scrapeProducts() };
    }
    return { ok: true, products: [] };
  }

  function resolveTarget(action, args) {
    const targets = action.targets || [];
    if (!targets.length) return null;
    const key = args && args.product != null ? String(args.product).trim() : "";
    if (!key) return { error: "Missing required argument: product" };
    const lower = key.toLowerCase();
    const hit = targets.find(
      (t) =>
        String(t.id).toLowerCase() === lower ||
        String(t.label || "").toLowerCase() === lower
    );
    if (!hit) {
      return {
        error: `Unknown product: ${key}`,
        options: targets.map((t) => ({ id: t.id, label: t.label })),
      };
    }
    return { target: hit };
  }

  async function clickSelector(selector) {
    if (!selector) return { ok: false, error: "No selector" };
    const el = document.querySelector(selector);
    if (!el) return { ok: false, error: `Element not found: ${selector}` };
    el.click();
    await delay(50);
    return { ok: true, selector };
  }

  async function executeAction(action, args) {
    const needsConfirm = !!action.confirm;
    if (needsConfirm && !(args && args.confirm === true)) {
      return toolResult({
        ok: false,
        error: "Confirmation required. Call again with { confirm: true }.",
      });
    }

    const kind = action.kind || "click";

    if (kind === "list_products") {
      return toolResult(listProductsPayload());
    }

    if (kind === "view_cart") {
      const cart = demoCart();
      if (cart) {
        return toolResult({ ok: true, cart, source: "page_api" });
      }
      const clicked = await clickSelector(action.selector);
      if (!clicked.ok) return toolResult(clicked);
      return toolResult({
        ok: true,
        clicked: action.buttonText || action.toolName,
        cart: demoCart(),
      });
    }

    if (action.targets && action.targets.length) {
      const resolved = resolveTarget(action, args);
      if (resolved.error) return toolResult({ ok: false, ...resolved });
      const target = resolved.target;

      const clicked = await clickSelector(target.selector);
      if (clicked.ok) {
        return toolResult({
          ok: true,
          product: target.label || target.id,
          productId: target.id,
          selector: target.selector,
          cart: demoCart(),
        });
      }

      try {
        if (kind === "add_to_cart" && window.DemoShop && typeof DemoShop.addToCart === "function") {
          const result = DemoShop.addToCart(target.id);
          return toolResult({ ok: true, product: target.label || target.id, ...result, via: "page_api_fallback" });
        }
      } catch (_) {}

      return toolResult(clicked);
    }

    const clicked = await clickSelector(action.selector);
    if (!clicked.ok) return toolResult(clicked);
    return toolResult({
      ok: true,
      clicked: action.buttonText || action.toolName,
      cart: demoCart(),
    });
  }

  async function registerImperative(actions, signal) {
    const ctx = getModelContext();
    if (!ctx || typeof ctx.registerTool !== "function") {
      console.info(
        "[site2webmcp demo] modelContext missing — enable chrome://flags/#enable-webmcp-testing (localhost is a secure context)."
      );
      return;
    }

    for (const action of actions) {
      if (signal.aborted) break;
      const inputSchema =
        action.inputSchema ||
        (action.confirm
          ? {
              type: "object",
              properties: {
                confirm: {
                  type: "boolean",
                  description: "Set true to confirm this action.",
                },
              },
              required: ["confirm"],
              additionalProperties: false,
            }
          : { type: "object", properties: {}, additionalProperties: false });

      try {
        await ctx.registerTool(
          {
            name: action.toolName,
            description: action.toolDescription,
            inputSchema,
            annotations: {
              readOnlyHint: !!action.readOnly,
              untrustedContentHint: true,
            },
            execute: async (args) => executeAction(action, args),
          },
          { signal }
        );
        registeredNames.push(action.toolName);
      } catch (err) {
        console.warn("[site2webmcp demo] register failed", action.toolName, err);
      }
    }
  }

  async function apply() {
    if (!window.Site2WebMCP) {
      console.warn("[site2webmcp demo] discover.js missing");
      return;
    }
    if (applying) return;
    applying = true;
    try {
      if (extensionActive()) {
        window.__site2webmcpDemo = {
          plan: null,
          summary: { toolCount: 0, tools: [], note: "extension active — demo registration skipped" },
          list: () => [],
          extensionActive: true,
          async nativeTools() {
            const ctx = getModelContext();
            return ctx && ctx.getTools ? ctx.getTools() : [];
          },
        };
        console.info("[site2webmcp demo] extension active — skipping annotateForms + registerTool");
        return;
      }

      if (controller) {
        try {
          controller.abort();
        } catch (_) {}
        await Promise.resolve();
      }
      controller = new AbortController();
      registeredNames.length = 0;

      Site2WebMCP.clearAnnotations();
      const plan = Site2WebMCP.annotateForms(Site2WebMCP.discover());
      await registerImperative(plan.actions, controller.signal);

      const summary = Site2WebMCP.summarize(plan);
      console.info(
        `[site2webmcp demo] declarative forms=${plan.forms.length}, imperative=${plan.actions.length}`,
        summary.tools.map((t) => t.name)
      );

      window.__site2webmcpDemo = {
        plan,
        summary,
        list: () => registeredNames.slice(),
        extensionActive: false,
        async nativeTools() {
          const ctx = getModelContext();
          return ctx && ctx.getTools ? ctx.getTools() : [];
        },
      };
    } finally {
      applying = false;
    }
  }

  let t = null;
  function schedule() {
    if (applying) return;
    clearTimeout(t);
    t = setTimeout(() => {
      apply().catch((e) => console.warn(e));
    }, DEBOUNCE_MS);
  }

  function mutationsAreNoise(mutations) {
    if (!mutations || !mutations.length) return false;
    return mutations.every((m) => {
      if (m.type === "attributes") {
        const name = m.attributeName || "";
        return S2WM_ATTR_RE.test(name);
      }
      if (m.type === "characterData") return true;
      return false;
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", schedule);
  } else {
    schedule();
  }

  const obs = new MutationObserver((mutations) => {
    if (mutationsAreNoise(mutations)) return;
    schedule();
  });
  obs.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      "hidden",
      "aria-hidden",
      "data-s2wm",
      "data-s2wm-id",
      "toolname",
      "tooldescription",
      "toolautosubmit",
      "toolparamdescription",
    ],
  });
})();
