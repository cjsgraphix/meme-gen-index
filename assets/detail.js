import {
  loadBook,
  fetchLiveQuotes,
  viewCoin,
  pairView,
  feeUsd,
  seriesFor,
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
  isFetchableMint,
} from "./market.js";

const app = document.getElementById("app");
const badge = document.getElementById("sample-badge");

bindCopy(app);
bindImages(app);

const view = {
  book: null,
  raw: null,
  live: new Map(),
  points: [],
  series: null,
};

void init();

async function init() {
  app.setAttribute("aria-busy", "true");
  const mint = new URLSearchParams(location.search).get("mint");
  try {
    view.book = await loadBook();
    if (badge) badge.hidden = view.book.sample === false;
    if (!mint) {
      renderMissing("Add a mint to the address, for example coin.html?mint= followed by the coin mint in data/coins.json.");
      return;
    }
    view.raw = (view.book.coins || []).find((coin) => coin.mint === mint) || null;
    if (!view.raw) {
      renderMissing("No coin in data/coins.json uses this mint. Check the address, or add the coin to the file.");
      return;
    }
    render();
    await mountChart();
    document.documentElement.dataset.ready = "true";
    const mints = [];
    if (!view.raw.placeholder && isFetchableMint(view.raw.mint)) mints.push(view.raw.mint);
    const pair = view.book.pairedAssets?.[view.raw.pair];
    if (isFetchableMint(pair?.mint)) mints.push(pair.mint);
    view.live = await fetchLiveQuotes(mints);
    paintQuotes();
  } catch {
    app.innerHTML = `<div class="state"><p class="back"><a href="index.html">← Portfolio</a></p><h1>Book unavailable</h1><p>data/coins.json did not load. Serve the site from its root so this page can read the file.</p></div>`;
    document.documentElement.dataset.ready = "error";
    document.documentElement.dataset.quotes = "error";
  } finally {
    app.setAttribute("aria-busy", "false");
  }
}

function renderMissing(message) {
  app.innerHTML = `<div class="state"><p class="back"><a href="index.html">← Portfolio</a></p><h1>Not in the book</h1><p>${esc(message)}</p></div>`;
  document.documentElement.dataset.ready = "missing";
  document.documentElement.dataset.quotes = "file";
}

