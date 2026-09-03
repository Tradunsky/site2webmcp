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

  /** Parse executeTool args whether object or JSON string. */
  function normalizeToolArgs(args) {
    if (args == null) return {};
    if (typeof args === "string") {
      try {
        const parsed = JSON.parse(args);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
      } catch (_) {}
      return { q: args, query: args, text: args };
    }
    if (typeof args === "object") return args;
    return { q: String(args) };
  }

  /**
   * Set an input's value without String.replace pitfalls and in a way SPA
   * listeners usually see. Never pass user text through String.prototype.replace
   * as the replacement pattern ($60 → 0 because $6 is a group reference).
   */
  function setInputValue(input, raw) {
    const value = raw == null ? "" : String(raw);
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    const areaSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    const use =
      input instanceof HTMLTextAreaElement
        ? areaSetter
        : setter;
    if (use) use.call(input, value);
    else input.value = value;

    // Select-all + insertText helps some controlled fields keep punctuation like $
    try {
      input.select?.();
      const ok = document.execCommand("insertText", false, value);
      if (!ok) {
        if (use) use.call(input, value);
        else input.value = value;
      }
    } catch (_) {
      if (use) use.call(input, value);
      else input.value = value;
    }

    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    try {
      input.dispatchEvent(
        new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" })
      );
    } catch (_) {}
    return input.value;
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
        ".card, .product, .product-card, .product-tile, [data-product-id], [data-asin], [data-sku], [data-component-type='s-search-result'], .s-result-item, [itemtype*='Product' i]"
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
      const priceEl = card.querySelector(".price, .product-price, .a-price .a-offscreen, [itemprop='price']");
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
    args = normalizeToolArgs(args);
    const needsConfirm = !!action.confirm;
    if (needsConfirm && !(args && args.confirm === true)) {
      return toolResult({
        ok: false,
        error: "Confirmation required. Call again with { confirm: true }.",
      });
    }

    const kind = action.kind || "click";

    if (kind === "fill_submit") {
      args = normalizeToolArgs(args);
      const fieldName = action.fieldName || "";
      const qRaw =
        args.q ??
        args.query ??
        (fieldName ? args[fieldName] : undefined) ??
        "";
      const query = String(qRaw).trim();
      if (!query) {
        return toolResult({ ok: false, error: "Missing search keywords (pass q)." });
      }
      const input = document.querySelector(action.inputSelector || action.selector);
      if (!input) {
        return toolResult({ ok: false, error: `Search input not found: ${action.inputSelector}` });
      }
      const applied = setInputValue(input, query);
      if (applied !== query) {
        // Last resort: assign again if the site mutated $ / punctuation away
        setInputValue(input, query);
      }

      const submit = action.submitSelector
        ? document.querySelector(action.submitSelector)
        : null;
      const form = action.formSelector
        ? document.querySelector(action.formSelector)
        : input.form || input.closest("form");

      if (submit) {
        submit.click();
      } else if (form && typeof form.requestSubmit === "function") {
        form.requestSubmit();
      } else if (form) {
        form.submit();
      } else {
        input.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true })
        );
      }
      await delay(100);
      return toolResult({
        ok: true,
        q: query,
        valueInBox: input.value,
        inputSelector: action.inputSelector,
        href: location.href,
        title: document.title,
      });
    }

    if (kind === "click_link") {
      const textQ = args && args.text != null ? String(args.text).trim() : "";
      const hrefQ = args && args.href != null ? String(args.href).trim().toLowerCase() : "";
      const linkId = args && args.link != null ? String(args.link).trim() : "";
      const targets = action.targets || [];

      let hit = null;
      if (linkId) {
        hit = targets.find((x) => String(x.id) === linkId);
      }
      if (!hit && (textQ || hrefQ)) {
        const tl = textQ.toLowerCase();
        const scored = [];
        for (const t of targets) {
          const label = String(t.label || "").toLowerCase();
          const href = String(t.href || "").toLowerCase();
          let score = 0;
          if (tl && label === tl) score += 100;
          else if (tl && label.includes(tl)) score += 40;
          else if (tl && tl.includes(label) && label.length > 8) score += 20;
          if (hrefQ && href.includes(hrefQ)) score += 50;
          if (score > 0) scored.push({ t, score });
        }
        scored.sort((a, b) => b.score - a.score);
        hit = scored.length ? scored[0].t : null;

        // Live DOM fallback if index stale
        if (!hit) {
          const anchors = Array.from(document.querySelectorAll("a[href]"));
          for (const a of anchors) {
            const label = (a.textContent || a.getAttribute("aria-label") || "").trim().toLowerCase();
            const href = (a.href || "").toLowerCase();
            if (tl && !label.includes(tl) && !(a.querySelector("h1,h2,h3") || {}).textContent) {
              const h = a.querySelector("h1,h2,h3,h4");
              const ht = h ? h.textContent.trim().toLowerCase() : "";
              if (!ht.includes(tl)) continue;
            } else if (tl && !label.includes(tl)) {
              const h = a.querySelector("h1,h2,h3,h4");
              const ht = h ? h.textContent.trim().toLowerCase() : "";
              if (!ht.includes(tl)) continue;
            }
            if (hrefQ && !href.includes(hrefQ)) continue;
            a.scrollIntoView({ block: "center", behavior: "instant" });
            a.click();
            await delay(50);
            return toolResult({
              ok: true,
              clicked: (a.textContent || "").trim().slice(0, 120),
              href: a.href,
              via: "live_dom",
            });
          }
        }
      }

      if (!hit) {
        return toolResult({
          ok: false,
          error: "No matching link. Pass text and/or href substring, or link id.",
          options: targets.slice(0, 15).map((t) => ({ id: t.id, label: t.label, href: t.href })),
        });
      }

      const clicked = await clickSelector(hit.selector);
      if (!clicked.ok) {
        // try href navigation as last resort
        if (hit.href) {
          location.href = hit.href;
          return toolResult({ ok: true, navigated: hit.href, label: hit.label, via: "location" });
        }
        return toolResult(clicked);
      }
      return toolResult({
        ok: true,
        clicked: hit.label,
        href: hit.href,
        selector: hit.selector,
      });
    }

    if (kind === "find_in_page") {
      const query = args && args.query != null ? String(args.query).trim() : "";
      if (!query) return toolResult({ ok: false, error: "Missing query" });
      let max = args && args.max_results != null ? Number(args.max_results) : 5;
      if (!Number.isFinite(max) || max < 1) max = 5;
      max = Math.min(15, Math.floor(max));
      const scroll = !!(args && args.scroll);

      const q = query.toLowerCase();
      const matches = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          const p = node.parentElement;
          if (!p) return NodeFilter.FILTER_REJECT;
          const tag = p.tagName;
          if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });

      let firstEl = null;
      while (walker.nextNode()) {
        const raw = walker.currentNode.nodeValue;
        const lower = raw.toLowerCase();
        let from = 0;
        while (matches.length < max) {
          const idx = lower.indexOf(q, from);
          if (idx < 0) break;
          const start = Math.max(0, idx - 60);
          const end = Math.min(raw.length, idx + query.length + 60);
          let snippet = raw.slice(start, end).replace(/\s+/g, " ").trim();
          if (start > 0) snippet = "…" + snippet;
          if (end < raw.length) snippet = snippet + "…";
          const el = walker.currentNode.parentElement;
          if (!firstEl) firstEl = el;
          matches.push({
            snippet,
            tag: el ? el.tagName.toLowerCase() : null,
          });
          from = idx + query.length;
        }
        if (matches.length >= max) break;
      }

      if (scroll && firstEl && typeof firstEl.scrollIntoView === "function") {
        try {
          firstEl.scrollIntoView({ block: "center", behavior: "instant" });
        } catch (_) {}
      }

      return toolResult({
        ok: true,
        query,
        count: matches.length,
        matches,
        scrolled: !!(scroll && firstEl),
      });
    }

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
