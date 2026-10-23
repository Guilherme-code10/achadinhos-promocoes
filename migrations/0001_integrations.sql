CREATE TABLE IF NOT EXISTS oauth_states (
 state_hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL,
 payload TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS integration_tokens (
 provider TEXT PRIMARY KEY, payload TEXT NOT NULL,
 expires_at INTEGER NOT NULL, refresh_lock INTEGER NOT NULL DEFAULT 0
);
