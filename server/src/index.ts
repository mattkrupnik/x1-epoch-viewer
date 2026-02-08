import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { initDatabase } from './db/init.js';
import cacheRoutes from './routes/cache.js';
import validatorsRoutes from './routes/validators.js';
import epochTimestampsRoutes from './routes/epoch-timestamps.js';
import { startEpochMonitor } from './workers/epoch-monitor.js';
import { startValidatorsListSync } from './workers/validators-list-sync.js';
import { x1Client } from './lib/x1-rpc.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const BUILD_VERSION = '1.1.0';
const BUILD_DATE = '2025-02-08';
const serverStartedAt = new Date().toISOString();

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:8080',
}));
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/cache', cacheRoutes);
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
    const slotTime = sample?.samplePeriodSecs / sample?.numSlots || 0.4;
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

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: BUILD_VERSION,
    buildDate: BUILD_DATE,
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

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} (build: 2025-02-08-epoch-info)`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
