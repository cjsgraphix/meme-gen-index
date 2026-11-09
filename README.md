# MemeGenIndex

Personal portfolio page for meme coins launched on [pump.fun](https://pump.fun) against a tokenized stock. Each coin is a custom pair: it trades against that stock token, and creator fees are paid in the stock token rather than in SOL.

The site is static HTML, CSS, and vanilla JavaScript. There is no build step. `index.html` stays at the repository root, so GitHub Pages can publish the repository as-is.

The coins shipped in `data/coins.json` are examples. The page shows a Sample data badge until you set `"sample": false`.

## Preview locally

From the repository root:

```bash
python3 -m http.server 8742
```

Open `http://127.0.0.1:8742/`.

Use a local server. Opening `index.html` as a file will not load `data/coins.json`, because browsers block ES module fetches on `file://`.

## Add a coin

Edit `data/coins.json`. One object in `coins` is one row.

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

| Field | Meaning |
| --- | --- |
| `name`, `ticker` | Shown in the book. |
| `mint` | The coin’s address. The detail page is `coin.html?mint=` plus this value. |
| `placeholder` | `true` skips the live price request. Set `false` once the mint is real. |
| `pair` | A key in `pairedAssets`. Creator fees are denominated in that token. |
| `priceUsd`, `change24h`, `marketCapUsd` | Used when a live quote is missing or the mint is still a placeholder. |
| `creatorFeesToken` | Fee balance in the paired stock token, not in dollars. The page marks it to dollars at the pair’s last price. |
| `pumpUrl` | Optional. Leave it out until the coin has a pump.fun page. The Market column then shows an em dash. |
| `icon` | Optional. A full image URL, such as the coin’s pump.fun or IPFS image, or a file under `assets/coins/` (`assets/coins/exa.svg`, or just `exa.svg`). The book shows it at 28px and the coin page at 56px. If `icon` is missing or the file fails to load, the page draws a monogram from the ticker. When `icon` is omitted and the mint is real, a DexScreener `info.imageUrl` is used if the quote includes one. |
| `sparkline` | Optional array of numbers for the small path in the table. |
| `history` | Optional daily path for the detail chart: `{ "start": "2026-09-06", "values": [ ... ] }`, one value per day. An array of `{ "time": "2026-09-06", "value": 0.0001 }` also works. |

If you omit `sparkline` or `history`, the page draws an illustrative path from the price and the 24h change and labels the chart as illustrative.

Set `"sample": false` on the file once the book is real. That hides the Sample data badge.

### Paired assets

`pairedAssets` lists the tokenized stocks a coin can quote. These mints are the pair assets, not the meme coins.

| Symbol | Name on the page | Mint |
| --- | --- | --- |
| TSLAX | Tesla | `XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB` |
| NVDAX | NVIDIA | `Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh` |
| GMEX | GameStop | `Xsf9mBktVB9BSU5kf4nHxPq5hCBJ2j2ui3ecFGxPRGc` |
| HOOD | Equity token | `HooDYv5RewLRiMLnEVq3VJqdqxhuE6c5eYvqejMC3e9A` |
| SPYX | S&P 500 | `XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W` |
| AMZNX | Amazon | `Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg` |

`priceUsd` and `change24h` on a pair are the fallback when DexScreener does not answer. To add another pair, add an object under `pairedAssets` and reference its symbol from a coin.

The HOOD pair is labeled “Equity token” on purpose. Leave that issuer’s brand name, logo, and signature green off this site. MemeGenIndex is its own book.

pump.fun will quote a new coin against an existing asset. A coin that was itself launched on pump.fun cannot be the pair asset for another coin. The page calls that the one-hop rule.

## Live prices

`assets/market.js` exports `fetchLiveQuote(mint)` and `fetchLiveQuotes(mints)`. They call:

`https://api.dexscreener.com/latest/dex/tokens/<mint>`

The batch form puts several mints in that same path, separated by commas, and keeps the pool with the most liquidity. Placeholder mints are not requested. If the request fails or the response has no USD price, the page keeps the numbers in `data/coins.json`.

## Deploy to GitHub Pages

1. Push this repository to GitHub. Keep `index.html` at the repository root.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Choose the branch you want to publish (for example `main`) and the folder **`/ (root)`**. Save.
5. Wait until the Pages deployment finishes. The site will be at `https://<user>.github.io/<repo>/`.

`.nojekyll` is included so GitHub Pages serves the files as they are and does not run a Jekyll build.

Links are relative, so the same files work on a project site (`https://<user>.github.io/<repo>/`) and on a user site served from the domain root.

## Files

- `index.html` — portfolio
- `coin.html` — one coin, selected with `?mint=`
- `data/coins.json` — the book
- `assets/styles.css` — layout and type
- `assets/market.js` — loading, live quotes, formatting
- `assets/app.js` — portfolio page
- `assets/detail.js` — coin page and chart
- `assets/favicon.svg`
- `.nojekyll`

## Disclaimer

Not investment advice. Tokenized stocks are subject to the issuer’s jurisdiction restrictions. Prices and fee marks may be delayed. Sample entries are illustrative.
