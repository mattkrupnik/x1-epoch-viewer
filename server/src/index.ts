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
