/**
 * Book loading, DexScreener quotes, and figure formatting.
 * Live quotes never throw: a null or a missing map entry means
 * the caller should keep the figures in data/coins.json.
 */

const QUOTE_URL = "https://api.dexscreener.com/latest/dex/tokens/";
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isFetchableMint(mint) {
  return typeof mint === "string" && BASE58.test(mint);
}

export async function loadBook() {
  const response = await fetch("data/coins.json", { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`data/coins.json returned ${response.status}`);
  }
  const book = await response.json();
  if (!book || typeof book !== "object" || !Array.isArray(book.coins)) {
    throw new Error("data/coins.json is missing a coins array");
  }
  if (!book.pairedAssets || typeof book.pairedAssets !== "object") {
    book.pairedAssets = {};
  }
  return book;
}

/**
 * Best-liquidity DexScreener quote for one mint.
 * URL: https://api.dexscreener.com/latest/dex/tokens/<mint>
 * Returns null when the mint is a placeholder, the request fails,
 * or the response has no usable USD price.
 */
export async function fetchLiveQuote(mint) {
  const quotes = await fetchLiveQuotes([mint]);
  return quotes.get(mint) || null;
}

/** Same endpoint, comma-separated, one request for the whole book. Never throws. */
export async function fetchLiveQuotes(mints) {
  const unique = [...new Set((mints || []).filter(isFetchableMint))];
  if (!unique.length) return new Map();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(
      `${QUOTE_URL}${unique.map(encodeURIComponent).join(",")}`,
      {
        signal: controller.signal,
        headers: { accept: "application/json" },
      }
    );
    if (!response.ok) return new Map();
    const body = await response.json();
    return quotesFromPairs(unique, Array.isArray(body?.pairs) ? body.pairs : []);
  } catch {
    return new Map();
  } finally {
    clearTimeout(timer);
  }
}

export function mintsToQuote(book) {
  const mints = [];
  const seen = new Set();
  const add = (mint) => {
    if (!isFetchableMint(mint) || seen.has(mint)) return;
    seen.add(mint);
    mints.push(mint);
  };
  for (const asset of Object.values(book.pairedAssets || {})) add(asset?.mint);
  for (const coin of book.coins || []) {
    if (!coin?.placeholder) add(coin?.mint);
  }
  return mints;
}

function quotesFromPairs(mints, pairs) {
  const best = new Map();
  for (const pair of pairs) {
    const mint = pair?.baseToken?.address;
    if (!mint || !mints.includes(mint)) continue;
    const liquidity = positive(pair?.liquidity?.usd) ?? 0;
    const imageUrl = imageFromPair(pair);
    const current = best.get(mint);
    if (!current || liquidity > current.liquidity) {
      best.set(mint, {
        liquidity,
        pair,
        imageUrl: imageUrl || current?.imageUrl || "",
      });
    } else if (imageUrl && !current.imageUrl) {
      current.imageUrl = imageUrl;
    }
  }

  const quotes = new Map();
  for (const [mint, entry] of best) {
    const pair = entry.pair;
    const priceUsd = positive(pair.priceUsd);
    const imageUrl = entry.imageUrl || "";
    if (priceUsd == null && !imageUrl) continue;
    quotes.set(mint, {
      mint,
      priceUsd,
      change24h: finite(pair?.priceChange?.h24),
      marketCapUsd: positive(pair.marketCap) ?? positive(pair.fdv),
      imageUrl,
      source: "dexscreener",
    });
  }
  return quotes;
}

function imageFromPair(pair) {
  return safeHttpUrl(pair?.info?.imageUrl) || "";
}

export function viewCoin(coin, live) {
  const quote = !coin?.placeholder && coin?.mint ? live.get(coin.mint) : null;
  const explicit = iconSource(coin?.icon);
  const icon = explicit || quote?.imageUrl || "";
  const base = { ...coin, icon, live: false };
  if (!quote || !(quote.priceUsd > 0)) return base;
  return {
    ...base,
    priceUsd: quote.priceUsd,
    change24h: quote.change24h ?? coin.change24h,
    marketCapUsd: quote.marketCapUsd ?? coin.marketCapUsd,
    live: true,
  };
}

/** Full image URL, or a path under assets/coins/. Anything else is ignored. */
export function iconSource(value) {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw) return "";
  const remote = safeHttpUrl(raw);
  if (remote) return remote;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//")) return "";
  let path = raw.replace(/^\.\//, "");
  if (path.includes("..") || path.includes("\\")) return "";
  if (path.startsWith("/")) path = path.slice(1);
  if (!path.startsWith("assets/coins/")) {
    if (!/^[\w.-]+$/.test(path)) return "";
    path = `assets/coins/${path}`;
  }
  if (!path.startsWith("assets/coins/")) return "";
  return path;
}

export function monogramLetters(coin) {
  const ticker = String(coin?.ticker || "").replace(/[^A-Za-z0-9]/g, "");
  const name = String(coin?.name || "").replace(/[^A-Za-z0-9]/g, "");
  const letters = (ticker || name).toUpperCase();
  if (!letters) return "–";
  return letters.length <= 3 ? letters : letters.slice(0, 2);
}

