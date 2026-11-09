import {
  loadBook,
  fetchLiveQuotes,
  mintsToQuote,
  viewCoin,
  pairView,
  feeUsd,
  totals,
  quoteState,
  statusText,
  sparkFor,
  sparklineSvg,
  formatUsd,
  formatPrice,
  formatPct,
  formatQty,
  formatAsOf,
  pctClass,
  esc,
  safeHttpUrl,
  bindCopy,
  bindImages,
  coinMark,
} from "./market.js";

const NARROW = window.matchMedia("(max-width: 1080px)");

const SORTS = [
  ["marketCapUsd", "desc", "Market cap ↓"],
  ["marketCapUsd", "asc", "Market cap ↑"],
  ["change24h", "desc", "24h ↓"],
  ["change24h", "asc", "24h ↑"],
  ["creatorFeesUsd", "desc", "Fees ↓"],
  ["creatorFeesUsd", "asc", "Fees ↑"],
  ["priceUsd", "desc", "Price ↓"],
  ["priceUsd", "asc", "Price ↑"],
  ["name", "asc", "Name A–Z"],
  ["name", "desc", "Name Z–A"],
  ["pair", "asc", "Pair A–Z"],
  ["pair", "desc", "Pair Z–A"],
];

const COLUMNS = [
  ["name", "Coin", false],
  ["pair", "Paired stock", false],
  ["priceUsd", "Price", true],
  ["change24h", "24h", true],
  ["marketCapUsd", "Market cap", true],
  ["creatorFeesUsd", "Creator fees", true],
];

const app = document.getElementById("app");
const badge = document.getElementById("sample-badge");

const state = {
  book: null,
  live: new Map(),
  sortKey: "marketCapUsd",
  sortDir: "desc",
};

bindCopy(app);
bindImages(app);
app.addEventListener("click", onClick);
app.addEventListener("change", onChange);
NARROW.addEventListener("change", syncNarrowLabels);

void init();

async function init() {
  app.setAttribute("aria-busy", "true");
  try {
    state.book = await loadBook();
    if (badge) badge.hidden = state.book.sample === false;
    render();
    document.documentElement.dataset.ready = "true";
    state.live = await fetchLiveQuotes(mintsToQuote(state.book));
    paintFigures();
  } catch {
    app.innerHTML = `<div class="state"><h1>Book unavailable</h1><p>data/coins.json did not load. From the site root, run <code>python3 -m http.server</code> and open that local address. Opening the HTML file directly will not load the book.</p></div>`;
    document.documentElement.dataset.ready = "error";
    document.documentElement.dataset.quotes = "error";
  } finally {
    app.setAttribute("aria-busy", "false");
  }
}

function render() {
  const book = state.book;
  const date = formatAsOf(book.asOf);
  const figure = totals(book, state.live);
  app.innerHTML = `
    <header class="intro" id="overview">
      <p class="kicker">${date ? esc(date) : "Portfolio"}</p>
      <h1>Portfolio</h1>
      <p class="lede">Meme coins launched on pump.fun, each quoted in a tokenized stock. Creator fees settle in that stock token.</p>
    </header>
    <section class="metrics" aria-label="Totals">
      <div class="metric">
        <p class="label">Coins</p>
        <p class="value" id="total-count">${figure.count}</p>
      </div>
      <div class="metric">
        <p class="label">Market cap</p>
        <p class="value" id="total-mcap">${esc(money(figure.marketCap))}</p>
      </div>
      <div class="metric">
        <p class="label">Creator fees</p>
        <p class="value" id="total-fees">${esc(money(figure.fees))}</p>
      </div>
    </section>
    <p class="status" id="quote-status">${esc(statusText(book, state.live, true))}</p>
    <section class="block" id="coins" aria-labelledby="coins-heading">
      <div class="section-head">
        <h2 id="coins-heading">Coins</h2>
        <label class="sort-label" for="sort">Sort
          <select id="sort">${sortOptions()}</select>
        </label>
      </div>
      <div class="book" role="table" aria-labelledby="coins-heading">
        <div class="book-head" role="row">${headMarkup()}</div>
        <div class="book-body" id="book-body" role="rowgroup"></div>
      </div>
    </section>
    ${howMarkup(book)}
  `;
  renderRows();
  document.documentElement.dataset.quotes = "pending";
}

