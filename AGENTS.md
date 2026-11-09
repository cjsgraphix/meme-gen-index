# MemeGenIndex

Rules for working on this site. Read this before editing.

## What it is

MemeGenIndex is a personal portfolio page for meme coins the owner launched on pump.fun. Each coin is a pump.fun custom pair: it trades against a tokenized stock (TSLAX, NVDAX, HOOD, SPYX, AMZNX, and any pair added later). Creator fees are paid in that paired stock token, not in SOL.

pump.fun’s one-hop rule: a new coin can be paired against an asset that already trades. A coin that was itself launched on pump.fun cannot be used as the pair asset for another coin.

The shipped book is sample data. The Sample data badge stays up until `data/coins.json` sets `"sample": false`.

This is a static site: HTML, CSS, and vanilla JavaScript. No build step, no framework, no package manager. `index.html` stays at the repository root so GitHub Pages can serve the files as they are.

## File structure

- `index.html` — portfolio (overview, coin table, how it works)
- `coin.html` — one coin, opened as `coin.html?mint=<mint>`
- `data/coins.json` — the only data file. Adding a coin means editing this file.
- `assets/styles.css` — layout and type
- `assets/market.js` — load the book, DexScreener quotes, formatting, icons
- `assets/app.js` — portfolio page
- `assets/detail.js` — coin page and chart
- `assets/favicon.svg`
- `assets/coins/` — optional icon files referenced from `coins.json`
- `.nojekyll` — tells GitHub Pages not to run Jekyll
- `README.md` — owner-facing setup and deploy notes
- `AGENTS.md` — this file

Keep new code in those files. Do not add a bundler, a framework, or a second stylesheet.

## data/coins.json

One object in `coins` is one row. `pair` must match a key in `pairedAssets`.

```json
{
  "name": "Example Coin A",
  "ticker": "EXA",
  "mint": "YOUR_COIN_MINT",
  "placeholder": false,
  "pair": "TSLAX",
  "priceUsd": 0.00008421,
  "change24h": 6.42,
  "marketCapUsd": 186400,
  "creatorFeesToken": 3.15,
  "pumpUrl": "https://pump.fun/coin/YOUR_COIN_MINT",
  "icon": "assets/coins/exa.svg"
}
```

- `placeholder: true` skips the live price request. Set it to `false` only when `mint` is a real address.
- `priceUsd`, `change24h`, and `marketCapUsd` are the figures used when a live quote is missing.
- `creatorFeesToken` is the fee balance in the paired stock token, not in dollars. The page marks it to dollars at the pair’s last price.
- `pumpUrl` is optional. Leave it out and the Market column shows an em dash.
- `sparkline` (array of numbers) and `history` (`{ "start": "YYYY-MM-DD", "values": [...] }` or an array of `{ "time", "value" }`) are optional. If omitted, the page draws an illustrative path from the price and the 24h change and says so.
- `"sample": false` on the file hides the Sample data badge.

`pairedAssets` holds the tokenized stocks a coin can quote. Those mints are the pair assets, not the meme coins. Each entry has `symbol`, `name`, `kind`, `mint`, and fallback `priceUsd` / `change24h`. The HOOD entry is named “Equity token” on purpose.

### Icon field

`icon` is optional.

- A full image URL, such as the coin’s pump.fun or IPFS image (`https://...`).
- Or a file under `assets/coins/`: `assets/coins/exa.svg`, `./assets/coins/exa.svg`, or the bare filename `exa.svg`.

The book draws it at 28×28. The coin page draws it at 56×56. Images are lazy-loaded in the table and carry width and height so the row does not shift. If `icon` is missing, or the image fails to load, the page draws a monogram from the ticker (up to three characters) on a dark circle in the same palette.

When `icon` is omitted and the mint is real (`placeholder` is not true), `fetchLiveQuote` / `fetchLiveQuotes` in `assets/market.js` may fill the icon from DexScreener’s `info.imageUrl`. An explicit `icon` always wins over that URL.

## Run locally

From the site root (the folder that contains `index.html`):

```bash
python -m http.server 8742
```

Open `http://127.0.0.1:8742/`. If the `python` command is not available, use `python3 -m http.server 8742`.

A local server is required. Opening `index.html` as a file will not load `data/coins.json`, because browsers block ES module fetches on `file://`.

## Deploy to GitHub Pages

1. Keep `index.html` at the repository root.
2. In the repository, open Settings → Pages.
3. Under Build and deployment, set Source to Deploy from a branch.
4. Choose the branch to publish and the folder `/ (root)`. Save.
5. The site will be at `https://<user>.github.io/<repo>/`.

`.nojekyll` is already in the root so Pages serves the files as they are. Links are relative, so the same files work on a project site and on a user site served from the domain root.

## Design rules to preserve

The page should keep looking like a holdings blotter, not a marketing template.

- Type is IBM Plex Sans only. Prices and table figures use tabular numerals (`font-variant-numeric: tabular-nums`).
- Type scale stays 12, 14, 16, 20, 28. Spacing stays on an 8px grid: 8, 16, 24, 32, 48, 64.
- Palette is near-black and warm off-white. The brass accent (`#c6a15e`) is used sparingly: the nameplate rule, the sample badge, focus, and the price line.
- Green and red are only for 24h change and the small price path. They are the muted values already in `assets/styles.css`, not a bright signature green.
- No gradients, no glassmorphism, no emoji, no rainbow accents, no stock-illustration art, no buzzword copy (“unlock the future of…”).
- No Robinhood branding: do not use that issuer’s name, logo, or signature green. The HOOD pair stays labeled “Equity token”.
- Copy stays plain and specific. The footer disclaimer stays: not investment advice; tokenized stocks are subject to the issuer’s jurisdiction restrictions; figures may be delayed; sample entries are illustrative.
- Do not introduce a second font, a component library, or a chart library other than TradingView Lightweight Charts, which the detail page already loads from a CDN. Sparklines stay inline SVG.

## Live prices

`assets/market.js` calls `https://api.dexscreener.com/latest/dex/tokens/<mint>` and keeps the pool with the most liquidity. Placeholder mints are not requested. If the request fails or the response has no USD price, the page keeps the numbers in `data/coins.json`. Do not let a failed quote throw or log an error to the console.
