# Portfolio Module README

Portfolio module documentation for [`x1rewards.xyz/portfolio`](https://x1rewards.xyz/portfolio).

## 📌 Module Purpose

The Portfolio module is designed to track and analyze balances across multiple X1 addresses in one place.
It provides a fast, practical view of holdings, account types, token distribution, live prices, and total USD value for everyday monitoring.


## ✨ Core Functionality

- Track multiple addresses at the same time
- Add and remove addresses from a persistent watchlist
- Auto-refresh balances and token holdings
- Show account type per address (`vote`, `stake`, `wallet`)
- Display total XNT across all tracked addresses
- Display total token count across all tracked addresses
- Show token prices (USD) per token where available
- Show USD value per token holding
- Display total portfolio value (USD) across all wallets and tokens
- Show an aggregated token table across the full portfolio with combined USD values
- Open a detailed per-address page
- Persist tracked addresses and UI expansion state in browser storage
- Filter tracked addresses by type (`All`, `Vote`, `Stake`, `Wallet`)

## 🌐 Routes

- `GET /portfolio` - main Portfolio dashboard
- `GET /portfolio/:address` - single-address details page

## 🔍 Detailed Behavior

### Address Tracking Flow

1. User enters an address and confirms with button click or Enter key.
2. Address is validated with a basic format check (length).
3. Duplicate addresses are rejected.
4. If valid, portfolio data is fetched and immediately rendered.
5. Address is saved to persistent local storage.

### Data Fetching Flow

For each tracked address, a single backend API call returns native XNT balance, all SPL token balances,
metadata (name, symbol, logo), and live USD prices.

Account type is derived from account ownership (via X1 RPC `getAccountInfo`):
- `vote` for vote program accounts,
- `stake` for stake program accounts,
- `wallet` for regular wallet accounts.

Backend responses are cached per address for 60 seconds to reduce external API load.

### Token Price & Value Display

- **Price column**: shows current USD price for tokens with known market data; `—` for unknown tokens.
- **USD Value column**: shows `amount × price` per token; `—` if price is unavailable.
- Tokens with known price are sorted above tokens without price.
- Within each group, tokens are sorted by USD value (or raw amount) descending.

### Portfolio Overview

When at least one address is tracked, dashboard sections include:
- summary cards:
  - **Total XNT** — native balance across all wallets,
  - **Wallets Tracked** — number of tracked addresses,
  - **Total Tokens** — total SPL token entries,
  - **Portfolio Value** — total USD value of all holdings (XNT + tokens, shown when price data is available),
- aggregated token table (cross-wallet view with combined amounts and USD values),
- filter tabs by account type,
- collapsible wallet cards with quick actions.

### Aggregated Token Table

The "All Tokens" section combines holdings from all wallets:
- Native XNT shown first with logo, price, and combined balance.
- SPL tokens aggregated by mint address (amounts and values summed across wallets).
- Tokens with prices sorted above tokens without; within each group sorted by USD value descending.

### Wallet Card Actions

Each tracked wallet card supports:
- copy wallet address,
- open external explorer link,
- open local detailed wallet view,
- remove wallet from tracking list.

### Wallet Details Page

The details route (`/portfolio/:address`) provides:
- full wallet address with copy action,
- account type badge,
- native balance and token count,
- complete token list with price and USD value columns,
- manual refresh action.

## 💾 Persistence

The module stores state in `localStorage` to survive page reloads:
- tracked addresses and detected account types,
- accordion expansion state for wallet cards,
- "All Tokens" table open/collapsed state,
- app default page preference (`validators` or `portfolio`).

## ⚙️ UX & Settings Integration

- Shared top navigation allows switching between `Validators` and `Portfolio`.
- Global settings include theme toggle and default landing page selection.
- If default page is set to `portfolio`, opening `/` redirects users to Portfolio.

## ⚠️ Notes & Limitations

- Address validation is intentionally lightweight (length-based in the frontend).
- Prices are only available for tokens with known market data — others show `—` for price and value.
- Portfolio Value card is hidden when no price data is available for any asset.
- Refresh time increases with the number of tracked addresses (one API call per address).
- Cached prices may be up to 60 seconds old.

## ✅ Quick Manual Test

1. Start backend: `npm run dev` (in `/server`)
2. Start frontend: `npm run dev`
3. Open [http://localhost:8080/portfolio](http://localhost:8080/portfolio)
4. Add a valid X1 address
5. Verify:
- wallet card with token list renders (name, symbol, logo),
- price and USD value columns are populated for known tokens,
- Portfolio Value card shows total USD value,
- aggregated "All Tokens" table shows combined holdings,
- filters work (`All/Vote/Stake/Wallet`),
- navigation to `/portfolio/:address`,
- refresh and remove actions,
- persisted state after page reload (`localStorage`).

## 🛠 Troubleshooting

### "Failed to fetch wallet data"
- Check that the backend server is running.
- Check `VITE_API_URL` environment variable.
- Verify the wallet address format.

### Prices show `—` for all tokens
- Price API may be temporarily unavailable; balances are still shown without price data.
- Token may not have known market data; this is expected for unknown or low-liquidity assets.

### Portfolio Value card not visible
- Shown only when at least one asset has a known USD price.
- Verify the backend server is running and reachable.

### `/portfolio` does not open from `/`
- Set `defaultPage` to `portfolio` in Settings, or open `/portfolio` directly.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Open a pull request

## 🐛 Issues & Feedback

Found a bug or have a feature request? Open an issue:
[Open an issue](https://github.com/mattkrupnik/x1-epoch-viewer/issues)

When reporting a bug, include:

- Clear problem description
- Steps to reproduce
- Expected vs actual behavior
- Browser and OS details
