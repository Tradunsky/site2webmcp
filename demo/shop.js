(function () {
  "use strict";

  const PRODUCTS = [
    { id: "mug", name: "Ceramic Mug", category: "kitchen", price: 14, emoji: "mug" },
    { id: "kettle", name: "Electric Kettle", category: "kitchen", price: 39, emoji: "kettle" },
    { id: "lamp", name: "Desk Lamp", category: "office", price: 28, emoji: "lamp" },
    { id: "notebook", name: "Lined Notebook", category: "office", price: 9, emoji: "notebook" },
    { id: "pillow", name: "Throw Pillow", category: "home", price: 22, emoji: "pillow" },
    { id: "candle", name: "Soy Candle", category: "home", price: 16, emoji: "candle" },
  ];

  const EMOJI = {
    mug: "☕",
    kettle: "🫖",
    lamp: "💡",
    notebook: "📓",
    pillow: "🛋️",
    candle: "🕯️",
  };

  const state = {
    query: "",
    category: "all",
    cart: /** @type {Record<string, number>} */ ({}),
  };

  const $ = (id) => document.getElementById(id);

  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 1800);
  }

  function cartItems() {
    return Object.entries(state.cart)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => {
        const p = PRODUCTS.find((x) => x.id === id);
        return { ...p, qty, line: p.price * qty };
      });
  }

  function cartTotal() {
    return cartItems().reduce((s, i) => s + i.line, 0);
  }

  function renderCart() {
    const items = cartItems();
    const list = $("cartList");
    list.innerHTML = "";
    if (!items.length) {
      list.innerHTML = "<li><span>Cart is empty</span><span>$0.00</span></li>";
    } else {
      for (const item of items) {
        const li = document.createElement("li");
        li.innerHTML = `<span>${EMOJI[item.emoji] || ""} ${item.name} × ${item.qty}</span><span>$${item.line.toFixed(2)}</span>`;
        list.appendChild(li);
      }
    }
    const count = items.reduce((s, i) => s + i.qty, 0);
    $("cartSummary").textContent = `Cart: ${count} · $${cartTotal().toFixed(2)}`;
  }

  function filteredProducts() {
    const q = state.query.trim().toLowerCase();
    return PRODUCTS.filter((p) => {
      if (state.category !== "all" && p.category !== state.category) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.category.includes(q) || p.id.includes(q);
    });
  }

  function renderCatalog() {
    const grid = $("catalog");
    grid.innerHTML = "";
    const items = filteredProducts();
    $("searchStatus").textContent = items.length
      ? `Showing ${items.length} product(s)${state.query ? ` for “${state.query}”` : ""}.`
      : "No products matched.";
    for (const p of items) {
      const card = document.createElement("article");
      card.className = "card";
      card.innerHTML = `
        <div class="emoji">${EMOJI[p.emoji] || "📦"}</div>
        <strong>${p.name}</strong>
        <div class="meta">${p.category}</div>
        <div class="price">$${p.price.toFixed(2)}</div>
        <button type="button" data-add="${p.id}">Add to cart</button>
      `;
      grid.appendChild(card);
    }
  }

  window.DemoShop = {
    addToCart(id) {
      const p = PRODUCTS.find((x) => x.id === id);
      if (!p) return { ok: false, error: "unknown product" };
      state.cart[id] = (state.cart[id] || 0) + 1;
      renderCart();
      toast(`Added ${p.name}`);
      return { ok: true, product: p.name, cartTotal: cartTotal(), items: cartItems() };
    },
    clearCart() {
      state.cart = {};
      renderCart();
      toast("Cart cleared");
      return { ok: true, cartTotal: 0 };
    },
    getCart() {
      return { items: cartItems(), total: cartTotal() };
    },
    listProducts() {
      return PRODUCTS.map(({ id, name, price, category }) => ({ id, name, price, category }));
    },
    search(q, category) {
      state.query = q || "";
      state.category = category || "all";
      renderCatalog();
      return { ok: true, query: state.query, category: state.category, count: filteredProducts().length };
    },
  };

  $("catalog").addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-add]");
    if (!btn) return;
    DemoShop.addToCart(btn.getAttribute("data-add"));
  });

  $("searchForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const result = DemoShop.search(String(fd.get("q") || ""), String(fd.get("category") || "all"));
    // Agent-friendly respondWith when available
    if (ev.respondWith) {
      ev.preventDefault();
      ev.respondWith(Promise.resolve(result));
    }
  });

  $("clearCart").addEventListener("click", () => DemoShop.clearCart());
  $("checkoutBtn").addEventListener("click", () => {
    $("checkoutSection").hidden = false;
    $("checkoutSection").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("cancelCheckout").addEventListener("click", () => {
    $("checkoutSection").hidden = true;
  });

  $("checkoutForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const order = {
      ok: true,
      name: String(fd.get("name") || ""),
      email: String(fd.get("email") || ""),
      address: String(fd.get("address") || ""),
      total: cartTotal(),
      items: cartItems(),
      orderId: "NW-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
    };
    $("orderStatus").textContent = `Order ${order.orderId} placed for $${order.total.toFixed(2)}.`;
    toast(`Order ${order.orderId} placed`);
    DemoShop.clearCart();
    if (ev.respondWith) {
      ev.respondWith(Promise.resolve(order));
    }
  });

  renderCatalog();
  renderCart();
})();
