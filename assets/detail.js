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
} from "./market.js?v=20261108b";

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
  chart: null,
  rangeDays: 64,
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
  const arrow = change > 0 ? "▲" : change < 0 ? "▼" : "";
  const price = Number(coin.priceUsd);
  const cap = Number(coin.marketCapUsd);
  const qty = Number(view.raw.creatorFeesToken);
  const fees = feeUsd(view.raw, pair);
  const date = formatAsOf(view.book.asOf);
  const pairLabel = pair.name ? `${pair.symbol} (${pair.name})` : pair.symbol;
  const market = safeHttpUrl(view.raw.pumpUrl);
  const headRight = view.book.sample !== false || series.synthetic ? "Illustrative Series" : "Historical Series";
  const caption = series.synthetic
    ? "Illustrative daily path drawn from the price and 24h change in data/coins.json. Not a live print."
    : "Daily path from this coin’s history in data/coins.json. Not a live print.";

  document.title = `${coin.name || "Coin"}${coin.ticker ? ` (${coin.ticker})` : ""} · MemeGenIndex`;

  app.innerHTML = `
    <p class="back"><a href="index.html">← Back to Index Portfolio</a></p>
    <div class="detail-grid">
      <div class="chart-col">
        <div class="title-block">
          <div class="title-row">
            ${coinMark(coin, "lg", "coin-mark")}
            <div class="title-copy">
              <div class="rh-kicker-row" style="margin-bottom: 4px;">
                <span class="rh-pair-tag">${esc(coin.ticker || "—")} / ${esc(pair.symbol)}</span>
                ${date ? `<span class="rh-asof">${esc(date)}</span>` : ""}
              </div>
              <h1>${esc(coin.name || "Untitled")}</h1>
              <p class="sub">Quoted in ${esc(pairLabel)} via pump.fun Custom Pair</p>
            </div>
          </div>
        </div>

        <div class="quote">
          <div>
            <p class="px" id="px">${esc(Number.isFinite(price) ? formatPrice(price) : "—")}</p>
            <div class="rh-hero-delta" style="margin-top: 8px;">
              <span class="rh-delta-badge ${pctClass(change)}" id="chg">${arrow ? `${arrow} ` : ""}${esc(formatPct(change))}</span>
              <span class="rh-delta-period" id="px-meta">24h · ${esc(priceMeta(coin))}</span>
            </div>
          </div>
        </div>

        <div class="chart-head">
          <span>Daily Performance Curve</span>
          <span>${esc(headRight)}</span>
        </div>
        <div id="chart" class="chart-frame" role="group" aria-label="Daily price chart, illustrative"></div>
        <p class="caption" id="chart-caption">${esc(caption)}</p>
      </div>

      <aside class="facts" aria-label="Coin facts">
        <div class="rh-order-card">
          <div class="rh-order-top">
            <span class="rh-order-title">Trade ${esc(coin.ticker || "Coin")}</span>
            <span class="rh-order-pair">Pair: ${esc(pair.symbol)}</span>
          </div>
          ${
            market
              ? `<a class="rh-cta-primary" href="${esc(market)}" target="_blank" rel="noopener noreferrer">Open Pool on pump.fun ↗</a>`
              : `<p class="pair-name">No pump.fun page yet. Set pumpUrl in data/coins.json once launched.</p>`
          }
          <div class="rh-order-stats">
            <div class="rh-stat-row">
              <span>Market Cap</span>
              <strong id="mcap">${esc(Number.isFinite(cap) ? formatUsd(cap, 0) : "—")}</strong>
            </div>
            <div class="rh-stat-row">
              <span>Creator Fees (${esc(pair.symbol)})</span>
              <strong id="fee-token">${esc(Number.isFinite(qty) ? formatQty(qty) : "—")} ${esc(pair.symbol)}</strong>
            </div>
            <div class="rh-stat-row">
              <span>Fee Vault Value (USD)</span>
              <strong id="fee-usd" style="color: var(--up);">${fees == null ? "—" : esc(formatUsd(fees, 2))}</strong>
            </div>
          </div>
        </div>

        <section class="fact rh-fact-box">
          <h2>Paired Stock Quote</h2>
          <div class="rh-pair-quote-row">
            <div>
              <p class="pair-line">${esc(pair.symbol)}</p>
              ${pair.name ? `<p class="pair-name">${esc(pair.name)} · ${esc(pair.kind || "Tokenized stock")}</p>` : ""}
            </div>
            <div style="text-align: right;">
              <p class="px" id="pair-px">${esc(pair.priceUsd == null ? "—" : formatUsd(pair.priceUsd, 2))}</p>
              <p class="rh-pill ${pctClass(Number(pair.change24h))}" id="pair-chg" style="margin-top: 4px;">${esc(formatPct(Number(pair.change24h)))}</p>
            </div>
          </div>
          <p class="meta" id="pair-src">${esc(pairSource(pair))}</p>
          ${pair.mint ? `<p class="mint-label">Paired Stock Mint</p>${addressBlock(pair.mint, "Copy paired stock mint")}` : ""}
          <p class="restrict">Subject to the issuer’s jurisdiction restrictions.</p>
        </section>

        <section class="fact rh-fact-box">
          <h2>Coin Contract</h2>
          ${addressBlock(view.raw.mint || "", "Copy contract address")}
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
  const arrow = change > 0 ? "▲" : change < 0 ? "▼" : "";
  const price = Number(coin.priceUsd);
  const cap = Number(coin.marketCapUsd);
  const fees = feeUsd(view.raw, pair);
  setText("px", Number.isFinite(price) ? formatPrice(price) : "—");
  setText("px-meta", `24h · ${priceMeta(coin)}`);
  setText("chg", `${arrow ? `${arrow} ` : ""}${formatPct(change)}`);
  setClass("chg", `rh-delta-badge ${pctClass(change)}`);
  setText("mcap", Number.isFinite(cap) ? formatUsd(cap, 0) : "—");
  setText("fee-usd", fees == null ? "—" : formatUsd(fees, 2));
  setText("pair-px", pair.priceUsd == null ? "—" : formatUsd(pair.priceUsd, 2));
  setText("pair-chg", formatPct(Number(pair.change24h)));
  setClass("pair-chg", `rh-pill ${pctClass(Number(pair.change24h))}`);
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
    const isUp = Number(view.raw?.change24h ?? 0) >= 0;
    const lineColor = isUp ? cssVar("--up", "#00c805") : cssVar("--down", "#ff5000");
    const topColor = isUp ? "rgba(0, 200, 5, 0.24)" : "rgba(255, 80, 0, 0.24)";
    const bottomColor = "rgba(0, 0, 0, 0.0)";

    const chart = lib.createChart(frame, {
      autoSize: true,
      layout: {
        background: { type: "solid", color: cssVar("--bg-elev", "#0d1117") },
        textColor: cssVar("--text-faint", "#7d8590"),
        fontFamily: getComputedStyle(document.body).fontFamily,
        fontSize: 12,
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: cssVar("--line", "#1f242c") },
      },
      crosshair: {
        vertLine: { color: cssVar("--line-strong", "#30363d"), labelBackgroundColor: cssVar("--bg-elev", "#161b22") },
        horzLine: { color: cssVar("--line-strong", "#30363d"), labelBackgroundColor: cssVar("--bg-elev", "#161b22") },
      },
      rightPriceScale: {
        borderColor: cssVar("--line", "#1f242c"),
        minimumWidth: 96,
        scaleMargins: { top: 0.14, bottom: 0.14 },
      },
      timeScale: { borderColor: cssVar("--line", "#1f242c"), fixLeftEdge: true, fixRightEdge: true },
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
    const series = typeof chart.addAreaSeries === "function"
      ? chart.addAreaSeries({
          lineColor,
          topColor,
          bottomColor,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: true,
          crosshairMarkerRadius: 4,
          crosshairMarkerBorderColor: lineColor,
          crosshairMarkerBackgroundColor: cssVar("--bg", "#06080a"),
          priceFormat: { type: "price", precision: 8, minMove: 0.00000001 },
        })
      : chart.addLineSeries({
          color: lineColor,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: true,
          crosshairMarkerRadius: 4,
          crosshairMarkerBorderColor: lineColor,
          crosshairMarkerBackgroundColor: cssVar("--bg", "#06080a"),
          priceFormat: { type: "price", precision: 8, minMove: 0.00000001 },
        });
    series.setData(view.points);
    chart.timeScale().fitContent();
    view.series = series;
    view.chart = chart;
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
      return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="#1f242c" stroke-width="1"/>`;
    })
    .join("");
  return `<svg class="fallback" viewBox="0 0 ${width} ${height}" role="img" aria-label="Illustrative price path"><rect width="${width}" height="${height}" fill="#0d1117"/>${grid}<path d="${d}" fill="none" stroke="#00c805" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><text x="${left}" y="${height - 8}" fill="#7d8590" font-size="12" font-family="IBM Plex Sans, sans-serif">${esc(points[0].time)}</text><text x="${width - right}" y="${height - 8}" fill="#7d8590" font-size="12" text-anchor="end" font-family="IBM Plex Sans, sans-serif">${esc(points[points.length - 1].time)}</text></svg>`;
}

function paintIcon(coin) {
  const mark = document.getElementById("coin-mark");
  if (!mark) return;
  const next = coin.icon || "";
  if ((mark.dataset.icon || "") === next) return;
  mark.outerHTML = coinMark(coin, "lg", "coin-mark");
}

function priceMeta(coin) {
  if (coin.live) return "DexScreener Live";
  if (coin.placeholder || view.book.sample !== false) return "Sample mark from data/coins.json";
  return "File mark · Live quote unavailable";
}

function pairSource(pair) {
  if (pair.quoteSource === "dexscreener") return "Live DexScreener Quote · 24h";
  if (pair.quoteSource === "missing") return "No pair price in data/coins.json";
  return "Reference price from data/coins.json · 24h";
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
