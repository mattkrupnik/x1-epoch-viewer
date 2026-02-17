-- Walidatorzy zapisani w bazie (dodani przez użytkowników)
CREATE TABLE IF NOT EXISTS validators (
  vote_address VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255),
  avatar TEXT,
  status VARCHAR(20) DEFAULT 'unknown',
  activated_stake DOUBLE PRECISION DEFAULT 0,
  commission INTEGER DEFAULT 10,
  current_epoch INTEGER DEFAULT 0,
  self_stake_addresses TEXT[],
  self_stake_amount DOUBLE PRECISION DEFAULT 0,
  node_pubkey VARCHAR(64),
  is_tracked BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Nagrody per epoka per walidator
CREATE TABLE IF NOT EXISTS epoch_rewards (
  vote_address VARCHAR(64) NOT NULL REFERENCES validators(vote_address) ON DELETE CASCADE,
  epoch INTEGER NOT NULL,
  vote_reward DOUBLE PRECISION NOT NULL DEFAULT 0,
  reward DOUBLE PRECISION NOT NULL DEFAULT 0,
  commission INTEGER DEFAULT 10,
  self_stake_reward DOUBLE PRECISION DEFAULT 0,
  date VARCHAR(50),
  active_stake DOUBLE PRECISION DEFAULT 0,
  post_balance DOUBLE PRECISION,
  PRIMARY KEY (vote_address, epoch)
);

CREATE INDEX IF NOT EXISTS idx_epoch_rewards_address ON epoch_rewards(vote_address);
CREATE INDEX IF NOT EXISTS idx_epoch_rewards_epoch ON epoch_rewards(epoch DESC);

-- Cache timestampów epok (współdzielony)
CREATE TABLE IF NOT EXISTS epoch_timestamps (
  epoch INTEGER PRIMARY KEY,
  timestamp_str VARCHAR(50) NOT NULL
);

-- Metadata (śledzenie ostatniej przetworzonej epoki)
CREATE TABLE IF NOT EXISTS sync_state (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Istniejące tabele z cache.ts
CREATE TABLE IF NOT EXISTS epochs_metadata (
  epoch INTEGER PRIMARY KEY,
  end_slot BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS cache_metadata (
  cache_key VARCHAR(100) PRIMARY KEY,
  last_updated TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
);

-- Lista wszystkich walidatorów z xen.network (do wyszukiwania)
CREATE TABLE IF NOT EXISTS validators_list (
  vote_pubkey VARCHAR(64) PRIMARY KEY,
  node_pubkey VARCHAR(64),
  name VARCHAR(255),
  icon_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_validators_list_name ON validators_list(name);
