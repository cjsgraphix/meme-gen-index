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
  seriesFor,
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
  mountAmbientFX,
} from "./market.js?v=20261108c";

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

const RANGES = [
  ["1D", "Past 24 Hours", 2],
  ["1W", "Past Week", 8],
  ["1M", "Past Month", 30],
  ["3M", "Past 3 Months", 64],
  ["ALL", "All Time", 64],
];

const app = document.getElementById("app");
const badge = document.getElementById("sample-badge");

const state = {
  book: null,
  live: new Map(),
  sortKey: "marketCapUsd",
  sortDir: "desc",
  rangeKey: "3M",
  portfolioPoints: [],
};

bindCopy(app);
bindImages(app);
mountAmbientFX();
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

function buildPortfolioSeries(book, live, rangeKey) {
  const coins = Array.isArray(book.coins) ? book.coins : [];
  if (!coins.length) return [];

  if (rangeKey === "1D") {
    // Intraday 24-point curve from sparklines weighted by market cap
    const len = 24;
    const totalsByStep = new Array(len).fill(0);
    for (const raw of coins) {
      const coin = viewCoin(raw, live);
      const cap = finiteOrNull(coin.marketCapUsd) ?? 0;
      const spark = sparkFor(raw);
      const lastPx = spark[spark.length - 1] || coin.priceUsd || 1;
      for (let i = 0; i < len; i += 1) {
        const px = spark[Math.min(i, spark.length - 1)] || lastPx;
        const ratio = lastPx > 0 ? px / lastPx : 1;
        totalsByStep[i] += cap * ratio;
      }
    }
    return totalsByStep.map((val, idx) => ({
      label: idx === len - 1 ? "Now" : `${len - 1 - idx}h ago`,
      value: val,
    }));
  }

  const rangeEntry = RANGES.find(([k]) => k === rangeKey) || RANGES[3];
  const maxDays = rangeEntry[2];
  const byTime = new Map();

  for (const raw of coins) {
    const coin = viewCoin(raw, live);
    const cap = finiteOrNull(coin.marketCapUsd) ?? 0;
    const { points } = seriesFor(raw, book.asOf);
    const sliced = points.slice(-maxDays);
    const lastVal = sliced[sliced.length - 1]?.value || coin.priceUsd || 1;
    for (const pt of sliced) {
      const ratio = lastVal > 0 ? pt.value / lastVal : 1;
      byTime.set(pt.time, (byTime.get(pt.time) || 0) + cap * ratio);
    }
  }

  return [...byTime.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([time, value]) => ({
      label: formatAsOf(time) || time,
      value,
    }));
}