const MARK_PX = { sm: 28, lg: 56 };

export function coinMark(coin, size = "sm", id = "") {
  const px = MARK_PX[size] || 28;
  const letters = monogramLetters(coin);
  const src = iconSource(coin?.icon);
  const idAttr = id ? ` id="${esc(id)}"` : "";
  const sizeClass = size === "lg" ? " mark-lg" : "";
  if (!src) {
    return `<span class="mark${sizeClass} is-fallback"${idAttr} data-icon="" aria-hidden="true"><span class="monogram" data-len="${letters.length}">${esc(letters)}</span></span>`;
  }
  const loading = size === "lg" ? "eager" : "lazy";
  return `<span class="mark${sizeClass}"${idAttr} data-icon="${esc(src)}" aria-hidden="true"><img src="${esc(src)}" alt="" width="${px}" height="${px}" loading="${loading}" decoding="async" referrerpolicy="no-referrer"><span class="monogram" data-len="${letters.length}">${esc(letters)}</span></span>`;
}

export function bindImages(root) {
  root.addEventListener(
    "error",
    (event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement)) return;
      const mark = img.closest(".mark");
      if (!mark || !root.contains(mark)) return;
      img.remove();
      mark.classList.add("is-fallback");
      mark.dataset.icon = "";
    },
    true
  );
}

export function pairView(book, symbol, live) {
  const asset = book.pairedAssets?.[symbol] || null;
  if (!asset) {
    return {
      symbol: symbol || "—",
      name: "Unknown pair",
      kind: "",
      mint: "",
      priceUsd: null,
      change24h: null,
      quoteSource: "missing",
    };
  }
  const quote = asset.mint ? live.get(asset.mint) : null;
  const livePrice = quote?.priceUsd ?? null;
  const filePrice = positive(asset.priceUsd);
  return {
    symbol: asset.symbol || symbol,
    name: asset.name || "",
    kind: asset.kind || "Tokenized stock",
    mint: asset.mint || "",
    priceUsd: livePrice ?? filePrice,
    change24h: quote && quote.change24h != null ? quote.change24h : finite(asset.change24h),
    quoteSource: livePrice != null ? "dexscreener" : "file",
  };
}

export function feeUsd(coin, pair) {
  const qty = finite(coin?.creatorFeesToken);
  const price = pair?.priceUsd;
  if (qty == null || price == null) return null;
  return qty * price;
}

export function totals(book, live) {
  const coins = Array.isArray(book.coins) ? book.coins : [];
  let marketCap = 0;
  let fees = 0;
  let anyFee = false;
  for (const raw of coins) {
    const coin = viewCoin(raw, live);
    const cap = finite(coin.marketCapUsd);
    if (cap != null && cap > 0) marketCap += cap;
    const usd = feeUsd(raw, pairView(book, raw.pair, live));
    if (usd != null) {
      fees += usd;
      anyFee = true;
    }
  }
  return { count: coins.length, marketCap, fees: anyFee ? fees : null };
}

export function quoteState(book, live) {
  const wanted = mintsToQuote(book);
  if (!wanted.length) return "file";
  const got = wanted.some((mint) => live.get(mint)?.priceUsd > 0);
  return got ? "live" : "fallback";
}

export function statusText(book, live, pending = false) {
  const sample = book.sample !== false;
  const coins = sample
    ? "Coin prices and market caps are sample figures from data/coins.json."
    : "Coin prices update from DexScreener when the mint is live, and stay on the file figures when it is not.";
  if (pending) {
    return `${coins} Creator fees are marked at the pair prices in that file until a quote returns.`;
  }
  const mode = quoteState(book, live);
  const fees =
    mode === "live"
      ? "Creator fees are token balances marked at the latest DexScreener price of each paired stock."
      : mode === "fallback"
        ? "DexScreener did not return pair prices, so creator fees are marked at the pair prices in data/coins.json."
        : "Creator fees are marked at the pair prices in data/coins.json.";
  return `${coins} ${fees}`;
}

export function seriesFor(coin, asOf) {
  const fromFile = normalizeHistory(coin?.history);
  if (fromFile.length >= 2) return { points: fromFile, synthetic: false };
  return { points: illustrativeSeries(coin, asOf), synthetic: true };
}

export function sparkFor(coin) {
  if (Array.isArray(coin?.sparkline)) {
    const values = coin.sparkline.map(Number).filter((value) => Number.isFinite(value));
    if (values.length >= 2) return values;
  }
  const { points } = seriesFor(coin);
  return points.slice(-24).map((point) => point.value);
}

