-- Isolated staging infrastructure probe only; never stores member or financial data.
CREATE TABLE IF NOT EXISTS stage_d1_bootstrap (
  probe_key TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
