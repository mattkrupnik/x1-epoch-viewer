# X1 Rewards

`x1rewards.xyz` is a full-stack dashboard for monitoring validator rewards and wallet holdings on the X1 Network.

## 📚 Documentation

- [Portfolio Module README](docs/portfolio/README.md)

## 📌 Features

### 🛡 Validator Dashboard (`/`)

- **Add validators by vote address or name** — search input with autocomplete powered by synced xen.network metadata; supports keyboard navigation (arrow keys, Enter, Escape)
- **Track multiple validators simultaneously** — list persisted in `localStorage`; order preserved across sessions
- **Auto-sync on page load** — missing epoch rewards are fetched automatically when the page is visited; no manual action required
- **Manual resync** — refresh button triggers full resync for all monitored validators (fills any remaining gaps)
- **Soft remove** — removing a validator soft-deletes it on the backend (`is_tracked = false`); all historical data is preserved for instant restore
- **Re-add restores history** — adding a previously removed validator reactivates it and syncs only the missing epochs

**Combined stats panel (multi-validator view):**

- Total rewards across all validators (vote + self-stake breakdown in tooltip)
- Average reward per validator
- Last epoch earnings with percentage change vs previous epoch (vote + self-stake breakdown in tooltip)
- Current epoch number with live progress bar and estimated time to epoch end (slot index, slots remaining, slot time, projected end time in tooltip)

**Combined rewards chart (2+ validators):**

- Area/line chart showing epoch-by-epoch rewards per validator or summed
- Toggle between per-validator and summed view
- Configurable epoch count window

**Per-validator card:**

- Validator name, avatar, vote address (one-click copy), active/delinquent status badge
- Total rewards, epoch count, average reward per epoch
- Activated stake and self-stake amount
- Commission percentage
- Block production: blocks produced and skipped slots for current epoch
- Vote rewards vs self-stake rewards breakdown (totals and last epoch)
- Individual rewards chart (area chart with configurable epoch window, optional post-balance overlay)
- Epoch rewards table (epoch number, date, vote reward, self-stake reward, total, active stake, commission, post-balance)

**Share / export:**

- Copy "Total Rewards" card as a PNG image to clipboard (one click)

---

### 🔎 Validator Details (`/validator/:address`)

- Standalone page for any validator by vote address
- Auto-adds to backend if not yet tracked
- Shows all per-validator stats: status, stake, commission, block production, rewards chart, epoch table
- Back button to dashboard; address copy button

---

### ⚙️ Settings

- **Chart epoch window** — configure how many recent epochs to display in charts
- **Show post-balance** — toggle the post-balance line overlay in the per-validator chart
- Settings persisted in `localStorage`

### 🎨 Theme

- Dark / light mode toggle; preference persisted across sessions

---

## 🧱 Architecture

```text
Frontend (React + Vite) -> Backend (Express) -> PostgreSQL
                        -> X1 RPC (mainnet)
                        -> xen.network API
```

- **Frontend:** React 18, TypeScript, Vite, shadcn/ui, Tailwind CSS, Recharts, TanStack Query
- **Backend:** Express.js, TypeScript, node-postgres
- **Database:** PostgreSQL 16
- **Deployment:** Docker, Docker Compose, Nginx

---

## 🧠 Background Workers

### Epoch Monitor

- Polls X1 RPC for epoch transitions
- Adapts polling frequency to epoch boundary proximity:
  - >10 min away: sleeps until 10 min before epoch end
  - 5–10 min away: polls every 2 min
  - <5 min away: polls every 30 s
- On new epoch: fetches inflation rewards for all tracked validators via batched RPC
- Retries up to 4 times (15 s apart) if rewards are not yet available on chain
- Stores vote rewards, self-stake rewards, commission, active stake, post-balance, and epoch timestamp in a single DB transaction
- Updates validator status (active/delinquent), activated stake, commission, and self-stake amount on each epoch

### Validators List Sync

- Fetches full validator list from xen.network every 6 hours
- Upserts records (vote pubkey, node pubkey, name, icon URL) in batches of 100
- Removes validators no longer present in the upstream list
- Powers frontend autocomplete search

---

## 📡 API Endpoints

### Validators

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/validators/search?q=` | Search validators by name or vote address (min 2 chars, max 10 results) |
| `GET` | `/api/validators/:address` | Get validator data with auto-sync of missing epochs |
| `GET` | `/api/validators/:address/status` | Check whether validator exists in DB |
| `POST` | `/api/validators` | Add new validator or reactivate soft-deleted one |
| `POST` | `/api/validators/:address/resync` | Re-fetch all missing epoch rewards |
| `DELETE` | `/api/validators/:address` | Soft-delete validator (history preserved) |

### Epoch and Cache

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/epoch-info` | Current epoch, slot index, slots in epoch, avg slot time |
| `GET` | `/api/epoch-timestamps` | Epoch-to-timestamp mapping |
| `GET` | `/api/cache/epochs-metadata` | Cached epoch end-slot mapping |
| `POST` | `/api/cache/epochs-metadata` | Store epoch metadata |
| `GET` | `/api/health` | Server status, version, build date, uptime |

