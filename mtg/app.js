"use strict";

/* ============================================================
   MTG Search — Scryfall query builder + live results
   Fully client-side. Talks to https://api.scryfall.com.
   ============================================================ */

const API = "https://api.scryfall.com/cards/search";
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- Query building ---------------------------------- */

// Wrap a value in quotes if it contains whitespace or special chars.
function quoteIfNeeded(v) {
  return /[\s:"'()]/.test(v) ? `"${v.replace(/"/g, '')}"` : v;
}

// Read the form and produce an array of Scryfall query tokens.
function buildTokens() {
  const t = [];

  // Name
  const name = $("#name").value.trim();
  if (name) {
    if ($("#name-exact").checked) t.push("!" + quoteIfNeeded(name));
    else t.push(quoteIfNeeded(name));
  }

  // Colors / identity
  const letters = $$("#color-pills input:checked").map((el) => el.value).join("");
  const mode = $("#color-mode").value;         // c | id
  const op = $("#color-op").value;             // >= = <= :
  if (letters) t.push(`${mode}${op}${letters}`);
  if ($("#color-colorless").checked) t.push(`${mode}:colorless`);
  if ($("#color-multi").checked) t.push(`${mode}:multicolor`);

  // Type line (each word -> its own t: term)
  const typeNeg = $("#type-neg").checked ? "-" : "";
  $("#type").value.trim().split(/\s+/).filter(Boolean).forEach((w) => {
    t.push(`${typeNeg}t:${quoteIfNeeded(w)}`);
  });

  // Oracle text
  const oracle = $("#oracle").value.trim();
  if (oracle) t.push(`${$("#oracle-neg").checked ? "-" : ""}o:${quoteIfNeeded(oracle)}`);

  // Keyword ability
  const kw = $("#keyword").value.trim();
  if (kw) t.push(`kw:${quoteIfNeeded(kw)}`);

  // Mana cost + mana value
  const mc = $("#manacost").value.trim();
  if (mc) t.push(`m:${mc}`);
  const mvOp = $("#mv-op").value, mv = $("#mv").value.trim();
  if (mvOp && mv !== "") t.push(`mv${mvOp}${mv}`);

  // Power / Toughness / Loyalty
  ["pow", "tou", "loy"].forEach((stat) => {
    const o = $(`select[data-stat="${stat}"][data-role="op"]`).value;
    const v = $(`input[data-stat="${stat}"][data-role="val"]`).value.trim();
    if (o && v !== "") t.push(`${stat}${o}${v}`);
  });

  // Rarity (OR multiple)
  const rarities = $$("#rarity-pills input:checked").map((el) => `r:${el.value}`);
  if (rarities.length === 1) t.push(rarities[0]);
  else if (rarities.length > 1) t.push(`(${rarities.join(" or ")})`);

  // Set codes
  const sets = $("#set").value.trim().split(/[\s,]+/).filter(Boolean).map((s) => `e:${s}`);
  if (sets.length === 1) t.push(sets[0]);
  else if (sets.length > 1) t.push(`(${sets.join(" or ")})`);

  // Format legality
  const fmt = $("#format").value;
  if (fmt) t.push(`${$("#format-mode").value}:${fmt}`);

  // Price
  const pOp = $("#price-op").value, pVal = $("#price-val").value.trim();
  if (pOp && pVal !== "") t.push(`${$("#price-cur").value}${pOp}${pVal}`);

  // Artist
  const artist = $("#artist").value.trim();
  if (artist) t.push(`a:${quoteIfNeeded(artist)}`);

  // is: attributes
  $$("#is-pills input:checked").forEach((el) => t.push(`is:${el.value}`));

  return t;
}

function buildQuery() {
  return buildTokens().join(" ");
}

/* ---------- Sync form -> query box -------------------------- */

let queryEditedManually = false;

function syncQueryBox() {
  if (queryEditedManually) return; // don't stomp on hand-edits
  $("#query").value = buildQuery();
  updateScryfallLink();
}

function updateScryfallLink() {
  const q = $("#query").value.trim();
  const link = $("#open-scryfall");
  if (q) {
    link.href = "https://scryfall.com/search?q=" + encodeURIComponent(q);
    link.removeAttribute("aria-disabled");
  } else {
    link.href = "https://scryfall.com/advanced";
  }
}

/* ---------- Scryfall API ------------------------------------ */

let nextPageUrl = null;
let currentReqId = 0;

function currentSearchUrl() {
  const q = $("#query").value.trim();
  if (!q) return null;
  const params = new URLSearchParams({ q, unique: $("#unique").value });
  const order = $("#order").value;
  const dir = $("#dir").value;
  if (order) params.set("order", order);
  if (dir) params.set("dir", dir);
  return `${API}?${params.toString()}`;
}

async function runSearch(url, append = false) {
  const reqId = ++currentReqId;
  const statusEl = $("#status");
  const results = $("#results");
  const loadMore = $("#loadmore");

  if (!url) {
    statusEl.textContent = "Enter a query or pick some filters to search.";
    statusEl.classList.remove("error");
    results.innerHTML = "";
    loadMore.hidden = true;
    return;
  }

  statusEl.classList.remove("error");
  statusEl.innerHTML = `<span class="spinner"></span>${append ? "Loading more…" : "Searching…"}`;
  loadMore.disabled = true;
  if (!append) updateHash();

  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const data = await res.json();
    if (reqId !== currentReqId) return; // a newer search superseded this one

    if (data.object === "error") {
      results.innerHTML = append ? results.innerHTML : "";
      loadMore.hidden = true;
      statusEl.classList.add("error");
      statusEl.textContent =
        res.status === 404 ? "No cards found for that query." : (data.details || "Search error.");
      return;
    }

    if (!append) results.innerHTML = "";
    const frag = document.createDocumentFragment();
    data.data.forEach((card) => frag.appendChild(renderCard(card)));
    results.appendChild(frag);

    nextPageUrl = data.has_more ? data.next_page : null;
    loadMore.hidden = !nextPageUrl;
    loadMore.disabled = false;

    const shown = results.childElementCount;
    statusEl.textContent =
      `${data.total_cards.toLocaleString()} card${data.total_cards === 1 ? "" : "s"} found` +
      (nextPageUrl ? ` — showing ${shown.toLocaleString()}.` : ".");
  } catch (err) {
    if (reqId !== currentReqId) return;
    statusEl.classList.add("error");
    statusEl.textContent = "Network error — " + err.message;
    loadMore.hidden = true;
  }
}

function cardImage(card) {
  if (card.image_uris) return card.image_uris.normal || card.image_uris.large;
  if (card.card_faces && card.card_faces[0].image_uris)
    return card.card_faces[0].image_uris.normal || card.card_faces[0].image_uris.large;
  return null;
}

function renderCard(card) {
  const el = document.createElement("article");
  el.className = "card";

  const price = card.prices &&
    (card.prices.usd ? `$${card.prices.usd}` :
      card.prices.eur ? `€${card.prices.eur}` :
        card.prices.tix ? `${card.prices.tix} tix` : "");

  const img = cardImage(card);
  const a = document.createElement("a");
  a.href = card.scryfall_uri;
  a.target = "_blank";
  a.rel = "noopener";

  if (img) {
    const image = document.createElement("img");
    image.loading = "lazy";
    image.src = img;
    image.alt = card.name;
    a.appendChild(image);
  } else {
    a.innerHTML = `<div style="padding:14px;font-size:13px">${card.name}<br><span style="color:var(--text-dim)">${card.type_line || ""}</span></div>`;
  }

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.innerHTML = `<strong>${card.name}</strong><br>${card.set_name || ""}` +
    (price ? ` · <span class="price">${price}</span>` : "");

  // Left-click (no modifier) opens the in-app modal; modified clicks
  // and middle-clicks fall through to the Scryfall link.
  a.addEventListener("click", (e) => {
    if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      openModal(card);
    }
  });

  el.appendChild(a);
  el.appendChild(meta);
  return el;
}

/* ---------- Card detail modal ------------------------------- */

function faceValues(card, key) {
  if (card[key] != null && card[key] !== "") return card[key];
  if (card.card_faces) return card.card_faces.map((f) => f[key]).filter(Boolean).join("  //  ");
  return "";
}

function openModal(card) {
  const faces = card.card_faces && card.card_faces.some((f) => f.image_uris)
    ? card.card_faces : [card];
  const imgs = faces.map((f) => {
    const u = f.image_uris;
    return u ? `<img src="${esc(u.large || u.normal)}" alt="${esc(f.name || card.name)}" loading="lazy">` : "";
  }).join("");

  const prices = card.prices || {};
  const priceChips = [
    prices.usd && `<span>$${esc(prices.usd)}</span>`,
    prices.usd_foil && `<span>$${esc(prices.usd_foil)} foil</span>`,
    prices.eur && `<span>€${esc(prices.eur)}</span>`,
    prices.tix && `<span>${esc(prices.tix)} tix</span>`,
  ].filter(Boolean).join("");

  const oracle = faceValues(card, "oracle_text");

  $("#modal-body").innerHTML = `
    <div class="modal-imgs">${imgs || `<p>No image available.</p>`}</div>
    <div class="modal-info">
      <h2 id="modal-name">${esc(card.name)}</h2>
      <p class="type">${esc(faceValues(card, "type_line"))}${
        faceValues(card, "mana_cost") ? " · " + esc(faceValues(card, "mana_cost")) : ""}</p>
      ${oracle ? `<p class="oracle">${esc(oracle)}</p>` : ""}
      <dl>
        <dt>Set</dt><dd>${esc(card.set_name || "")} (${esc((card.set || "").toUpperCase())})</dd>
        <dt>Rarity</dt><dd>${esc(card.rarity || "")}</dd>
        ${card.artist ? `<dt>Artist</dt><dd>${esc(card.artist)}</dd>` : ""}
        ${card.cmc != null ? `<dt>Mana value</dt><dd>${esc(card.cmc)}</dd>` : ""}
      </dl>
      ${priceChips ? `<div class="prices">${priceChips}</div>` : ""}
      <a class="btn primary" href="${esc(card.scryfall_uri)}" target="_blank" rel="noopener">View on Scryfall ↗</a>
    </div>`;

  $("#modal").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModal() {
  $("#modal").hidden = true;
  document.body.style.overflow = "";
}

/* ---------- Query text helpers (OR / nesting / groups) ------ */

function editQuery(fn) {
  const box = $("#query");
  const start = box.selectionStart, end = box.selectionEnd;
  const val = box.value;
  const sel = val.slice(start, end);
  const { text, caret } = fn(val, start, end, sel);
  box.value = text;
  box.focus();
  const c = caret ?? text.length;
  box.setSelectionRange(c, c);
  queryEditedManually = true;
  updateScryfallLink();
}

function wrapParens() {
  editQuery((val, start, end, sel) => {
    if (sel) return { text: val.slice(0, start) + "(" + sel + ")" + val.slice(end), caret: end + 2 };
    const t = val.trim();
    return { text: t ? `(${t})` : "()", caret: (t ? t.length + 1 : 1) };
  });
}

function insertOr() {
  editQuery((val, start, end) => {
    const before = val.slice(0, end), after = val.slice(end);
    const ins = (before.endsWith(" ") || before === "" ? "" : " ") + "or " +
      (after.startsWith(" ") ? after.trimStart() : after);
    return { text: before + ins, caret: (before + (before.endsWith(" ") ? "" : " ") + "or ").length };
  });
}

function negateSelection() {
  editQuery((val, start, end, sel) => {
    if (sel) return { text: val.slice(0, start) + "-" + sel + val.slice(end), caret: end + 1 };
    return { text: val.slice(0, start) + "-" + val.slice(start), caret: start + 1 };
  });
}

function addGroup() {
  const inner = buildQuery().trim();
  if (!inner) return;
  const box = $("#query");
  const existing = box.value.trim();
  const conn = $("#group-conn").value;
  const group = `(${inner})`;
  box.value = existing ? `${existing} ${conn === "or" ? "or " : ""}${group}` : group;
  queryEditedManually = true;
  $("#builder").reset();          // clear panel to compose the next group
  updateScryfallLink();
  scheduleSearch();
}

async function copyQuery() {
  const q = $("#query").value.trim();
  if (!q) return;
  try {
    await navigator.clipboard.writeText(q);
    const btn = $("#a-copy"), old = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => (btn.textContent = old), 1200);
  } catch { /* clipboard blocked (e.g. file://) — ignore */ }
}

/* ---------- Shareable URL (hash) ---------------------------- */

function updateHash() {
  const params = new URLSearchParams();
  const q = $("#query").value.trim();
  if (q) params.set("q", q);
  if ($("#order").value) params.set("order", $("#order").value);
  if ($("#dir").value) params.set("dir", $("#dir").value);
  if ($("#unique").value !== "cards") params.set("unique", $("#unique").value);
  const hash = params.toString();
  history.replaceState(null, "", hash ? "#" + hash : location.pathname + location.search);
}

function restoreFromHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const q = params.get("q");
  if (params.get("order")) $("#order").value = params.get("order");
  if (params.get("dir")) $("#dir").value = params.get("dir");
  if (params.get("unique")) $("#unique").value = params.get("unique");
  if (q) {
    $("#query").value = q;
    queryEditedManually = true;
    updateScryfallLink();
    runSearch(currentSearchUrl(), false);
    return true;
  }
  return false;
}

/* ---------- Wiring ------------------------------------------ */

function doSearch() {
  syncQueryBox();
  updateScryfallLink();
  runSearch(currentSearchUrl(), false);
}

let debounceTimer = null;
function scheduleSearch() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(doSearch, 550);
}

function init() {
  const form = $("#builder");

  // Any form change → rebuild query + debounced search.
  form.addEventListener("input", () => { syncQueryBox(); scheduleSearch(); });
  form.addEventListener("change", () => { syncQueryBox(); scheduleSearch(); });

  // Manual edits to the query box take over.
  $("#query").addEventListener("input", () => {
    queryEditedManually = true;
    updateScryfallLink();
  });
  $("#query").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
      e.preventDefault();
      doSearch();
    }
  });

  $("#search").addEventListener("click", doSearch);
  ["order", "dir", "unique"].forEach((id) =>
    $("#" + id).addEventListener("change", () => runSearch(currentSearchUrl(), false)));

  $("#loadmore").addEventListener("click", () => runSearch(nextPageUrl, true));

  // Groups / assist toolbar
  $("#add-group").addEventListener("click", addGroup);
  $("#a-paren").addEventListener("click", wrapParens);
  $("#a-or").addEventListener("click", insertOr);
  $("#a-not").addEventListener("click", negateSelection);
  $("#a-copy").addEventListener("click", copyQuery);

  // Modal close (backdrop, × button, Esc)
  $("#modal").addEventListener("click", (e) => { if (e.target.dataset.close !== undefined) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#modal").hidden) closeModal(); });

  $("#reset").addEventListener("click", () => {
    form.reset();
    queryEditedManually = false;
    $("#query").value = "";
    $("#results").innerHTML = "";
    $("#loadmore").hidden = true;
    $("#status").textContent = "";
    updateHash();
    updateScryfallLink();
  });

  updateScryfallLink();
  if (!restoreFromHash())
    $("#status").textContent = "Pick filters or type a query, then Search.";
}

document.addEventListener("DOMContentLoaded", init);