function render() {
  const book = state.book;
  const date = formatAsOf(book.asOf);
  const figure = totals(book, state.live);
  state.portfolioPoints = buildPortfolioSeries(book, state.live, state.rangeKey);
  const deltaInfo = computeSeriesDelta(state.portfolioPoints, figure.marketCap);

  app.innerHTML = `
    <div class="rh-tape-wrap" aria-label="Live market ticker tape">
      <div class="rh-tape-track" id="ticker-tape">
        ${tickerTapeMarkup(book, state.live)}
      </div>
    </div>

    <section class="rh-hero" id="overview">
      <div class="rh-hero-main">
        <div class="rh-kicker-row">
          <span class="rh-live-pill"><span class="rh-live-dot"></span>INDEX PORTFOLIO VALUE</span>
          <span class="rh-asof">${date ? `As of ${esc(date)}` : "Real-Time Blotter"}</span>
        </div>
        <h1 class="rh-hero-price" id="total-mcap">${esc(formatUsd(figure.marketCap, 2))}</h1>
        <div class="rh-hero-delta" id="hero-delta-row">
          <span class="rh-delta-badge ${pctClass(deltaInfo.pct)}" id="hero-delta-val">
            ${deltaInfo.pct >= 0 ? "▲" : "▼"} ${esc(formatUsd(Math.abs(deltaInfo.abs), 2))} (${esc(formatPct(deltaInfo.pct))})
          </span>
          <span class="rh-delta-period" id="hero-delta-period">${esc(deltaInfo.periodLabel)}</span>
        </div>

        <div class="rh-chart-wrap" id="hero-chart-wrap">
          ${renderHeroChartSvg(state.portfolioPoints, deltaInfo.pct)}
          <div class="rh-scrub-tooltip" id="hero-scrub-tip" hidden></div>
        </div>

        <div class="rh-range-bar" role="tablist" aria-label="Chart timeframe">
          ${RANGES.map(([key]) => `<button type="button" role="tab" aria-selected="${state.rangeKey === key}" class="rh-range-btn${state.rangeKey === key ? " is-active" : ""}" data-range="${key}">${key}</button>`).join("")}
        </div>
      </div>

      <aside class="rh-hero-card" aria-label="Portfolio summary and creator fee vault">
        <div class="rh-card-section">
          <div class="rh-card-header">
            <span class="rh-card-label">Creator Fee Vault</span>
            <span class="rh-card-tag">Settled in Stock Tokens</span>
          </div>
          <p class="rh-card-big" id="total-fees">${esc(money(figure.fees))}</p>
          <p class="rh-card-sub">Marked at live paired equity prices</p>
          <div class="rh-vault-list" id="vault-breakdown">
            ${vaultBreakdownMarkup(book, state.live)}
          </div>
        </div>

        <div class="rh-card-section rh-card-divider">
          <div class="rh-card-header">
            <span class="rh-card-label">Active Index Basket</span>
            <span class="rh-card-val"><strong id="total-count">${figure.count}</strong> Coins</span>
          </div>
          <div class="rh-alloc-bar" aria-label="Market cap weight distribution">
            ${allocationBarMarkup(book, state.live)}
          </div>
          <p class="rh-status-note" id="quote-status">${esc(statusText(book, state.live, true))}</p>
        </div>
      </aside>
    </section>

    <section class="rh-tickers-section" id="paired-equities" aria-label="Paired tokenized stocks">
      <div class="section-head">
        <h2>Paired Stock Tokens</h2>
        <span class="rh-section-sub">Underlying quote assets via Solana Tokenized Equities</span>
      </div>
      <div class="rh-ticker-strip" id="paired-strip">
        ${pairedStripMarkup(book, state.live)}
      </div>
    </section>

    <section class="block" id="coins" aria-labelledby="coins-heading">
      <div class="section-head">
        <div>
          <h2 id="coins-heading">Index Constituents</h2>
          <p class="rh-section-sub">Click any coin to open its interactive TradingView chart &amp; contract page</p>
        </div>
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
  bindHeroScrubber();
  document.documentElement.dataset.quotes = "pending";
}

function computeSeriesDelta(points, currentTotal) {
  const rangeEntry = RANGES.find(([k]) => k === state.rangeKey) || RANGES[3];
  const periodLabel = rangeEntry[1];
  if (!points || points.length < 2) {
    return { abs: 0, pct: 0, periodLabel };
  }
  const first = points[0].value || currentTotal || 1;
  const last = points[points.length - 1].value || currentTotal || first;
  const abs = last - first;
  const pct = first > 0 ? (abs / first) * 100 : 0;
  return { abs, pct, periodLabel };
}

function renderHeroChartSvg(points, pct) {
  const width = 760;
  const height = 240;
  const padX = 4;
  const padY = 18;
  const isUp = pct >= 0;
  const strokeColor = isUp ? "var(--up)" : "var(--down)";
  const gradId = isUp ? "rhGradUp" : "rhGradDown";

  if (!points || points.length < 2) {
    return `<svg class="rh-hero-svg" viewBox="0 0 ${width} ${height}" aria-hidden="true"></svg>`;
  }

  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const step = (width - padX * 2) / (points.length - 1);

  const coords = points.map((p, idx) => {
    const x = padX + idx * step;
    const y = padY + (1 - (p.value - min) / span) * (height - padY * 2);
    return [x, y];
  });

  const pathD = coords.map(([x, y], idx) => `${idx ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const areaD = `${pathD} L${coords[coords.length - 1][0].toFixed(1)} ${height} L${coords[0][0].toFixed(1)} ${height} Z`;
  const baseLineY = coords[0][1].toFixed(1);

  return `
    <svg class="rh-hero-svg" id="hero-chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Interactive portfolio performance chart">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.24"/>
          <stop offset="85%" stop-color="${strokeColor}" stop-opacity="0.02"/>
          <stop offset="100%" stop-color="${strokeColor}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <line x1="${padX}" y1="${baseLineY}" x2="${width - padX}" y2="${baseLineY}" stroke="var(--line-strong)" stroke-width="1" stroke-dasharray="4 4"/>
      <path d="${areaD}" fill="url(#${gradId})"/>
      <path d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      <line id="scrub-line" x1="0" y1="0" x2="0" y2="${height}" stroke="var(--text-dim)" stroke-width="1" visibility="hidden"/>
      <circle id="scrub-dot" cx="0" cy="0" r="5" fill="${strokeColor}" stroke="var(--bg)" stroke-width="2" visibility="hidden"/>
    </svg>
  `;
}

function bindHeroScrubber() {
  const wrap = document.getElementById("hero-chart-wrap");
  const svg = document.getElementById("hero-chart-svg");
  if (!wrap || !svg || state.portfolioPoints.length < 2) return;

  const line = document.getElementById("scrub-line");
  const dot = document.getElementById("scrub-dot");
  const mcapEl = document.getElementById("total-mcap");
  const deltaEl = document.getElementById("hero-delta-val");
  const periodEl = document.getElementById("hero-delta-period");

  const points = state.portfolioPoints;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const width = 760;
  const height = 240;
  const padX = 4;
  const padY = 18;

  const firstVal = points[0].value || 1;
  const finalTotal = totals(state.book, state.live).marketCap;
  const baseDelta = computeSeriesDelta(points, finalTotal);

  const handleMove = (clientX) => {
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    const relX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const idx = Math.round(relX * (points.length - 1));
    const pt = points[idx];
    if (!pt) return;

    const x = padX + (idx / (points.length - 1)) * (width - padX * 2);
    const y = padY + (1 - (pt.value - min) / span) * (height - padY * 2);

    if (line) {
      line.setAttribute("x1", x.toFixed(1));
      line.setAttribute("x2", x.toFixed(1));
      line.setAttribute("visibility", "visible");
    }
    if (dot) {
      dot.setAttribute("cx", x.toFixed(1));
      dot.setAttribute("cy", y.toFixed(1));
      dot.setAttribute("visibility", "visible");
    }
    if (mcapEl) mcapEl.textContent = formatUsd(pt.value, 2);
    if (deltaEl) {
      const abs = pt.value - firstVal;
      const pct = firstVal > 0 ? (abs / firstVal) * 100 : 0;
      deltaEl.className = `rh-delta-badge ${pctClass(pct)}`;
      deltaEl.textContent = `${pct >= 0 ? "▲" : "▼"} ${formatUsd(Math.abs(abs), 2)} (${formatPct(pct)})`;
    }
    if (periodEl) periodEl.textContent = pt.label;
  };

  const resetScrub = () => {
    if (line) line.setAttribute("visibility", "hidden");
    if (dot) dot.setAttribute("visibility", "hidden");
    if (mcapEl) mcapEl.textContent = formatUsd(finalTotal, 2);
    if (deltaEl) {
      deltaEl.className = `rh-delta-badge ${pctClass(baseDelta.pct)}`;
      deltaEl.textContent = `${baseDelta.pct >= 0 ? "▲" : "▼"} ${formatUsd(Math.abs(baseDelta.abs), 2)} (${formatPct(baseDelta.pct)})`;
    }
    if (periodEl) periodEl.textContent = baseDelta.periodLabel;
  };

  wrap.onpointermove = (e) => handleMove(e.clientX);
  wrap.onpointerleave = resetScrub;
}

function vaultBreakdownMarkup(book, live) {
  const coins = Array.isArray(book.coins) ? book.coins : [];
  return coins
    .map((raw) => {
      const pair = pairView(book, raw.pair, live);
      const qty = finiteOrNull(raw.creatorFeesToken);
      const usd = feeUsd(raw, pair);
      return `
        <div class="rh-vault-row">
          <div class="rh-vault-left">
            <span class="rh-vault-sym">${esc(pair.symbol)}</span>
            <span class="rh-vault-Via">via ${esc(raw.ticker || raw.name)}</span>
          </div>
          <div class="rh-vault-right">
            <span class="rh-vault-qty">${esc(qty == null ? "—" : formatQty(qty))} ${esc(pair.symbol)}</span>
            <span class="rh-vault-usd">${usd == null ? "—" : esc(formatUsd(usd, 2))}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function allocationBarMarkup(book, live) {
  const coins = Array.isArray(book.coins) ? book.coins : [];
  const fig = totals(book, live);
  const totalCap = fig.marketCap || 1;
  return coins
    .map((raw) => {
      const coin = viewCoin(raw, live);
      const cap = finiteOrNull(coin.marketCapUsd) || 0;
      const pct = Math.max(5, Math.round((cap / totalCap) * 100));
      const href = `coin.html?mint=${encodeURIComponent(raw.mint || "")}`;
      return `<a href="${esc(href)}" class="rh-alloc-seg" style="flex: ${pct} 1 0%;" title="${esc(coin.ticker)}: ${pct}% of index market cap">
        <span>${esc(coin.ticker)}</span>
        <span class="rh-alloc-pct">${pct}%</span>
      </a>`;
    })
    .join("");
}

function tickerTapeMarkup(book, live) {
  const entries = Object.keys(book.pairedAssets || {});
  const items = entries.map((symbol) => {
    const pair = pairView(book, symbol, live);
    const chg = Number(pair.change24h);
    const arrow = chg > 0 ? "▲" : chg < 0 ? "▼" : "•";
    const px = pair.priceUsd == null ? "—" : formatUsd(pair.priceUsd, 2);
    return `<span class="rh-tape-item">
      <strong>${esc(pair.symbol)}</strong>
      <span>${esc(px)}</span>
      <span class="${pctClass(chg)}">${arrow} ${esc(formatPct(chg))}</span>
    </span>`;
  });
  for (const raw of book.coins || []) {
    const coin = viewCoin(raw, live);
    const chg = Number(coin.change24h);
    const arrow = chg > 0 ? "▲" : chg < 0 ? "▼" : "•";
    items.push(`<span class="rh-tape-item">
      <strong>$${esc(coin.ticker)}/${esc(raw.pair)}</strong>
      <span>${esc(formatPrice(Number(coin.priceUsd)))}</span>
      <span class="${pctClass(chg)}">${arrow} ${esc(formatPct(chg))}</span>
    </span>`);
  }
  const pass = items.join('<span class="rh-tape-sep" aria-hidden="true">•</span>');
  return `<div class="rh-tape-group">${pass}</div><div class="rh-tape-group" aria-hidden="true">${pass}</div>`;
}

function pairedStripMarkup(book, live) {
  const entries = Object.keys(book.pairedAssets || {});
  return entries
    .map((symbol) => {
      const pair = pairView(book, symbol, live);
      const chg = Number(pair.change24h);
      const arrow = chg > 0 ? "▲" : chg < 0 ? "▼" : "•";
      const isLive = pair.quoteSource === "dexscreener";
      return `
        <div class="rh-pair-card">
          <div class="rh-pair-top">
            <div>
              <span class="rh-pair-symbol">${esc(pair.symbol)}</span>
              <span class="rh-pair-name">${esc(pair.name)}</span>
            </div>
            <span class="rh-pair-status ${isLive ? "is-live" : ""}">${isLive ? "Live" : "File"}</span>
          </div>
          <div class="rh-pair-bottom">
            <span class="rh-pair-price">${esc(pair.priceUsd == null ? "—" : formatUsd(pair.priceUsd, 2))}</span>
            <span class="rh-pill ${pctClass(chg)}">${arrow} ${esc(formatPct(chg))}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function paintFigures() {
  const figure = totals(state.book, state.live);
  state.portfolioPoints = buildPortfolioSeries(state.book, state.live, state.rangeKey);
  const deltaInfo = computeSeriesDelta(state.portfolioPoints, figure.marketCap);

  const count = document.getElementById("total-count");
  const mcap = document.getElementById("total-mcap");
  const fees = document.getElementById("total-fees");
  const status = document.getElementById("quote-status");
  const deltaVal = document.getElementById("hero-delta-val");
  const deltaPeriod = document.getElementById("hero-delta-period");
  const chartWrap = document.getElementById("hero-chart-wrap");
  const vaultEl = document.getElementById("vault-breakdown");
  const stripEl = document.getElementById("paired-strip");

  if (count) count.textContent = String(figure.count);
  if (mcap) mcap.textContent = formatUsd(figure.marketCap, 2);
  if (fees) fees.textContent = money(figure.fees);
  if (status) status.textContent = statusText(state.book, state.live);
  if (deltaVal) {
    deltaVal.className = `rh-delta-badge ${pctClass(deltaInfo.pct)}`;
    deltaVal.textContent = `${deltaInfo.pct >= 0 ? "▲" : "▼"} ${formatUsd(Math.abs(deltaInfo.abs), 2)} (${formatPct(deltaInfo.pct)})`;
  }
  if (deltaPeriod) deltaPeriod.textContent = deltaInfo.periodLabel;
  if (chartWrap) {
    chartWrap.innerHTML = renderHeroChartSvg(state.portfolioPoints, deltaInfo.pct);
    bindHeroScrubber();
  }
  if (vaultEl) vaultEl.innerHTML = vaultBreakdownMarkup(state.book, state.live);
  if (stripEl) stripEl.innerHTML = pairedStripMarkup(state.book, state.live);
  const tapeEl = document.getElementById("ticker-tape");
  if (tapeEl) tapeEl.innerHTML = tickerTapeMarkup(state.book, state.live);

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
    <div role="columnheader" class="num"><span class="col-label num">24h Trend</span></div>
    <div role="columnheader" class="num"><span class="col-label num">Trade</span></div>`;
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
  const arrow = change > 0 ? "▲" : change < 0 ? "▼" : "";
  const fees = feeUsd(raw, pair);
  const href = `coin.html?mint=${encodeURIComponent(raw.mint || "")}`;
  const market = safeHttpUrl(raw.pumpUrl);
  const marketHtml = market
    ? `<a class="rh-trade-btn" href="${esc(market)}" target="_blank" rel="noopener noreferrer">pump.fun<span aria-hidden="true"> ↗</span><span class="vh"> (opens in a new tab)</span></a>`
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
    <div role="cell" class="cell-chg num">
      <span class="rh-pill ${pctClass(change)}">${arrow ? `${arrow} ` : ""}${esc(formatPct(change))}</span>
    </div>
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
    <div>
      <h2>How It Works</h2>
      <p class="rh-section-sub" style="margin-top: 6px;">Programmatic RWA custom-pair mechanics</p>
    </div>
    <div class="rh-notes-grid">
      <article class="rh-note-card">
        <span class="rh-note-idx">01</span>
        <h3>Pair Asset</h3>
        <p>Each coin is a pump.fun market whose quote asset is a tokenized stock. pump.fun calls that setup a custom pair: buys and sells move the coin against the stock token. The quote assets in this book are ${esc(list)}.</p>
      </article>
      <article class="rh-note-card">
        <span class="rh-note-idx">02</span>
        <h3>One-Hop Rule</h3>
        <p>A new coin can be paired against an asset that already trades. A coin that was itself launched on pump.fun cannot be used as the pair asset for another coin. Pairing stops at one hop, so a coin in this book is not the quote side of a further launch.</p>
      </article>
      <article class="rh-note-card">
        <span class="rh-note-idx">03</span>
        <h3>Creator Fees in Stock</h3>
        <p>The creator’s fee is paid in the paired stock token. A coin paired with TSLAX earns TSLAX, not SOL. Dollar figures on this page mark those token balances at the pair’s last price. They are not a second market cap.</p>
      </article>
    </div>
  </section>`;
}

function onClick(event) {
  const rangeBtn = event.target.closest("button[data-range]");
  if (rangeBtn && app.contains(rangeBtn)) {
    const nextRange = rangeBtn.dataset.range;
    if (nextRange && nextRange !== state.rangeKey) {
      state.rangeKey = nextRange;
      document.querySelectorAll("button[data-range]").forEach((btn) => {
        const active = btn.dataset.range === nextRange;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-selected", String(active));
      });
      paintFigures();
    }
    return;
  }

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