function paintFigures() {
  const figure = totals(state.book, state.live);
  const count = document.getElementById("total-count");
  const mcap = document.getElementById("total-mcap");
  const fees = document.getElementById("total-fees");
  const status = document.getElementById("quote-status");
  if (count) count.textContent = String(figure.count);
  if (mcap) mcap.textContent = money(figure.marketCap);
  if (fees) fees.textContent = money(figure.fees);
  if (status) status.textContent = statusText(state.book, state.live);
  renderRows();
  document.documentElement.dataset.quotes = quoteState(state.book, state.live);
}

function renderRows() {
  const body = document.getElementById("book-body");
  if (!body) return;
  const rows = ranked();
  body.innerHTML = rows.length
    ? rows.map((row) => rowMarkup(row)).join("")
    : `<p class="state">No coins yet. Add an object to the coins array in data/coins.json.</p>`;
  paintSort();
  syncNarrowLabels();
}

function ranked() {
  return (state.book.coins || [])
    .map((raw) => ({
      raw,
      coin: viewCoin(raw, state.live),
      pair: pairView(state.book, raw.pair, state.live),
    }))
    .sort((a, b) => compareRows(a, b));
}

function compareRows(a, b) {
  const av = sortValue(a);
  const bv = sortValue(b);
  const aMissing = av == null || av === "";
  const bMissing = bv == null || bv === "";
  if (aMissing && bMissing) return nameOf(a).localeCompare(nameOf(b));
  if (aMissing) return 1;
  if (bMissing) return -1;
  let delta = typeof av === "string" ? av.localeCompare(bv) : av - bv;
  if (delta === 0) return nameOf(a).localeCompare(nameOf(b));
  return state.sortDir === "asc" ? delta : -delta;
}

function sortValue(row) {
  switch (state.sortKey) {
    case "name":
      return nameOf(row);
    case "pair":
      return (row.pair.symbol || "").toLowerCase();
    case "priceUsd":
      return finiteOrNull(row.coin.priceUsd);
    case "change24h":
      return finiteOrNull(row.coin.change24h);
    case "marketCapUsd":
      return finiteOrNull(row.coin.marketCapUsd);
    case "creatorFeesUsd":
      return feeUsd(row.raw, row.pair);
    default:
      return null;
  }
}

function nameOf(row) {
  return String(row.coin.name || row.coin.ticker || "").toLowerCase();
}

function headMarkup() {
  const sortable = COLUMNS.map(([key, label, numeric]) => {
    const active = state.sortKey === key;
    const arrow = active ? (state.sortDir === "asc" ? "↑" : "↓") : "";
    return `<div role="columnheader" aria-sort="${ariaSort(key)}" ${numeric ? 'class="num"' : ""}>
      <button type="button" data-sort="${key}">${esc(label)}<span class="sort-ind">${arrow}</span></button>
    </div>`;
  }).join("");
  return `${sortable}
    <div role="columnheader" class="num"><span class="col-label num">Path</span></div>
    <div role="columnheader" class="num"><span class="col-label num">Market</span></div>`;
}

function paintSort() {
  document.querySelectorAll("[data-sort]").forEach((button) => {
    const key = button.dataset.sort;
    const header = button.closest("[role='columnheader']");
    const active = key === state.sortKey;
    if (header) header.setAttribute("aria-sort", active ? (state.sortDir === "asc" ? "ascending" : "descending") : "none");
    const mark = button.querySelector(".sort-ind");
    if (mark) mark.textContent = active ? (state.sortDir === "asc" ? "↑" : "↓") : "";
  });
  const select = document.getElementById("sort");
  if (select) select.value = `${state.sortKey}:${state.sortDir}`;
}

function sortOptions() {
  return SORTS.map(([key, dir, label]) => {
    const value = `${key}:${dir}`;
    const selected = key === state.sortKey && dir === state.sortDir ? " selected" : "";
    return `<option value="${value}"${selected}>${esc(label)}</option>`;
  }).join("");
}

