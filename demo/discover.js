/**
 * Site2WebMCP — shared DOM discovery + declarative annotation.
 * Used by the Chrome extension (copied to extension/lib/) and the demo page.
 *
 * Dual strategy:
 *  1) Declarative: annotate forms with toolname / tooldescription / toolautosubmit
 *     and inputs with toolparamdescription (browser-native WebMCP).
 *  2) Imperative: return *grouped* action descriptors for MAIN-world registerTool.
 *     Multiple controls that share an action pattern (e.g. many "Add to cart"
 *     buttons) become ONE tool whose inputSchema enum is derived from each
 *     control's entity context (data-add, asin, nearby title). Unique controls
 *     (one cart icon, one checkout) stay single-target with an empty/confirm schema.
 *
 * Nothing is registered from a built-in shop toolkit — only from DOM matches.
 * Optional page helpers (e.g. window.DemoShop) may enrich execute results after
 * a DOM click; they never cause a tool to be registered by themselves.
 */
(function (root) {
  "use strict";

  const MAX_TOOLS = 20;
  const ATTR_MARK = "data-s2wm";
  const ID_ATTR = "data-s2wm-id";
  const MAX_PRODUCT_DETAILS = 6;

  const TEXT_INPUT_TYPES = new Set([
    "text",
    "search",
    "email",
    "number",
    "tel",
    "url",
    "password",
  ]);

  const GENERIC_CONTEXT_LABELS = new Set([
    "cart",
    "menu",
    "search",
    "account",
    "filter",
    "filters",
    "home",
    "shop",
    "store",
    "nav",
    "navigation",
    "checkout",
    "basket",
    "bag",
  ]);

  /** Action kinds that are parameterized when multiple entity-scoped targets exist. */
  const PARAMETERIZED_KINDS = new Set([
    "add_to_cart",
    "buy_now",
    "product_details",
    "open_product",
  ]);

  /** Kinds that must be global chrome (never inside a product card). */
  const GLOBAL_ONLY_KINDS = new Set(["view_cart", "checkout"]);

  const ACTION_PATTERNS = [
    {
      re: /add[\s_-]*to[\s_-]*(?:cart|basket|trolley)|add[\s_-]*(?:cart|basket|trolley)/i,
      action: "add_to_cart",
      label: "Add to cart",
    },
    { re: /buy\s*now/i, action: "buy_now", label: "Buy now" },
    {
      re: /(?:^|\b)(?:view\s*)?(?:cart|basket|trolley)(?:\b|$)|shopping\s*(?:cart|basket)/i,
      action: "view_cart",
      label: "View cart",
    },
    {
      re: /product\s*details|see\s*details|view\s*product|view\s*details/i,
      action: "product_details",
      label: "Product details",
    },
    {
      re: /check\s*out|place\s*order|complete\s*purchase|purchase/i,
      action: "checkout",
      label: "Checkout / purchase",
    },
    { re: /sign[\s_-]*in|log[\s_-]*in|login/i, action: "sign_in", label: "Sign in" },
    { re: /sign[\s_-]*up|register|create\s*account/i, action: "sign_up", label: "Sign up" },
    { re: /subscribe|newsletter|join\s*list/i, action: "subscribe", label: "Subscribe" },
    { re: /delete|remove\s*item|remove\s*from/i, action: "delete", label: "Delete / remove" },
  ];

  const COMMERCE_HOOK_SELECTORS = [
    "#add-to-cart-button",
    "#buy-now-button",
    "#nav-cart",
    "#nav-cart-count-container",
    "input[name='submit.add-to-cart']",
    "[data-action*='add' i]",
    "a[href*='/cart']",
    "#addToCart",
    "[data-add]",
    "[data-asin]",
  ].join(", ");

  const PRODUCT_CARD_SELECTORS = [
    ".card",
    "[data-asin]",
    ".product",
    ".product-card",
    ".product-tile",
    "[data-component-type='s-search-result']",
    ".s-result-item",
    "[data-product-id]",
  ].join(", ");

  function hostnamePrefix() {
    try {
      const h = (location.hostname || "local").replace(/^www\./, "");
      return snakeCase(h.replace(/\./g, "_")) || "page";
    } catch (_) {
      return "page";
    }
  }

  function snakeCase(s) {
    return (
      String(s || "")
        .normalize("NFKD")
        .replace(/[^\w\s-]/g, "")
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        .replace(/[\s-]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
        .toLowerCase()
        .slice(0, 48) || "tool"
    );
  }

  function isVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true") return false;
    const style = window.getComputedStyle(el);
    if (!style || style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 && rect.height < 2) return false;
    return true;
  }

  function nearbyHeading(el) {
    let node = el;
    for (let i = 0; i < 6 && node; i++) {
      const prev = node.previousElementSibling;
      if (prev) {
        const h =
          prev.matches && prev.matches("h1,h2,h3,h4,h5,legend")
            ? prev
            : prev.querySelector?.("h1,h2,h3,h4,h5,legend");
        if (h && h.textContent.trim()) return h.textContent.trim().slice(0, 80);
      }
      const labelled = node.getAttribute?.("aria-label");
      if (labelled) return labelled.slice(0, 80);
      node = node.parentElement;
    }
    return "";
  }

  function labelForInput(input) {
    if (input.getAttribute("aria-label")) return input.getAttribute("aria-label").trim();
    if (input.getAttribute("aria-description")) return input.getAttribute("aria-description").trim();
    if (input.placeholder) return input.placeholder.trim();
    if (input.labels && input.labels[0]) {
      return (
        Array.from(input.labels[0].childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent.trim())
          .filter(Boolean)
          .join(" ") || input.labels[0].textContent.trim()
      );
    }
    if (input.id) {
      const lab = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      if (lab) return lab.textContent.trim();
    }
    return input.name || input.type || "field";
  }

  function ensureName(input, index) {
    if (input.name && input.name.trim()) return input.name.trim();
    const base = snakeCase(input.id || input.placeholder || input.type || "field") || "field";
    const name = `${base}_${index}`;
    input.setAttribute("name", name);
    return name;
  }

  function formHasPassword(form) {
    return !!form.querySelector('input[type="password"]');
  }

  function looksLikeSearchForm(form) {
    if (form.getAttribute("role") === "search") return true;
    if ((form.getAttribute("action") || "").toLowerCase().includes("search")) return true;
    if (form.querySelector('input[type="search"]')) return true;
    if (form.querySelector('[name*="search" i], [id*="search" i], [placeholder*="search" i]')) return true;
    const btn = form.querySelector('button[type="submit"], input[type="submit"]');
    if (btn && /search|find|query|go/i.test(btn.textContent || btn.value || "")) return true;
    return false;
  }

  function looksLikeLoginForm(form) {
    if (formHasPassword(form)) return true;
    const t = `${form.id} ${form.className} ${form.getAttribute("name") || ""}`.toLowerCase();
    return /login|sign.?in|auth/.test(t);
  }

  function looksDestructiveForm(form) {
    const t = `${form.id} ${form.className} ${form.getAttribute("action") || ""}`.toLowerCase();
    const btn = form.querySelector('button[type="submit"], input[type="submit"]');
    const btnText = (btn && (btn.textContent || btn.value)) || "";
    return /checkout|purchase|order|delete|remove|pay|payment|buy/.test(t + " " + btnText.toLowerCase());
  }

  function collectNamedControls(form) {
    const controls = Array.from(form.querySelectorAll("input, select, textarea")).filter((el) => {
      if (!isVisible(el) && el.type !== "hidden") return false;
      if (el.disabled) return false;
      const type = (el.type || el.tagName).toLowerCase();
      if (["submit", "button", "reset", "image", "file", "hidden"].includes(type)) return false;
      if (el.tagName === "INPUT" && !TEXT_INPUT_TYPES.has(type) && type !== "checkbox" && type !== "radio") {
        if (el.tagName === "SELECT" || el.tagName === "TEXTAREA") return true;
        return false;
      }
      return true;
    });
    return controls;
  }

  function inferFormAction(form) {
    if (looksLikeSearchForm(form)) return "search";
    if (looksLikeLoginForm(form)) return "login";
    if (looksDestructiveForm(form)) {
      const btn = form.querySelector('button[type="submit"], input[type="submit"]');
      const btnText = (btn && (btn.textContent || btn.value)) || "";
      if (/check\s*out|purchase|order|pay/i.test(btnText)) return "checkout";
      if (/delete|remove/i.test(btnText)) return "delete";
      return "submit";
    }
    const btn = form.querySelector('button[type="submit"], input[type="submit"]');
    const btnText = ((btn && (btn.textContent || btn.value)) || "submit").trim();
    return snakeCase(btnText).slice(0, 24) || "submit";
  }

  function describeForm(form, action) {
    const aria = form.getAttribute("aria-label");
    if (aria) return aria.trim().slice(0, 160);
    const heading = nearbyHeading(form);
    if (heading) return `${heading} — submit this form on the page.`.slice(0, 160);
    const btn = form.querySelector('button[type="submit"], input[type="submit"]');
    const btnText = ((btn && (btn.textContent || btn.value)) || "").trim();
    if (btnText) return `${btnText} via the form on this page.`.slice(0, 160);
    const title = document.title ? ` on ${document.title}` : "";
    return `Submit the ${action} form${title}`.slice(0, 160);
  }

  function uniqueName(base, used) {
    let name = base;
    let i = 2;
    while (used.has(name)) {
      name = `${base}_${i++}`;
    }
    used.add(name);
    return name;
  }

  function isGenericContextLabel(label) {
    if (!label) return true;
    const t = String(label).trim().toLowerCase().replace(/\s+/g, " ");
    if (GENERIC_CONTEXT_LABELS.has(t)) return true;
    if (t.length <= 2) return true;
    return false;
  }

  function stableDataKey(el) {
    const add = el.getAttribute("data-add");
    if (add) return { kind: "add", value: add, id: `add_${snakeCase(add)}` };
    const asin = el.getAttribute("data-asin");
    if (asin) return { kind: "asin", value: asin, id: `asin_${asin}` };
    const productId = el.getAttribute("data-product-id");
    if (productId) return { kind: "product-id", value: productId, id: `pid_${snakeCase(productId)}` };
    const itemId = el.getAttribute("data-item-id");
    if (itemId) return { kind: "item-id", value: itemId, id: `item_${snakeCase(itemId)}` };
    const product = el.getAttribute("data-product");
    if (product) return { kind: "product", value: product, id: `prod_${snakeCase(product)}` };
    const sku = el.getAttribute("data-sku");
    if (sku) return { kind: "sku", value: sku, id: `sku_${snakeCase(sku)}` };
    return null;
  }

  function findAncestorAsin(el) {
    let node = el;
    for (let i = 0; i < 8 && node; i++) {
      const asin = node.getAttribute?.("data-asin");
      if (asin) return asin;
      node = node.parentElement;
    }
    return null;
  }

  function closestProductCard(el) {
    if (!el || !el.closest) return null;
    try {
      return el.closest(PRODUCT_CARD_SELECTORS);
    } catch (_) {
      return null;
    }
  }

  function isInsideProductCard(el) {
    return !!closestProductCard(el);
  }

  function titleFromNode(node) {
    if (!node) return "";
    const selectors = [
      "#productTitle",
      "#title span",
      "#title",
      "strong",
      "h1",
      "h2",
      "h3",
      "h4",
      "[itemprop='name']",
      ".product-title",
      ".product-name",
      ".a-size-base-plus",
      ".a-text-normal",
      "[data-cy='title-recipe']",
      ".title",
    ];
    for (const sel of selectors) {
      let title = null;
      if (sel.startsWith("#")) {
        const id = sel.slice(1).split(/[\s.>]/)[0];
        if (node.id === id) title = node;
        else title = node.querySelector?.(sel);
      } else if (node.matches?.(sel)) {
        title = node;
      } else {
        title = node.querySelector?.(sel);
      }
      if (title) {
        const name = title.textContent.trim().replace(/\s+/g, " ").slice(0, 60);
        if (name && name.length > 1 && !isGenericContextLabel(name)) return name;
      }
    }
    return "";
  }

  function actionContext(el, matchedAction) {
    const productTitle =
      document.querySelector("#productTitle") ||
      document.querySelector("#title span") ||
      document.querySelector("#title");
    if (productTitle && (matchedAction === "add_to_cart" || matchedAction === "buy_now")) {
      const name = productTitle.textContent.trim().replace(/\s+/g, " ").slice(0, 60);
      if (name && !isGenericContextLabel(name)) {
        return { label: name, slug: snakeCase(name) };
      }
    }

    const dataKey = stableDataKey(el);
    let node = el.parentElement;
    for (let i = 0; i < 8 && node; i++) {
      const name = titleFromNode(node);
      if (name) {
        if (matchedAction === "checkout" && isGenericContextLabel(name)) {
          node = node.parentElement;
          continue;
        }
        if (!isGenericContextLabel(name)) {
          return { label: name, slug: snakeCase(name) };
        }
      }
      const asin = node.getAttribute?.("data-asin");
      if (asin) {
        const nearby =
          titleFromNode(node) ||
          node.querySelector?.("h2 a, h2, a.a-link-normal")?.textContent?.trim()?.replace(/\s+/g, " ")?.slice(0, 60);
        if (nearby && !isGenericContextLabel(nearby)) {
          return { label: nearby, slug: snakeCase(nearby) };
        }
      }
      const aria = node.getAttribute?.("aria-label");
      if (aria && aria.trim().length > 1 && !isGenericContextLabel(aria)) {
        const n = aria.trim().replace(/\s+/g, " ").slice(0, 60);
        return { label: n, slug: snakeCase(n) };
      }
      node = node.parentElement;
    }

    if (dataKey && dataKey.value && !isGenericContextLabel(dataKey.value)) {
      const name = String(dataKey.value).trim().slice(0, 60);
      return { label: name, slug: snakeCase(name) };
    }
    return null;
  }

  /**
   * Entity id for enum parameters: prefer stable data-add / asin / product-id,
   * else slug of nearby title, else stamped id.
   */
  function entityIdForTarget(el, ctxInfo, s2id) {
    const dataAdd = el.getAttribute("data-add");
    if (dataAdd) return String(dataAdd).trim();
    const asin = el.getAttribute("data-asin") || findAncestorAsin(el);
    if (asin) return String(asin).trim();
    const productId = el.getAttribute("data-product-id") || closestProductCard(el)?.getAttribute?.("data-product-id");
    if (productId) return String(productId).trim();
    const sku = el.getAttribute("data-sku");
    if (sku) return String(sku).trim();
    if (ctxInfo && ctxInfo.slug) return ctxInfo.slug;
    if (ctxInfo && ctxInfo.label) return snakeCase(ctxInfo.label);
    return s2id;
  }

  function preferredSelector(el, s2id) {
    const dataAdd = el.getAttribute("data-add");
    if (dataAdd) return `[data-add="${cssEscape(dataAdd)}"]`;
    if (el.id === "add-to-cart-button") return "#add-to-cart-button";
    if (el.id === "buy-now-button") return "#buy-now-button";
    if (el.id === "nav-cart") return "#nav-cart";
    if (el.id === "nav-cart-count-container") return "#nav-cart-count-container";
    if (el.id === "cartSummary") return "#cartSummary";
    if (el.id === "checkoutBtn") return "#checkoutBtn";
    if (el.id === "addToCart") return "#addToCart";
    if (el.getAttribute("name") === "submit.add-to-cart") {
      return "input[name='submit.add-to-cart']";
    }
    const asin = el.getAttribute("data-asin");
    if (asin && el.matches("button, input, a, [role='button']")) {
      return `[data-asin="${cssEscape(asin)}"]`;
    }
    if (el.id) return `#${cssEscape(el.id)}`;
    return `[${ID_ATTR}="${cssEscape(s2id)}"]`;
  }

  function stampId(el, prefix, index) {
    const stable = stableDataKey(el);
    if (stable) {
      el.setAttribute(ID_ATTR, stable.id);
      return stable.id;
    }
    if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id)) {
      const id = `id_${snakeCase(el.id)}`;
      el.setAttribute(ID_ATTR, id);
      return id;
    }
    let id = el.getAttribute(ID_ATTR);
    if (!id || /_[a-z0-9]{6}$/.test(id)) {
      id = `${prefix}_${index}`;
      el.setAttribute(ID_ATTR, id);
    }
    return id;
  }

  function cssEscape(s) {
    if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s);
    return String(s).replace(/"/g, '\\"');
  }

  function candidateText(el) {
    const parts = [
      el.textContent,
      el.value,
      el.getAttribute("aria-label"),
      el.getAttribute("title"),
      el.getAttribute("alt"),
    ];
    return parts
      .map((p) => (p || "").trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function matchAction(el, text) {
    const hay = [
      text,
      el.className || "",
      el.id || "",
      el.getAttribute("name") || "",
      el.getAttribute("data-action") || "",
      el.getAttribute("aria-label") || "",
      el.getAttribute("title") || "",
    ].join(" ");
    for (const p of ACTION_PATTERNS) {
      if (p.re.test(hay)) return p;
    }
    const id = (el.id || "").toLowerCase();
    const name = (el.getAttribute("name") || "").toLowerCase();
    if (id === "add-to-cart-button" || name === "submit.add-to-cart" || id === "addtocart") {
      return ACTION_PATTERNS.find((p) => p.action === "add_to_cart");
    }
    if (id === "buy-now-button") {
      return ACTION_PATTERNS.find((p) => p.action === "buy_now");
    }
    if (id === "nav-cart" || id === "nav-cart-count-container") {
      return ACTION_PATTERNS.find((p) => p.action === "view_cart");
    }
    return null;
  }

  /**
   * Strict view_cart gate: must look like global cart chrome (nav / href / aria),
   * must NOT sit inside a product card, and must not be clear/add/remove cart.
   */
  function isGlobalCartControl(el) {
    if (!el) return false;
    if (isInsideProductCard(el)) return false;

    const id = (el.id || "").toLowerCase();
    const cls = String(el.className || "").toLowerCase();
    const href = (el.getAttribute("href") || "").toLowerCase();
    const aria = (el.getAttribute("aria-label") || "").toLowerCase();
    const title = (el.getAttribute("title") || "").toLowerCase();
    const role = (el.getAttribute("role") || "").toLowerCase();
    const chromeHay = `${id} ${cls} ${href} ${aria} ${title}`;

    if (!/(?:^|[^a-z])(?:cart|basket|bag)(?:[^a-z]|$)/i.test(chromeHay) && !/\/cart\b/i.test(href)) {
      return false;
    }

    const text = candidateText(el).toLowerCase();
    const deny = `${text} ${id} ${aria} ${title}`;
    if (/\b(clear|empty|remove|delete)\b/.test(deny)) return false;
    if (/add[\s_-]*to[\s_-]*(?:cart|basket|bag)/i.test(deny)) return false;
    if (/check\s*out|place\s*order/i.test(deny)) return false;

    // Prefer interactive / landmark-ish nodes; allow cart summary pills in header.
    const tag = (el.tagName || "").toLowerCase();
    const interactive =
      tag === "a" ||
      tag === "button" ||
      tag === "input" ||
      role === "button" ||
      role === "link" ||
      !!el.onclick ||
      /nav|cart|basket|bag|pill|summary|icon/i.test(chromeHay);
    if (!interactive) return false;

    return true;
  }

  /**
   * Checkout should be a primary/global CTA, not a per-card purchase button
   * unless we are clearly on a single-product page buy flow (handled as buy_now).
   */
  function isAcceptableCheckoutControl(el) {
    if (isInsideProductCard(el)) return false;
    const text = candidateText(el).toLowerCase();
    // "Purchase" alone on a card-like control was already excluded by card check.
    return /check\s*out|place\s*order|complete\s*purchase|purchase|pay\s*now/i.test(text) ||
      /checkout|place.?order/i.test(`${el.id || ""} ${el.className || ""}`);
  }

  function collectClickCandidates() {
    const set = new Set();
    const add = (el) => {
      if (el && el.nodeType === 1) set.add(el);
    };

    document
      .querySelectorAll("button, a[role='button'], input[type='button'], input[type='submit'], [role='button']")
      .forEach(add);

    try {
      document.querySelectorAll(COMMERCE_HOOK_SELECTORS).forEach(add);
    } catch (_) {}

    document.querySelectorAll("[aria-label], [title]").forEach((el) => {
      const label = `${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""}`;
      for (const p of ACTION_PATTERNS) {
        if (p.re.test(label)) {
          add(el);
          break;
        }
      }
    });

    // Header cart pills / summary nodes that are not buttons
    document.querySelectorAll("#nav-cart, #nav-cart-count-container, #cartSummary, .cart-pill, [class*='cart' i]").forEach((el) => {
      if (isGlobalCartControl(el)) add(el);
    });

    return Array.from(set);
  }

  function dedupeKey(el, matched, s2id) {
    const stable = stableDataKey(el);
    if (stable) return `${matched.action}:${stable.id}`;
    if (el.id) return `${matched.action}:#${el.id}`;
    const sel = preferredSelector(el, s2id);
    return `${matched.action}:${sel}`;
  }

  function isTinyIconOnly(el, text) {
    const rect = el.getBoundingClientRect();
    const hasLabel =
      !!(el.getAttribute("aria-label") || el.getAttribute("title") || (text && text.replace(/\W+/g, "").length > 0));
    if (!hasLabel && rect.width < 28 && rect.height < 28) return true;
    if (!hasLabel && !(el.textContent || "").trim() && !el.value) return true;
    return false;
  }

  function findProductCards() {
    let cards = [];
    try {
      cards = Array.from(document.querySelectorAll(PRODUCT_CARD_SELECTORS));
    } catch (_) {
      cards = [];
    }
    return cards.filter((c) => isVisible(c));
  }

  /**
   * Scrape visible product-like cards into a compact catalog.
   * Used by list_products execute handlers (and optionally discover preview).
   */
  function scrapeProducts() {
    const cards = findProductCards();
    const out = [];
    const seen = new Set();
    for (const card of cards) {
      const id =
        card.getAttribute("data-add") ||
        card.getAttribute("data-asin") ||
        card.getAttribute("data-product-id") ||
        card.getAttribute("data-sku") ||
        card.querySelector?.("[data-add]")?.getAttribute("data-add") ||
        null;
      const name =
        titleFromNode(card) ||
        card.querySelector?.("strong, h2, h3, .product-title, .product-name")?.textContent?.trim()?.replace(/\s+/g, " ")?.slice(0, 80) ||
        "";
      if (!name && !id) continue;
      const priceEl =
        card.querySelector?.(".price, .a-price .a-offscreen, [itemprop='price'], .product-price") || null;
      let price = null;
      if (priceEl) {
        const raw = priceEl.textContent.trim().replace(/\s+/g, " ");
        const m = raw.match(/[\d,.]+/);
        price = m ? raw.slice(0, 24) : raw.slice(0, 24);
      }
      const category =
        card.querySelector?.(".meta, .category, [itemprop='category']")?.textContent?.trim()?.replace(/\s+/g, " ")?.slice(0, 40) ||
        "";
      const key = id || snakeCase(name);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: id || key,
        name: name || String(id),
        price,
        category: category || undefined,
      });
    }
    return out;
  }

  function emptyObjectSchema() {
    return { type: "object", properties: {}, additionalProperties: false };
  }

  function confirmSchema() {
    return {
      type: "object",
      properties: {
        confirm: {
          type: "boolean",
          description: "Set true to confirm this action.",
        },
      },
      required: ["confirm"],
      additionalProperties: false,
    };
  }

  function productEnumSchema(targets, actionLabel) {
    const enums = targets.map((t) => t.id);
    const nameList = targets
      .map((t) => (t.label && t.label !== t.id ? `${t.id} (${t.label})` : t.id))
      .slice(0, 12)
      .join(", ");
    return {
      type: "object",
      properties: {
        product: {
          type: "string",
          enum: enums,
          description: `Product to ${actionLabel || "select"}. Options: ${nameList}${targets.length > 12 ? ", …" : ""}`,
        },
      },
      required: ["product"],
      additionalProperties: false,
    };
  }

  function needsConfirm(kind) {
    return /checkout|purchase|delete|sign_in|sign_up/.test(kind);
  }

  function isReadOnlyKind(kind) {
    return kind === "list_products" || kind === "view_cart" || kind === "product_details";
  }

  function cartRank(m) {
    const sel = m.selector || "";
    const id = (m.el && m.el.id) || "";
    if (id === "nav-cart" || sel === "#nav-cart") return 0;
    if (id === "nav-cart-count-container" || sel === "#nav-cart-count-container") return 1;
    if (id === "cartSummary" || sel === "#cartSummary") return 2;
    if (/cart|basket|bag/i.test(sel) || /\/cart/i.test(sel)) return 3;
    return 9;
  }

  function pickBestGlobal(group, kind) {
    if (!group || !group.length) return null;
    if (kind === "view_cart") {
      return group.slice().sort((a, b) => cartRank(a) - cartRank(b))[0];
    }
    if (kind === "checkout") {
      return group.slice().sort((a, b) => {
        const ae = /checkout/i.test(a.selector || "") || /checkout/i.test((a.el && a.el.id) || "") ? 0 : 1;
        const be = /checkout/i.test(b.selector || "") || /checkout/i.test((b.el && b.el.id) || "") ? 0 : 1;
        return ae - be;
      })[0];
    }
    return group[0];
  }

  /**
   * Build grouped action descriptors from raw matched controls.
   */
  function buildGroupedActions(rawMatches, usedNames, prefix, maxRemaining) {
    const actions = [];
    const byKind = new Map();

    for (const m of rawMatches) {
      if (!byKind.has(m.kind)) byKind.set(m.kind, []);
      byKind.get(m.kind).push(m);
    }

    // Stable kind order for predictable tool lists
    const kindOrder = [
      "list_products",
      "add_to_cart",
      "view_cart",
      "buy_now",
      "checkout",
      "product_details",
      "open_product",
      "sign_in",
      "sign_up",
      "subscribe",
      "delete",
    ];
    const kinds = [
      ...kindOrder.filter((k) => byKind.has(k)),
      ...Array.from(byKind.keys()).filter((k) => !kindOrder.includes(k)),
    ];

    for (const kind of kinds) {
      if (actions.length >= maxRemaining) break;
      const group = byKind.get(kind) || [];
      if (!group.length) continue;

      const matchedLabel = group[0].matchedLabel || kind.replace(/_/g, " ");
      const confirm = needsConfirm(kind);
      const readOnly = isReadOnlyKind(kind);

      if (kind === "list_products") {
        const toolName = uniqueName(`${prefix}_list_products`, usedNames);
        actions.push({
          id: "list_products",
          toolName,
          toolDescription:
            group[0].toolDescription ||
            "List visible products on this page (id, name, price, category).",
          kind: "list_products",
          inputSchema: emptyObjectSchema(),
          targets: [],
          selector: null,
          confirm: false,
          readOnly: true,
          buttonText: "List products",
          contextLabel: "",
        });
        continue;
      }

      // Global-only kinds: keep a single best target (no product enum).
      if (GLOBAL_ONLY_KINDS.has(kind) || !PARAMETERIZED_KINDS.has(kind)) {
        const best = pickBestGlobal(group, kind);
        const toolName = uniqueName(`${prefix}_${kind}`, usedNames);
        const displayText = (best.buttonText || matchedLabel).slice(0, 40);
        actions.push({
          id: best.s2id,
          toolName,
          toolDescription: best.toolDescription || `${matchedLabel}: click "${displayText}" on this page.`,
          kind,
          inputSchema: confirm ? confirmSchema() : emptyObjectSchema(),
          targets: [],
          selector: best.selector,
          confirm,
          readOnly,
          buttonText: (best.buttonText || displayText).slice(0, 80),
          contextLabel: "",
        });
        continue;
      }

      // Parameterized kinds: merge entity-scoped targets into one tool when ≥2;
      // single target stays non-parameterized (or single optional enum omitted).
      const targets = [];
      const seenIds = new Set();
      for (const m of group) {
        const id = m.entityId;
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);
        targets.push({
          id,
          label: m.contextLabel || m.buttonText || id,
          selector: m.selector,
        });
      }

      if (targets.length >= 2) {
        const toolName = uniqueName(`${prefix}_${kind}`, usedNames);
        const labels = targets.map((t) => t.label).slice(0, 8).join(", ");
        actions.push({
          id: `${kind}_grouped`,
          toolName,
          toolDescription: `${matchedLabel} for a product on this page (${targets.length} options: ${labels}${
            targets.length > 8 ? ", …" : ""
          }).`,
          kind,
          inputSchema: productEnumSchema(targets, matchedLabel.toLowerCase()),
          targets,
          selector: null,
          confirm,
          readOnly: false,
          buttonText: matchedLabel,
          contextLabel: "",
        });
      } else if (targets.length === 1 || group.length === 1) {
        const best = group[0];
        const toolName = uniqueName(`${prefix}_${kind}`, usedNames);
        const ctx = best.contextLabel;
        const displayText = (best.buttonText || matchedLabel).slice(0, 40);
        const toolDescription = ctx
          ? `${matchedLabel} for "${ctx}" on this page.`
          : `${matchedLabel}: click "${displayText}" on this page.`;
        actions.push({
          id: best.s2id,
          toolName,
          toolDescription,
          kind,
          inputSchema: confirm ? confirmSchema() : emptyObjectSchema(),
          targets: [],
          selector: best.selector,
          confirm,
          readOnly: false,
          buttonText: (best.buttonText || displayText).slice(0, 80),
          contextLabel: ctx || "",
        });
      }
    }

    return actions;
  }

  /**
   * Discover forms + primary action buttons. Returns a plan (no side effects
   * except ensureName / stampId for stable selectors).
   */
  function discover(options) {
    const opts = Object.assign({ maxTools: MAX_TOOLS }, options || {});
    const prefix = hostnamePrefix();
    const usedNames = new Set();
    const usedActionKeys = new Set();
    const forms = [];
    let productDetailsCount = 0;

    const allForms = Array.from(document.querySelectorAll("form")).filter(isVisible);
    allForms.sort((a, b) => Number(looksLikeSearchForm(b)) - Number(looksLikeSearchForm(a)));

    for (const form of allForms) {
      if (forms.length >= opts.maxTools) break;
      const controls = collectNamedControls(form);
      const namedText = controls.filter((c) => {
        const t = (c.type || "").toLowerCase();
        return (
          c.tagName === "SELECT" ||
          c.tagName === "TEXTAREA" ||
          TEXT_INPUT_TYPES.has(t) ||
          t === "checkbox" ||
          t === "radio"
        );
      });
      if (namedText.length === 0) continue;

      const action = inferFormAction(form);
      const toolName = uniqueName(`${prefix}_${action}`, usedNames);
      const toolDescription = describeForm(form, action);
      const isLogin = looksLikeLoginForm(form);
      const isDestructive = looksDestructiveForm(form) && !looksLikeSearchForm(form);
      const autoSubmit = looksLikeSearchForm(form) || (!isLogin && !isDestructive && action === "search");

      const fields = [];
      namedText.forEach((input, idx) => {
        const name = ensureName(input, idx);
        const isPassword = (input.type || "").toLowerCase() === "password";
        let description = labelForInput(input).slice(0, 120);
        if (isPassword) {
          description = `Password field (sensitive): ${description}. Agents should treat carefully.`;
        }
        fields.push({
          name,
          description,
          type: (input.type || input.tagName).toLowerCase(),
          required: !!input.required,
          password: isPassword,
        });
      });

      const s2id = stampId(form, "form", forms.length);
      forms.push({
        id: s2id,
        selector: preferredSelector(form, s2id),
        toolName,
        toolDescription,
        autoSubmit: autoSubmit && !isLogin,
        isLogin,
        isDestructive,
        action,
        fields,
      });
    }

    const formElements = new Set(forms.map((f) => document.querySelector(f.selector)).filter(Boolean));
    allForms.forEach((f) => {
      if (forms.some((x) => document.querySelector(x.selector) === f)) formElements.add(f);
    });

    const candidates = collectClickCandidates().filter(isVisible);
    const rawMatches = [];

    for (const el of candidates) {
      let insideCovered = false;
      for (const f of formElements) {
        if (f.contains(el)) {
          insideCovered = true;
          break;
        }
      }
      const isCommerceHook =
        el.id === "add-to-cart-button" ||
        el.id === "buy-now-button" ||
        (el.getAttribute("name") || "") === "submit.add-to-cart";
      if (insideCovered && !isCommerceHook) continue;

      const text = candidateText(el);
      if (isTinyIconOnly(el, text)) continue;
      if (text.length > 200) continue;

      const matched = matchAction(el, text);
      if (!matched) continue;

      // Tighten view_cart — never product-card noise / "Cart: 0 · $0" entity mashups
      if (matched.action === "view_cart") {
        if (!isGlobalCartControl(el)) continue;
      }
      if (matched.action === "checkout") {
        if (!isAcceptableCheckoutControl(el)) continue;
      }

      if (matched.action === "product_details") {
        if (productDetailsCount >= MAX_PRODUCT_DETAILS) continue;
        productDetailsCount += 1;
      }

      const s2id = stampId(el, "act", rawMatches.length);
      const key = dedupeKey(el, matched, s2id);
      if (usedActionKeys.has(key)) continue;
      usedActionKeys.add(key);

      let ctxInfo = actionContext(el, matched.action);
      // Global kinds never take product entity into the tool name / enum
      if (GLOBAL_ONLY_KINDS.has(matched.action)) {
        ctxInfo = null;
      }
      if (matched.action === "checkout" && ctxInfo && isGenericContextLabel(ctxInfo.label)) {
        ctxInfo = null;
      }

      const displayText = (el.getAttribute("aria-label") || el.getAttribute("title") || text || matched.label)
        .trim()
        .slice(0, 80);

      rawMatches.push({
        el,
        kind: matched.action,
        matchedLabel: matched.label,
        s2id,
        selector: preferredSelector(el, s2id),
        buttonText: displayText,
        contextLabel: ctxInfo ? ctxInfo.label : "",
        entityId: entityIdForTarget(el, ctxInfo, s2id),
        toolDescription: null,
      });
    }

    // list_products: only when the DOM shows a multi-item catalog (≥2 cards)
    const productCards = findProductCards();
    if (productCards.length >= 2 && forms.length < opts.maxTools) {
      rawMatches.unshift({
        kind: "list_products",
        matchedLabel: "List products",
        s2id: "list_products",
        selector: null,
        buttonText: "List products",
        contextLabel: "",
        entityId: null,
        toolDescription: `List ${productCards.length} visible products on this page (id, name, price, category).`,
      });
    }

    const remaining = Math.max(0, opts.maxTools - forms.length);
    const actions = buildGroupedActions(rawMatches, usedNames, prefix, remaining);

    return {
      hostname: location.hostname || "localhost",
      href: location.href,
      title: document.title || "",
      forms,
      actions,
      maxTools: opts.maxTools,
      toolCount: forms.length + actions.length,
    };
  }

  /**
   * Apply declarative WebMCP attributes to discovered forms.
   * Returns the same plan (mutates DOM).
   */
  function annotateForms(plan) {
    const p = plan || discover();
    for (const f of p.forms) {
      const form = document.querySelector(f.selector);
      if (!form) continue;
      form.setAttribute("toolname", f.toolName);
      form.setAttribute("tooldescription", f.toolDescription);
      if (f.autoSubmit) {
        form.setAttribute("toolautosubmit", "");
      } else {
        form.removeAttribute("toolautosubmit");
      }
      form.setAttribute(ATTR_MARK, "form");

      const controls = collectNamedControls(form);
      controls.forEach((input, idx) => {
        const name = ensureName(input, idx);
        const field = f.fields.find((x) => x.name === name);
        const desc = (field && field.description) || labelForInput(input);
        input.setAttribute("toolparamdescription", desc);
        input.setAttribute(ATTR_MARK, "param");
      });
    }
    return p;
  }

  /** Remove prior Site2WebMCP declarative marks (keeps data-s2wm-id). */
  function clearAnnotations() {
    document.querySelectorAll(`[${ATTR_MARK}]`).forEach((el) => {
      el.removeAttribute("toolname");
      el.removeAttribute("tooldescription");
      el.removeAttribute("toolautosubmit");
      el.removeAttribute("toolparamdescription");
      el.removeAttribute(ATTR_MARK);
    });
  }

  function summarize(plan) {
    const p = plan || discover();
    return {
      hostname: p.hostname,
      href: p.href,
      title: p.title,
      toolCount: p.toolCount,
      tools: [
        ...p.forms.map((f) => ({
          name: f.toolName,
          description: f.toolDescription,
          kind: "declarative_form",
          autoSubmit: f.autoSubmit,
        })),
        ...p.actions.map((a) => ({
          name: a.toolName,
          description: a.toolDescription,
          kind: a.kind || "imperative",
          readOnly: !!a.readOnly,
          parameterized: !!(a.targets && a.targets.length),
        })),
      ],
    };
  }

  const api = {
    MAX_TOOLS,
    ID_ATTR,
    ATTR_MARK,
    discover,
    annotateForms,
    clearAnnotations,
    summarize,
    scrapeProducts,
    isVisible,
    snakeCase,
    hostnamePrefix,
  };

  root.Site2WebMCP = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : self);
