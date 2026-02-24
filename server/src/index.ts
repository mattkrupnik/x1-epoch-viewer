import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { initDatabase } from './db/init.js';
import cacheRoutes from './routes/cache.js';
import addressKeysRoutes from './routes/address-keys.js';
import validatorsRoutes from './routes/validators.js';
import epochTimestampsRoutes from './routes/epoch-timestamps.js';
import { startEpochMonitor } from './workers/epoch-monitor.js';
import { startValidatorsListSync } from './workers/validators-list-sync.js';
import { x1Client } from './lib/x1-rpc.js';
import { config } from './lib/config.js';

const app = express();
const serverStartedAt = new Date().toISOString();

// Middleware
app.use(cors({
  origin: config.corsOrigin,
}));
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/cache', cacheRoutes);
app.use('/api/address-keys', addressKeysRoutes);
app.use('/api/validators', validatorsRoutes);
app.use('/api/epoch-timestamps', epochTimestampsRoutes);

// Epoch info (server-side RPC, no browser dependency)
app.get('/api/epoch-info', async (_req, res) => {
  try {
    const [epochInfo, perfSamples] = await Promise.all([
      x1Client.getEpochInfo(),
      x1Client.getRecentPerformanceSamples(1),
    ]);
    const sample = (perfSamples as any)?.[0];
    const slotTime = (sample?.samplePeriodSecs && sample?.numSlots)
      ? sample.samplePeriodSecs / sample.numSlots
      : 0.4;
    res.json({
      epoch: epochInfo.epoch,
      slotIndex: epochInfo.slotIndex,
      slotsInEpoch: epochInfo.slotsInEpoch,
      slotTime,
    });
  } catch (error) {
    console.error('Error fetching epoch info:', error);
    res.status(500).json({ error: 'Failed to fetch epoch info' });
  }
});

// RPC proxy - forwards browser RPC calls to avoid CORS issues
app.post('/api/rpc', async (req, res) => {
  try {
    const response = await fetch(config.x1RpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      return res.status(response.status).json({ error: 'RPC error' });
    }
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('RPC proxy error:', error);
    res.status(502).json({ error: 'RPC proxy failed' });
  }
});

// xDEX wallet tokens — cached 60s per address, max 200 entries
const walletTokensCache = new Map<string, { data: unknown; ts: number }>();
const WALLET_CACHE_TTL = 60_000;
const WALLET_CACHE_MAX = 200;
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

app.get('/api/wallet-tokens', async (req, res) => {
  const address = req.query.address as string;
  if (!address) return res.status(400).json({ error: 'Missing address' });
  if (!BASE58_RE.test(address)) return res.status(400).json({ error: 'Invalid address' });

  const cached = walletTokensCache.get(address);
  if (cached && Date.now() - cached.ts < WALLET_CACHE_TTL) {
    return res.json(cached.data);
  }

  try {
    const url = `https://api.xdex.xyz/api/xendex/wallet/tokens?wallet_address=${encodeURIComponent(address)}&network=X1%20Mainnet&price=true&24h_change=true`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return res.status(response.status).json({ error: 'xDEX API error' });
    const json = await response.json();

    // Evict oldest entry when cache is full
    if (walletTokensCache.size >= WALLET_CACHE_MAX) {
      walletTokensCache.delete(walletTokensCache.keys().next().value!);
    }
    walletTokensCache.set(address, { data: json, ts: Date.now() });
    res.json(json);
  } catch (error) {
    console.error('Failed to fetch xDEX wallet tokens:', error);
    res.status(502).json({ error: 'xDEX unavailable' });
  }
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: config.buildVersion,
    buildDate: config.buildDate,
    startedAt: serverStartedAt,
  });
});

// Start server
async function start() {
  try {
    await initDatabase();
    console.log('Database initialized');

    startEpochMonitor();
    startValidatorsListSync();

    app.listen(config.port, () => {
      console.log(`Server running on port ${config.port} (build: ${config.buildVersion})`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
