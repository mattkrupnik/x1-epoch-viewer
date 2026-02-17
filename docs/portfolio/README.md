# Portfolio Module README

Portfolio module documentation for [`x1rewards.xyz`](https://x1rewards.xyz).

## 📌 Module Purpose

The Portfolio module is designed to track and analyze balances across multiple X1 addresses in one place.
It provides a fast, practical view of holdings, account types, and token distribution for everyday monitoring.

## ✨ Core Functionality

- Track multiple addresses at the same time
- Add and remove addresses from a persistent watchlist
- Auto-refresh balances and token holdings from X1 RPC
- Show account type per address (`vote`, `stake`, `wallet`)
- Display total XNT across all tracked addresses
- Display total token count across all tracked addresses
- Show an aggregated token table across the full portfolio
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

For each tracked address, the module fetches:
- account info (native XNT balance + owner),
- token accounts from both legacy token program and Token-2022,
- token metadata (name/symbol/logo) where available.

The UI is updated after fetch completion, and account type is derived from account ownership:
- `vote` for vote program accounts,
- `stake` for stake program accounts,
- `wallet` for regular wallet accounts.

### Portfolio Overview

When at least one address is tracked, dashboard sections include:
- summary cards (tracked wallets, total XNT, total token entries),
- aggregated token table (cross-wallet view),
- filter tabs by account type,
- collapsible wallet cards with quick actions.

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
- complete token list for that single address,
- manual refresh action.

## 💾 Persistence

The module stores state in `localStorage` to survive page reloads:
- tracked addresses and detected account types,
- accordion expansion state for wallet cards,
- app default page preference (`validators` or `portfolio`).

## ⚙️ UX & Settings Integration

- Shared top navigation allows switching between `Validators` and `Portfolio`.
- Global settings include theme toggle and default landing page selection.
- If default page is set to `portfolio`, opening `/` redirects users to Portfolio.

## ⚠️ Notes & Limitations

- Address validation is intentionally lightweight (length-based).
- Some tokens may not expose complete metadata, so fallback labels may appear.
- Refresh time increases with the number of tracked addresses.
- Portfolio reads directly from X1 RPC in the frontend, so it does not require backend API endpoints for core balance/token data.

## ✅ Quick Manual Test

1. Start frontend: `npm run dev`
2. Open [http://localhost:8080/portfolio](http://localhost:8080/portfolio)
3. Add a valid X1 address
4. Verify:
- wallet card and token list render,
- filters work (`All/Vote/Stake/Wallet`),
- navigation to `/portfolio/:address`,
- refresh and remove actions,
- persisted state after page reload (`localStorage`).

## 🛠 Troubleshooting

### "Failed to fetch wallet data"
- Check RPC availability (`VITE_X1_RPC_URL`).
- Check CORS/network connectivity.
- Verify the wallet address format.

### Missing token metadata (name/symbol/logo)
- Token may not expose metadata via Metaplex/URI.
- This is expected for some assets; UI falls back to defaults (`Unknown Token`, shortened mint).

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