---

## 🗄 Database Schema (summary)

| Table | Purpose |
| --- | --- |
| `validators` | Tracked validators: vote address, name, avatar, status, stake, commission, self-stake, `is_tracked` |
| `epoch_rewards` | Per-epoch reward rows: vote reward, self-stake reward, total, commission, active stake, post-balance, date |
| `epoch_timestamps` | Epoch → block timestamp mapping (shared across validators) |
| `validators_list` | Full network validator registry (name, icon) for autocomplete |
| `sync_state` | Key-value store for worker state (last processed epoch) |
| `cache_metadata` | Cache expiry records for background sync tasks |

---

## 🚀 Quick Start (Development)

### ✅ Prerequisites

- Node.js 22+
- Docker

### 1. 🐘 Start PostgreSQL

```bash
docker compose up -d
```

Database exposed on `localhost:5433`.

### 2. 📦 Install Dependencies

```bash
npm install
cd server && npm install && cd ..
```

### 3. ▶️ Run Backend and Frontend

```bash
# Terminal 1
cd server && npm run dev

# Terminal 2
npm run dev
```

Open `http://localhost:8080`.

---

## 🏗 Production Deployment

```bash
cp .env.production.example .env.production
docker compose -f docker-compose.prod.yml up -d --build
```

First-time VPS setup:

```bash
bash scripts/setup-vps.sh
```

---

## ⚙️ Environment Variables

### Backend (`server/.env`)

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://postgres:password@localhost:5433/x1_epoch_viewer` | PostgreSQL connection string |
| `PORT` | `3001` | Backend port |
| `CORS_ORIGIN` | `http://localhost:8080` | Allowed CORS origin |
| `X1_RPC_URL` | `https://rpc.mainnet.x1.xyz` | X1 RPC endpoint |
| `XEN_API_URL` | `https://api.xen.network` | xen.network API endpoint |

### Frontend (`.env.local`)

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_URL` | *(same-origin)* | Backend API URL |
| `VITE_X1_RPC_URL` | `https://rpc.mainnet.x1.xyz` | X1 RPC URL for browser-side calls |

### Production (`.env.production`)

| Variable | Required | Description |
| --- | --- | --- |
| `DOMAIN` | yes | Domain for Nginx `server_name` and CORS |
| `POSTGRES_PASSWORD` | yes | PostgreSQL password |
| `X1_RPC_URL` | no | Optional RPC override |

---

## 🎛 Dashboard Config (`src/config/dashboard.ts`)

| Key | Description |
| --- | --- |
| `SHOW_COMBINED_CHART` | Show combined rewards chart when 2+ validators tracked |
| `USE_ACCORDION` | Wrap per-validator cards in accordion (collapsed by default when 2+) |
| `DEFAULT_ACCORDION_EXPANDED` | Auto-expand accordion for newly added validators |
| `ALLOW_REMOVE_VALIDATOR` | Show remove button on validator cards |
| `SHOW_CHART_MODE_TOGGLE` | Show per-validator / summed toggle on combined chart |
| `USE_AUTOCOMPLETE` | Enable validator name/address autocomplete in search |
| `DEFAULT_CHART_MODE` | Default combined chart mode (`'per-validator'` or `'summed'`) |

---

## 🗂 Project Structure

```text
x1-rewards/
├── src/                        # Frontend (React + Vite)
│   ├── pages/                  # Route pages (Index, Validator, Portfolio, Address)
│   ├── components/             # UI components (ValidatorCard, PortfolioDashboard, …)
│   ├── lib/                    # API client, RPC client, formatters
│   ├── hooks/                  # useChartSettings, use-mobile
│   └── config/dashboard.ts     # Feature flags
├── server/                     # Backend (Express + TypeScript)
│   └── src/
│       ├── routes/             # validators, epoch-timestamps, cache
│       ├── workers/            # epoch-monitor, validators-list-sync
│       ├── lib/                # x1-rpc, xen-api, epoch-helpers, db-helpers, config, types
│       └── db/                 # connection, init (migrations)
├── nginx/nginx.conf            # Nginx template for production
├── docker-compose.yml          # Development PostgreSQL
├── docker-compose.prod.yml     # Full production stack
├── Dockerfile                  # Multi-stage frontend + backend build
└── scripts/                    # Deployment / VPS bootstrap scripts
```

---

## 🛠 Scripts

### Frontend (`package.json`)

| Command | Description |
| --- | --- |
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview built frontend |
| `npm run lint` | Run ESLint |

### Backend (`server/package.json`)

| Command | Description |
| --- | --- |
| `npm run dev` | Start backend in watch mode (tsx) |
| `npm run build` | Compile TypeScript |
| `npm run start` | Run compiled backend |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Open a pull request

## 🐛 Issues & Feedback

Found a bug or have a feature request? Open an issue:
`https://github.com/mattkrupnik/x1-epoch-viewer/issues`

When reporting a bug, include:

- Clear problem description
- Steps to reproduce
- Expected vs actual behavior
- Browser and OS details
