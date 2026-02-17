# X1 Rewards

`x1rewards.xyz` is a full-stack dashboard for checking rewards earned by validators on the X1 Network.  
Track multiple validators, review epoch-by-epoch reward history, and keep data updated with automatic backend workers.

## 📌 Features

- Track multiple validators by vote address
- Epoch-by-epoch reward history with interactive charts and tables
- Per-validator and combined rewards visualization
- Self-stake rewards, activated stake, commission, and block production metrics
- Real-time epoch progress and slot tracking
- Validator search/autocomplete powered by synced network metadata
- Soft delete for tracked validators (history preserved for fast restore)
- Dark/light theme with responsive UI
- Caching and batched RPC calls to reduce request overhead

## 🧱 Architecture

```text
Frontend (React + Vite) -> Backend (Express) -> PostgreSQL
                        -> X1 RPC (mainnet)
                        -> xen.network API
```

- Frontend: React 18, TypeScript, Vite, shadcn/ui, Tailwind CSS, Recharts, TanStack Query
- Backend: Express.js, TypeScript, node-postgres
- Database: PostgreSQL 16
- Deployment: Docker, Docker Compose, Nginx

## 🚀 Quick Start (Development)

### ✅ Prerequisites

- Node.js 22+
- Docker

### 1. 🐘 Start PostgreSQL

```bash
docker compose up -d
```

Database is exposed on `localhost:5433`.

### 2. 📦 Install Dependencies

```bash
npm install
cd server && npm install && cd ..
```

### 3. ▶️ Run Backend and Frontend

Use two terminals:

```bash
# Terminal 1
cd server && npm run dev
```

```bash
# Terminal 2
npm run dev
```

Open `http://localhost:8080`.

## 🏗 Production Deployment

```bash
cp .env.production.example .env.production
docker compose -f docker-compose.prod.yml up -d --build
```

For first-time VPS setup:

```bash
bash scripts/setup-vps.sh
```

## 🌐 Local Domain Without DNS (Optional)

Add a hosts entry on your machine:

```txt
127.0.0.1 x1.local
```

Then set `DOMAIN=x1.local` (for production compose/Nginx template usage) and access the app via `http://x1.local`.

## ⚙️ Environment Variables

### Backend (`server/.env`)

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://postgres:password@localhost:5433/x1_epoch_viewer` | PostgreSQL connection string |
| `PORT` | `3001` | Backend server port |
| `CORS_ORIGIN` | `http://localhost:8080` | Allowed CORS origin |
| `X1_RPC_URL` | `https://rpc.mainnet.x1.xyz` | X1 RPC endpoint |
| `XEN_API_URL` | `https://api.xen.network` | Xen.network API endpoint |

### Frontend (`.env.local`)

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_URL` | empty (same-origin) | Backend API URL |
| `VITE_X1_RPC_URL` | `https://rpc.mainnet.x1.xyz` | X1 RPC URL for browser calls |

### Production (`.env.production`)

| Variable | Default | Description |
| --- | --- | --- |
| `DOMAIN` | required | Domain for Nginx server_name/CORS |
| `POSTGRES_PASSWORD` | required | PostgreSQL password |
| `X1_RPC_URL` | `https://rpc.mainnet.x1.xyz` | Optional RPC override |

## 📡 API Endpoints

### Validators

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/validators/search?q=` | Search validators by name or address |
| `GET` | `/api/validators/:address` | Get validator data (auto-sync missing epochs) |
| `GET` | `/api/validators/:address/status` | Check whether validator exists locally |
| `POST` | `/api/validators` | Add or reactivate validator |
| `POST` | `/api/validators/:address/resync` | Re-fetch missing epoch rewards |
| `DELETE` | `/api/validators/:address` | Soft delete tracked validator |

### Epoch and Cache

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/epoch-info` | Current epoch, slot index, slot time |
| `GET` | `/api/epoch-timestamps` | Epoch-to-timestamp mapping |
| `GET` | `/api/cache/epochs-metadata` | Cached epoch end-slot mapping |
| `POST` | `/api/cache/epochs-metadata` | Store epoch metadata |
| `GET` | `/api/health` | Health check, uptime, version |

## 🧠 Background Workers

### Epoch Monitor

- Polls X1 RPC for epoch transitions
- Adjusts polling frequency based on proximity to epoch boundary
- On new epoch, fetches and stores rewards for tracked validators
- Retries reward sync when data is not immediately available

### Validators List Sync

- Syncs validator metadata from xen.network periodically
- Powers frontend autocomplete and validator discovery
- Uses batched database writes for efficiency

## 🎛 Dashboard Configuration

Frontend behavior can be tuned in `src/config/dashboard.ts`:

- `SHOW_COMBINED_CHART`
- `USE_ACCORDION`
- `DEFAULT_ACCORDION_EXPANDED`
- `ALLOW_REMOVE_VALIDATOR`
- `SHOW_CHART_MODE_TOGGLE`
- `USE_AUTOCOMPLETE`

## 🗂 Project Structure

```text
x1-rewards/
├── src/                    # Frontend app (React)
├── server/                 # Backend API + workers (Express)
├── nginx/nginx.conf        # Nginx template for production container
├── docker-compose.yml      # Development PostgreSQL
├── docker-compose.prod.yml # Full production stack
├── Dockerfile              # Multi-stage frontend+backend build
└── scripts/                # Deployment/bootstrap scripts
```

## 🛠 Scripts

### Frontend (`package.json`)

- `npm run dev` - start Vite development server
- `npm run build` - production build
- `npm run preview` - preview built frontend
- `npm run lint` - run ESLint

### Backend (`server/package.json`)

- `npm run dev` - start backend in watch mode
- `npm run build` - compile TypeScript
- `npm run start` - run compiled backend

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