function render() {
  const coin = viewCoin(view.raw, view.live);
  const pair = pairView(view.book, view.raw.pair, view.live);
  const series = seriesFor(view.raw, view.book.asOf);
  view.points = series.points;
  const change = Number(coin.change24h);
  const price = Number(coin.priceUsd);
  const cap = Number(coin.marketCapUsd);
  const qty = Number(view.raw.creatorFeesToken);
  const fees = feeUsd(view.raw, pair);
  const date = formatAsOf(view.book.asOf);
  const pairLabel = pair.name ? `${pair.symbol} (${pair.name})` : pair.symbol;
  const market = safeHttpUrl(view.raw.pumpUrl);
  const headRight = view.book.sample !== false || series.synthetic ? "Illustrative" : "From file";
  const caption = series.synthetic
    ? "Illustrative daily path drawn from the price and 24h change in data/coins.json. Not a live print."
    : "Daily path from this coin’s history in data/coins.json. Not a live print.";

  document.title = `${coin.name || "Coin"}${coin.ticker ? ` (${coin.ticker})` : ""} · MemeGenIndex`;

  app.innerHTML = `
    <p class="back"><a href="index.html">← Portfolio</a></p>
    ${date ? `<p class="kicker">${esc(date)}</p>` : ""}
    <div class="title-block">
      <div class="title-row">
        ${coinMark(coin, "lg", "coin-mark")}
        <div class="title-copy">
          <h1>${esc(coin.name || "Untitled")}</h1>
          <p class="sub">${esc(coin.ticker || "—")} · Paired with ${esc(pairLabel)}</p>
        </div>
      </div>
    </div>
    <div class="quote">
      <div>
        <p class="px" id="px">${esc(Number.isFinite(price) ? formatPrice(price) : "—")}</p>
        <p class="meta" id="px-meta">${esc(priceMeta(coin))}</p>
      </div>
      <div>
        <p class="chg ${pctClass(change)}" id="chg">${esc(formatPct(change))}</p>
        <p class="meta">24h</p>
      </div>
    </div>
    <div class="detail-grid">
      <div class="chart-col">
        <div class="chart-head">
          <span>Daily closes</span>
          <span>${esc(headRight)}</span>
        </div>
        <div id="chart" class="chart-frame" role="group" aria-label="Daily price chart, illustrative"></div>
        <p class="caption" id="chart-caption">${esc(caption)}</p>
      </div>
      <aside class="facts" aria-label="Coin facts">
        <section class="fact">
          <h2>Market cap</h2>
          <p class="value" id="mcap">${esc(Number.isFinite(cap) ? formatUsd(cap, 0) : "—")}</p>
        </section>
        <section class="fact">
          <h2>Creator fees</h2>
          <p class="value" id="fee-token">${esc(Number.isFinite(qty) ? formatQty(qty) : "—")} ${esc(pair.symbol)}</p>
          <p class="subvalue" id="fee-usd">${fees == null ? "—" : esc(formatUsd(fees, 0))}</p>
        </section>
        <section class="fact">
          <h2>Paired stock</h2>
          <p class="pair-line">${esc(pair.symbol)}</p>
          ${pair.name ? `<p class="pair-name">${esc(pair.name)}</p>` : ""}
          ${pair.kind ? `<p class="kind">${esc(pair.kind)}</p>` : ""}
          <div class="pair-last">
            <p class="px" id="pair-px">${esc(pair.priceUsd == null ? "—" : formatUsd(pair.priceUsd, 2))}</p>
            <p class="chg ${pctClass(Number(pair.change24h))}" id="pair-chg">${esc(formatPct(Number(pair.change24h)))}</p>
          </div>
          <p class="meta" id="pair-src">${esc(pairSource(pair))}</p>
          ${pair.mint ? `<p class="mint-label">Mint</p>${addressBlock(pair.mint, "Copy paired stock mint")}` : ""}
          <p class="restrict">Subject to the issuer’s jurisdiction restrictions.</p>
        </section>
        <section class="fact">
          <h2>Contract</h2>
          ${addressBlock(view.raw.mint || "", "Copy contract address")}
        </section>
        <section class="fact">
          <h2>Market page</h2>
          ${
            market
              ? `<p><a class="link" href="${esc(market)}" target="_blank" rel="noopener noreferrer">Open on pump.fun<span aria-hidden="true"> ↗</span></a></p>`
              : `<p class="pair-name">No pump.fun page. This entry is a sample and its mint is a placeholder.</p>`
          }
        </section>
      </aside>
    </div>
  `;
}

function addressBlock(value, buttonLabel) {
  if (!value) return "";
  return `<div class="addr-row">
    <p class="addr">${esc(value)}</p>
    <button type="button" class="copy" data-copy="${esc(value)}" data-label="Copy" aria-label="${esc(buttonLabel)}">Copy</button>
  </div>`;
}

function paintQuotes() {
  const coin = viewCoin(view.raw, view.live);
  const pair = pairView(view.book, view.raw.pair, view.live);
  const change = Number(coin.change24h);
  const price = Number(coin.priceUsd);
  const cap = Number(coin.marketCapUsd);
  const fees = feeUsd(view.raw, pair);
  setText("px", Number.isFinite(price) ? formatPrice(price) : "—");
  setText("px-meta", priceMeta(coin));
  setText("chg", formatPct(change));
  setClass("chg", `chg ${pctClass(change)}`);
  setText("mcap", Number.isFinite(cap) ? formatUsd(cap, 0) : "—");
  setText("fee-usd", fees == null ? "—" : formatUsd(fees, 0));
  setText("pair-px", pair.priceUsd == null ? "—" : formatUsd(pair.priceUsd, 2));
  setText("pair-chg", formatPct(Number(pair.change24h)));
  setClass("pair-chg", `chg ${pctClass(Number(pair.change24h))}`);
  setText("pair-src", pairSource(pair));
  paintIcon(coin);

  if (coin.live && view.series && view.points.length) {
    const last = view.points[view.points.length - 1];
    try {
      view.series.update({ time: last.time, value: coin.priceUsd });
    } catch {
      /* keep the file path if the chart rejects the update */
    }
  }
  document.documentElement.dataset.quotes = pair.quoteSource === "dexscreener" || coin.live ? "live" : "fallback";
}

