/**
 * Site2WebMCP page bridge — runs in the PAGE MAIN world.
 * Registers imperative WebMCP tools via document.modelContext / navigator.modelContext.
 * Listens for CustomEvents from the content script (isolated world).
 *
 * Understands grouped action descriptors from discover.js:
 *  - targets[] + args.product → resolve & click matching selector
 *  - list_products → scrape visible product cards (DemoShop.listProducts if present)
 *  - view_cart → DemoShop.getCart() enrichment or click global cart control
 *  - inputSchema / readOnly passed through from the descriptor
 */
(function () {
  "use strict";

  if (window.__site2webmcpBridgeInstalled) return;
  window.__site2webmcpBridgeInstalled = true;

  const EVENT_REGISTER = "site2webmcp:register";
  const EVENT_CLEAR = "site2webmcp:clear";
  const EVENT_STATUS = "site2webmcp:status";
  const EVENT_STATUS_REPLY = "site2webmcp:status-reply";

  let controller = null;
  const registered = new Map(); // name -> meta

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

  function scrapeProductsFallback() {
    if (window.Site2WebMCP && typeof Site2WebMCP.scrapeProducts === "function") {
      return Site2WebMCP.scrapeProducts();
    }
    // Lightweight DOM scrape when discover.js is not in MAIN world
    const cards = Array.from(
      document.querySelectorAll(
        ".card, [data-asin], .product, .product-card, .product-tile, [data-component-type='s-search-result'], .s-result-item"
      )
    );
    const out = [];
    const seen = new Set();
    for (const card of cards) {
      const style = window.getComputedStyle(card);
      if (style && (style.display === "none" || style.visibility === "hidden")) continue;
      const id =
        card.getAttribute("data-add") ||
        card.getAttribute("data-asin") ||
        card.getAttribute("data-product-id") ||
        card.querySelector?.("[data-add]")?.getAttribute("data-add") ||
        null;
      const nameEl = card.querySelector("strong, h2, h3, .product-title, .product-name, #productTitle");
      const name = (nameEl && nameEl.textContent.trim().replace(/\s+/g, " ").slice(0, 80)) || "";
      if (!name && !id) continue;
      const key = id || name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const priceEl = card.querySelector(".price, .a-price .a-offscreen, [itemprop='price']");
      const price = priceEl ? priceEl.textContent.trim().replace(/\s+/g, " ").slice(0, 24) : null;
      const catEl = card.querySelector(".meta, .category, [itemprop='category']");
      const category = catEl ? catEl.textContent.trim().replace(/\s+/g, " ").slice(0, 40) : undefined;
      out.push({ id: id || key, name: name || String(id), price, category });
    }
    return out;
  }

  function listProductsPayload() {
    try {
      if (window.DemoShop && typeof DemoShop.listProducts === "function") {
        return { ok: true, products: DemoShop.listProducts() };
      }
    } catch (_) {}
    return { ok: true, products: scrapeProductsFallback() };
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
        selector: action.selector,
        href: location.href,
        title: document.title,
        cart: demoCart(),
      });
    }

    if (action.targets && action.targets.length) {
      const resolved = resolveTarget(action, args);
      if (resolved.error) return toolResult({ ok: false, ...resolved });
      const target = resolved.target;

      // Prefer DOM click for generality
      const clicked = await clickSelector(target.selector);
      if (clicked.ok) {
        // Optional enrichment after click (never registers tools by itself)
        let enrich = null;
        try {
          if (kind === "add_to_cart" && window.DemoShop && typeof DemoShop.getCart === "function") {
            enrich = DemoShop.getCart();
          }
        } catch (_) {}
        return toolResult({
          ok: true,
          product: target.label || target.id,
          productId: target.id,
          selector: target.selector,
          cart: enrich,
          href: location.href,
        });
      }

      // Fallback: if click missed but page exposes addToCart for this id
      try {
        if (kind === "add_to_cart" && window.DemoShop && typeof DemoShop.addToCart === "function") {
          const result = DemoShop.addToCart(target.id);
          return toolResult({ ok: true, product: target.label || target.id, ...result, via: "page_api_fallback" });
        }
      } catch (_) {}

      return toolResult(clicked);
    }

    // Single-target click
    const clicked = await clickSelector(action.selector);
    if (!clicked.ok) return toolResult(clicked);
    return toolResult({
      ok: true,
      clicked: action.buttonText || action.toolName,
      selector: action.selector,
      href: location.href,
      title: document.title,
      cart: demoCart(),
    });
  }

  async function registerActions(actions, signal) {
    const ctx = getModelContext();
    if (!ctx || typeof ctx.registerTool !== "function") {
      console.info("[site2webmcp] modelContext unavailable — enable chrome://flags/#enable-webmcp-testing");
      return { ok: false, reason: "no_model_context", registered: [] };
    }

    const names = [];
    for (const action of actions || []) {
      if (signal.aborted) break;
      const name = action.toolName;
      const description = action.toolDescription || `Action: ${action.buttonText || name}`;
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

      const readOnly = !!action.readOnly;

      try {
        await ctx.registerTool(
          {
            name,
            description,
            inputSchema,
            annotations: {
              readOnlyHint: readOnly,
              untrustedContentHint: true,
            },
            execute: async (args) => executeAction(action, args),
          },
          { signal }
        );
        registered.set(name, {
          selector: action.selector,
          description,
          kind: action.kind || "imperative",
          targets: action.targets || [],
        });
        names.push(name);
      } catch (err) {
        console.warn("[site2webmcp] registerTool failed for", name, err);
      }
    }
    return { ok: true, registered: names };
  }

  function clear() {
    if (controller) {
      try {
        controller.abort();
      } catch (_) {}
    }
    controller = null;
    registered.clear();
  }

  async function handleRegister(detail) {
    clear();
    await Promise.resolve();
    controller = new AbortController();
    const result = await registerActions(detail && detail.actions, controller.signal);
    window.dispatchEvent(
      new CustomEvent(EVENT_STATUS_REPLY, {
        detail: {
          type: "register-result",
          ...result,
          toolCount: registered.size,
          names: Array.from(registered.keys()),
          hasModelContext: !!getModelContext(),
        },
      })
    );
    return result;
  }

  window.addEventListener(EVENT_REGISTER, (ev) => {
    handleRegister(ev.detail || {});
  });

  window.addEventListener(EVENT_CLEAR, () => {
    clear();
    window.dispatchEvent(
      new CustomEvent(EVENT_STATUS_REPLY, {
        detail: { type: "cleared", toolCount: 0, names: [], hasModelContext: !!getModelContext() },
      })
    );
  });

  window.addEventListener(EVENT_STATUS, () => {
    window.dispatchEvent(
      new CustomEvent(EVENT_STATUS_REPLY, {
        detail: {
          type: "status",
          toolCount: registered.size,
          names: Array.from(registered.keys()),
          hasModelContext: !!getModelContext(),
          href: location.href,
        },
      })
    );
  });

  window.__site2webmcp = {
    list() {
      return Array.from(registered.keys());
    },
    clear,
    async getNativeTools() {
      const ctx = getModelContext();
      if (!ctx || !ctx.getTools) return [];
      return ctx.getTools();
    },
  };

  console.info("[site2webmcp] page bridge ready");
})();
