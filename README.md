# X1 Epoch Viewer – Validator Rewards Dashboard

A web-based dashboard for monitoring X1 Network validators and their epoch rewards. Track multiple validators, view reward history with interactive charts, and analyze staking performance in real-time.

## 📌 Features

- Track multiple validators simultaneously by vote address.
- View detailed epoch-by-epoch reward breakdown (vote rewards, self-stake rewards, total).
- Interactive time-series charts with per-validator and summed view modes.
- Validator statistics: total rewards, average reward, last epoch reward with trend indicator.
- Activated stake, self-stake amount, commission, block production, and skipped slots.
- Validator search with autocomplete powered by local IndexedDB cache.
- Share validator link and copy-to-clipboard for vote addresses.
- Configurable chart settings: epoch range (15, 30, 45), post-balance overlay.
- Epoch progress indicator with real-time slot tracking.
- Dark/Light theme with persistent preference.
- Responsive mobile-first design.
- Smart data caching with localStorage and IndexedDB to minimize RPC calls.
- Batch RPC requests chunked to avoid payload limits.

---

## 🚀 Installation

### 1️⃣ Clone the repository
```sh
git clone https://github.com/mattkrupnik/x1-epoch-viewer.git
```

### 2️⃣ Navigate into the project directory
```sh
cd x1-epoch-viewer
```

### 3️⃣ Install dependencies
> **Node.js is required to run this application.**
> https://nodejs.org/en/download
```sh
npm install
```

### 4️⃣ Start the development server
```sh
npm run dev
```

The app will start on `http://localhost:8080`.

---

## 🏗 Build for Production

```sh
npm run build
```

This creates a `dist` folder with static files ready for deployment to any hosting platform (Vercel, Netlify, Cloudflare Pages, or your own server).

### Nginx configuration example

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /path/to/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 🛠 Tech Stack

- **React 18** – UI framework
- **TypeScript** – Type safety
- **Vite** – Build tool and dev server
- **Tailwind CSS** – Utility-first styling
- **shadcn/ui + Radix UI** – Accessible component library
- **Recharts** – Interactive charts
- **TanStack React Query** – Server state management and caching
- **React Router** – Client-side routing

---

## 📡 Data Sources

- **X1 Network RPC** (`https://rpc.mainnet.x1.xyz`) – Epoch info, vote accounts, inflation rewards, block production, stake accounts.
- **Xen Network API** (`https://api.xen.network`) – Validator metadata (name, avatar), epoch history, stake history.

---

## 📋 Pages

| Route | Description |
|-------|-------------|
| `/` | Main dashboard – add and monitor validators |
| `/validator/:address` | Detailed validator view with charts and epoch table |

---

## ⚙️ Configuration

Dashboard behavior can be adjusted in `src/config/dashboard.ts`:

- `SHOW_COMBINED_CHART` – Display multi-validator comparison chart.
- `USE_ACCORDION` – Collapsible validator cards.
- `DEFAULT_ACCORDION_EXPANDED` – Start validators expanded or collapsed.
- `ALLOW_REMOVE_VALIDATOR` – Allow removing validators from the list.
- `SHOW_CHART_MODE_TOGGLE` – Toggle between per-validator and summed chart modes.
- `USE_AUTOCOMPLETE` – Enable validator address autocomplete search.

---

## 🐛 Issues & Feedback

Found a bug or have a feature request? Please open an issue on GitHub:

👉 [Open an issue](https://github.com/mattkrupnik/x1-epoch-viewer/issues)

When reporting a bug, please include:
- A clear description of the problem.
- Steps to reproduce the issue.
- Expected vs. actual behavior.
- Browser and OS information.

---

## 🤝 Contributing

Contributions are welcome!

1. Fork the repository.
2. Create a new branch (`git checkout -b feature-branch`).
3. Make your changes and commit (`git commit -m "Added new feature"`).
4. Push the branch (`git push origin feature-branch`).
5. Open a Pull Request.

For questions, feel free to [open an issue](https://github.com/mattkrupnik/x1-epoch-viewer/issues).