async function mountChart() {
  const frame = document.getElementById("chart");
  if (!frame || view.points.length < 2) {
    if (frame) frame.innerHTML = `<p class="caption">Not enough history to draw a chart.</p>`;
    return;
  }
  if (document.fonts?.ready) {
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => {
          window.setTimeout(resolve, 2500);
        }),
      ]);
    } catch {
      /* draw with the fallback face */
    }
  }
  if (frame.clientWidth < 10) {
    await nextFrame();
    await nextFrame();
  }
  const lib = window.LightweightCharts;
  if (!lib || typeof lib.createChart !== "function") {
    frame.innerHTML = fallbackChart(view.points);
    return;
  }
  try {
    const accent = cssVar("--accent", "#c6a15e");
    const chart = lib.createChart(frame, {
      autoSize: true,
      layout: {
        background: { type: "solid", color: cssVar("--bg", "#0e0f11") },
        textColor: cssVar("--text-faint", "#9c968c"),
        fontFamily: getComputedStyle(document.body).fontFamily,
        fontSize: 12,
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: cssVar("--line", "#2a2c31") },
      },
      crosshair: {
        vertLine: { color: cssVar("--line-strong", "#3c3f46"), labelBackgroundColor: cssVar("--bg-elev", "#1a1c20") },
        horzLine: { color: cssVar("--line-strong", "#3c3f46"), labelBackgroundColor: cssVar("--bg-elev", "#1a1c20") },
      },
      rightPriceScale: {
        borderColor: cssVar("--line", "#2a2c31"),
        minimumWidth: 96,
        scaleMargins: { top: 0.12, bottom: 0.12 },
      },
      timeScale: { borderColor: cssVar("--line", "#2a2c31"), fixLeftEdge: true, fixRightEdge: true },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: false, vertTouchDrag: false },
      handleScale: {
        mouseWheel: false,
        pinch: false,
        axisPressedMouseMove: { time: false, price: false },
        axisDoubleClickReset: { time: false, price: false },
      },
      kineticScroll: { mouse: false, touch: false },
      localization: {
        locale: "en-US",
        priceFormatter: (value) => formatPrice(value),
      },
    });
    const series = chart.addLineSeries({
      color: accent,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 3,
      crosshairMarkerBorderColor: accent,
      crosshairMarkerBackgroundColor: cssVar("--bg", "#0e0f11"),
      priceFormat: { type: "price", precision: 8, minMove: 0.00000001 },
    });
    series.setData(view.points);
    chart.timeScale().fitContent();
    view.series = series;
  } catch {
    frame.innerHTML = fallbackChart(view.points);
  }
}

function fallbackChart(points) {
  const width = 640;
  const height = 320;
  const left = 16;
  const right = 16;
  const top = 16;
  const bottom = 28;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerW = width - left - right;
  const innerH = height - top - bottom;
  const coords = points.map((point, index) => {
    const x = left + (index / (points.length - 1)) * innerW;
    const y = top + (1 - (point.value - min) / span) * innerH;
    return [x, y];
  });
  const d = coords.map((pair, index) => `${index ? "L" : "M"}${pair[0].toFixed(1)} ${pair[1].toFixed(1)}`).join(" ");
  const grid = [0.25, 0.5, 0.75]
    .map((t) => {
      const y = (top + innerH * t).toFixed(1);
      return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="#2a2c31" stroke-width="1"/>`;
    })
    .join("");
  return `<svg class="fallback" viewBox="0 0 ${width} ${height}" role="img" aria-label="Illustrative price path"><rect width="${width}" height="${height}" fill="#0e0f11"/>${grid}<path d="${d}" fill="none" stroke="#c6a15e" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><text x="${left}" y="${height - 8}" fill="#9c968c" font-size="12" font-family="IBM Plex Sans, sans-serif">${esc(points[0].time)}</text><text x="${width - right}" y="${height - 8}" fill="#9c968c" font-size="12" text-anchor="end" font-family="IBM Plex Sans, sans-serif">${esc(points[points.length - 1].time)}</text></svg>`;
}

function paintIcon(coin) {
  const mark = document.getElementById("coin-mark");
  if (!mark) return;
  const next = coin.icon || "";
  if ((mark.dataset.icon || "") === next) return;
  mark.outerHTML = coinMark(coin, "lg", "coin-mark");
}

function priceMeta(coin) {
  if (coin.live) return "DexScreener";
  if (coin.placeholder || view.book.sample !== false) return "Sample mark from data/coins.json";
  return "File mark. Live quote unavailable.";
}

function pairSource(pair) {
  if (pair.quoteSource === "dexscreener") return "DexScreener · 24h";
  if (pair.quoteSource === "missing") return "No pair price in data/coins.json";
  return "Pair price from data/coins.json · 24h";
}

function setText(id, text) {
  const node = document.getElementById(id);
  if (node) node.textContent = text;
}

function setClass(id, className) {
  const node = document.getElementById(id);
  if (node) node.className = className;
}

function cssVar(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