function rowMarkup(row) {
  const { raw, coin, pair } = row;
  const change = Number(coin.change24h);
  const fees = feeUsd(raw, pair);
  const href = `coin.html?mint=${encodeURIComponent(raw.mint || "")}`;
  const market = safeHttpUrl(raw.pumpUrl);
  const marketHtml = market
    ? `<a class="market" href="${esc(market)}" target="_blank" rel="noopener noreferrer">pump.fun<span aria-hidden="true"> ↗</span><span class="vh"> (opens in a new tab)</span></a>`
    : `<span class="muted" title="Sample entry. Set pumpUrl in data/coins.json.">—</span>`;
  const price = finiteOrNull(coin.priceUsd);
  const cap = finiteOrNull(coin.marketCapUsd);
  const qty = finiteOrNull(raw.creatorFeesToken);
  return `<div class="book-row" role="row" data-mint="${esc(raw.mint || "")}">
    <div role="cell" class="cell-coin">
      <a class="coin-link" href="${esc(href)}">
        ${coinMark(coin, "sm")}
        <span class="coin-id">
          <span class="coin-name">${esc(coin.name || "Untitled")}</span>
          <span class="coin-sub">${esc(coin.ticker || "—")}</span>
        </span>
      </a>
    </div>
    <div role="cell" class="cell-pair">
      <span class="pair-sym">${esc(pair.symbol)}</span>
      <span class="pair-sub">${esc(pair.name || "")}</span>
    </div>
    <div role="cell" class="cell-price num">${esc(price == null ? "—" : formatPrice(price))}${coin.live ? `<span class="live-tag">Live</span>` : ""}</div>
    <div role="cell" class="cell-chg num ${pctClass(change)}">${esc(formatPct(change))}</div>
    <div role="cell" class="cell-mcap num">
      <span class="narrow-label">Market cap</span>
      <span>${esc(cap == null ? "—" : formatUsd(cap, 0))}</span>
    </div>
    <div role="cell" class="cell-fees num">
      <span class="narrow-label">Creator fees</span>
      <span class="fee-token"><span class="fee-qty">${esc(qty == null ? "—" : formatQty(qty))}</span><span class="fee-sym">${esc(pair.symbol)}</span></span>
      <span class="fee-usd">${fees == null ? "—" : esc(formatUsd(fees, 0))}</span>
    </div>
    <div role="cell" class="cell-spark">
      <span class="vh">${esc(pathLabel(change))}</span>
      ${sparklineSvg(sparkFor(raw), change)}
    </div>
    <div role="cell" class="cell-market">
      <span class="narrow-label inline">Market</span>
      ${marketHtml}
    </div>
  </div>`;
}

function howMarkup(book) {
  const list = formatList(
    Object.values(book.pairedAssets || {}).map((asset) => {
      const name = asset?.name ? ` (${asset.name})` : "";
      return `${asset?.symbol || "Pair"}${name}`;
    })
  );
  return `<section class="block notes" id="how">
    <h2>How it works</h2>
    <div>
      <article class="note">
        <h3>Pair asset</h3>
        <p>Each coin is a pump.fun market whose quote asset is a tokenized stock. pump.fun calls that setup a custom pair: buys and sells move the coin against the stock token. The quote assets in this book are ${esc(list)}.</p>
      </article>
      <article class="note">
        <h3>One-hop rule</h3>
        <p>A new coin can be paired against an asset that already trades. A coin that was itself launched on pump.fun cannot be used as the pair asset for another coin. Pairing stops at one hop, so a coin in this book is not the quote side of a further launch.</p>
      </article>
      <article class="note">
        <h3>Creator fees</h3>
        <p>The creator’s fee is paid in the paired stock token. A coin paired with TSLAX earns TSLAX, not SOL. Dollar figures on this page mark those token balances at the pair’s last price. They are not a second market cap.</p>
      </article>
    </div>
  </section>`;
}

function onClick(event) {
  const button = event.target.closest("button[data-sort]");
  if (!button || !app.contains(button)) return;
  const key = button.dataset.sort;
  if (state.sortKey === key) {
    state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
  } else {
    state.sortKey = key;
    state.sortDir = key === "name" || key === "pair" ? "asc" : "desc";
  }
  renderRows();
}

function onChange(event) {
  if (event.target.id !== "sort") return;
  const [key, dir] = String(event.target.value).split(":");
  if (!key || (dir !== "asc" && dir !== "desc")) return;
  state.sortKey = key;
  state.sortDir = dir;
  renderRows();
}

function syncNarrowLabels() {
  const narrow = NARROW.matches;
  document.querySelectorAll(".narrow-label").forEach((label) => {
    if (narrow) label.removeAttribute("aria-hidden");
    else label.setAttribute("aria-hidden", "true");
  });
}

function ariaSort(key) {
  if (state.sortKey !== key) return "none";
  return state.sortDir === "asc" ? "ascending" : "descending";
}

function pathLabel(change) {
  if (!Number.isFinite(change) || change === 0) return "Price path, flat";
  return change > 0 ? "Price path, up" : "Price path, down";
}

function money(value) {
  return value == null || !Number.isFinite(value) ? "—" : formatUsd(value, 0);
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatList(items) {
  const clean = items.filter(Boolean);
  if (!clean.length) return "the pairs listed in data/coins.json";
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")}, and ${clean[clean.length - 1]}`;
}
