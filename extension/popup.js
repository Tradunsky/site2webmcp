"use strict";

const $ = (id) => document.getElementById(id);

const DEBUG_SNIPPET = `const ctx = document.modelContext ?? navigator.modelContext;
if (!ctx) {
  console.warn("WebMCP not available — enable chrome://flags/#enable-webmcp-testing and use HTTPS or localhost");
} else {
  const tools = await ctx.getTools();
  console.table(tools.map(t => ({ name: t.name, description: t.description })));
  tools;
}`;

async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

function renderSummary(summary, tab) {
  const host = (summary && summary.hostname) || (tab && new URL(tab.url || "about:blank").hostname) || "—";
  $("hostname").textContent = host;
  const tools = (summary && summary.tools) || [];
  $("count").textContent = String(tools.length);
  const enabled = !summary || summary.enabled !== false;
  $("enabled").checked = enabled;
  $("status").textContent = enabled
    ? tools.length
      ? `${tools.length} tool(s) exposed on this page`
      : "No discoverable forms/actions yet"
    : "Disabled — tools cleared";

  const ul = $("tools");
  ul.innerHTML = "";
  if (!tools.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Open a page with forms or Add to cart / Checkout buttons.";
    ul.appendChild(li);
    return;
  }
  for (const t of tools) {
    const li = document.createElement("li");
    li.innerHTML = `<div class="name"></div><div class="desc"></div><div class="kind"></div>`;
    li.querySelector(".name").textContent = t.name;
    li.querySelector(".desc").textContent = t.description || "";
    li.querySelector(".kind").textContent = t.kind || "";
    ul.appendChild(li);
  }
}

async function refresh() {
  const tab = await activeTab();
  if (!tab || tab.id == null || !/^https?:/.test(tab.url || "")) {
    renderSummary({ hostname: "unsupported", tools: [], enabled: true }, tab);
    $("status").textContent = "Open an http(s) page to discover tools.";
    return;
  }
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: "get-summary" });
    if (res && res.summary) {
      renderSummary(res.summary, tab);
    } else {
      // Trigger a rescan if content script has no summary yet
      const scanned = await chrome.tabs.sendMessage(tab.id, { type: "rescan" });
      renderSummary((scanned && scanned.summary) || { tools: [] }, tab);
    }
  } catch (err) {
    $("hostname").textContent = new URL(tab.url).hostname;
    $("status").textContent = "Content script not ready — reload the page.";
    $("tools").innerHTML = `<li class="empty">${String(err.message || err)}</li>`;
  }
}

$("rescan").addEventListener("click", async () => {
  const tab = await activeTab();
  if (!tab || tab.id == null) return;
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: "rescan" });
    renderSummary((res && res.summary) || { tools: [] }, tab);
  } catch (err) {
    $("status").textContent = String(err.message || err);
  }
});

$("enabled").addEventListener("change", async () => {
  const enabled = $("enabled").checked;
  await chrome.storage.sync.set({ enabled });
  await chrome.runtime.sendMessage({ type: "set-enabled", enabled });
  const tab = await activeTab();
  if (tab && tab.id != null) {
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: "set-enabled", enabled });
      renderSummary((res && res.summary) || { tools: [], enabled }, tab);
    } catch (_) {
      refresh();
    }
  }
});

$("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(DEBUG_SNIPPET);
    $("status").textContent = "Debug snippet copied — paste in the page DevTools console.";
  } catch (_) {
    $("status").textContent = "Clipboard failed — select snippet from README.";
  }
});

refresh();