export function illustrativeSeries(coin, asOf, days = 64) {
  const end = positive(coin?.priceUsd);
  if (end == null) return [];
  const change = finite(coin?.change24h);
  const safeChange = change == null ? 0 : Math.max(change, -90);
  const prev = end / (1 + safeChange / 100);
  const random = mulberry32(hashString(`${coin?.ticker || ""}:${coin?.name || ""}`));
  const start = end * (0.45 + random() * 1.1);
  const steps = Math.max(days - 1, 2);
  const logs = [Math.log(start)];
  for (let i = 0; i < steps - 1; i += 1) logs.push(logs[logs.length - 1] + gauss(random) * 0.03);
  const target = Math.log(Math.max(prev, 1e-12));
  const gap = target - logs[logs.length - 1];
  const last = logs.length - 1;
  const values = logs.map((value, index) => Math.exp(value + gap * (index / last)));
  values[values.length - 1] = prev;
  values.push(end);

  const endDate = parseDay(asOf) ?? utcToday();
  return values.map((value, index) => ({
    time: isoDay(endDate - (values.length - 1 - index) * 86400000),
    value,
  }));
}

function normalizeHistory(history) {
  if (Array.isArray(history)) {
    return dedupeDays(
      history
        .map((point) => ({ time: String(point?.time || ""), value: Number(point?.value) }))
        .filter((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.time) && point.value > 0)
    );
  }
  if (history && Array.isArray(history.values) && /^\d{4}-\d{2}-\d{2}$/.test(history.start || "")) {
    const start = Date.parse(`${history.start}T00:00:00Z`);
    if (!Number.isFinite(start)) return [];
    return dedupeDays(
      history.values
        .map((value, index) => ({
          time: isoDay(start + index * 86400000),
          value: Number(value),
        }))
        .filter((point) => point.value > 0)
    );
  }
  return [];
}

function dedupeDays(points) {
  const byDay = new Map();
  for (const point of points) byDay.set(point.time, point.value);
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([time, value]) => ({ time, value }));
}

export function sparklineSvg(values, change) {
  const width = 88;
  const height = 28;
  const pad = 2;
  const nums = (values || []).map(Number).filter((value) => Number.isFinite(value));
  const tone = change > 0 ? "up" : change < 0 ? "down" : "flat";
  if (nums.length < 2) {
    return `<svg class="spark spark-${tone}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true"></svg>`;
  }
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const step = (width - pad * 2) / (nums.length - 1);
  const commands = nums.map((value, index) => {
    const x = pad + index * step;
    const y = pad + (1 - (value - min) / span) * (height - pad * 2);
    return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  return `<svg class="spark spark-${tone}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true"><path d="${commands.join(" ")}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

export function formatUsd(value, digits = 2) {
  if (!Number.isFinite(value)) return "—";
  const sign = value < 0 ? "−" : "";
  const amount = Math.abs(value);
  if (amount >= 1e9) return `${sign}$${(amount / 1e9).toFixed(2)}B`;
  if (amount >= 1e6) return `${sign}$${(amount / 1e6).toFixed(2)}M`;
  return `${sign}$${amount.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function formatPrice(value) {
  if (!Number.isFinite(value)) return "—";
  const sign = value < 0 ? "−" : "";
  const amount = Math.abs(value);
  if (amount >= 1000) {
    return `${sign}$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (amount >= 1) return `${sign}$${amount.toFixed(2)}`;
  if (amount >= 0.01) return `${sign}$${amount.toFixed(4)}`;
  return `${sign}$${amount.toFixed(8)}`;
}

export function formatPct(value) {
  if (!Number.isFinite(value)) return "—";
  const text = Math.abs(value).toFixed(2);
  if (value > 0) return `+${text}%`;
  if (value < 0) return `−${text}%`;
  return `${text}%`;
}

export function pctClass(value) {
  if (!Number.isFinite(value) || value === 0) return "chg-flat";
  return value > 0 ? "chg-up" : "chg-down";
}

export function formatQty(value) {
  if (!Number.isFinite(value)) return "—";
  const amount = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (amount >= 1000) {
    return sign + amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  if (amount >= 1) {
    return sign + amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return sign + amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function formatAsOf(value) {
  const time = parseDay(value);
  if (time == null) return "";
  const date = new Date(time);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

export function safeHttpUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.href;
  } catch {
    return "";
  }
}

export function bindCopy(root) {
  root.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-copy]");
    if (!button || !root.contains(button)) return;
    event.preventDefault();
    void flashCopy(button);
  });
}

async function flashCopy(button) {
  const text = button.getAttribute("data-copy") || "";
  const label = button.dataset.label || button.textContent || "Copy";
  const ok = await copyText(text);
  button.textContent = ok ? "Copied" : "Not copied";
  window.clearTimeout(button.copyTimer);
  button.copyTimer = window.setTimeout(() => {
    button.textContent = label;
  }, 1400);
}

export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the selection method */
  }
  try {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.top = "0";
    field.style.left = "0";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.focus();
    field.select();
    const ok = document.execCommand("copy");
    field.remove();
    return ok;
  } catch {
    return false;
  }
}

function finite(value) {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function positive(value) {
  const number = finite(value);
  return number != null && number > 0 ? number : null;
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(random) {
  let u = random();
  const v = random();
  if (u < 1e-9) u = 1e-9;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
}

function parseDay(value) {
  if (typeof value !== "string" || !value) return null;
  const time = Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isFinite(time) ? time : null;
}

function utcToday() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function isoDay(time) {
  return new Date(time).toISOString().slice(0, 10);
}
