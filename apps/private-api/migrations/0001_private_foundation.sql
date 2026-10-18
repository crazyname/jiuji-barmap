-- PR-07 private schema ONLY. Does not reference or mutate legacy public datasets.
-- D1 enforces foreign_keys=ON. Cloudflare Wrangler tracks applied migrations.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS account_bindings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('wechat','phone','third_party')),
  external_subject_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(provider, external_subject_hash)
);
CREATE INDEX IF NOT EXISTS idx_bindings_user ON account_bindings(user_id);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_hash TEXT NOT NULL UNIQUE,
  access_expires_at TEXT NOT NULL,
  refresh_hash TEXT NOT NULL UNIQUE,
  refresh_expires_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON auth_sessions(user_id, revoked_at);
CREATE TABLE IF NOT EXISTS used_refresh_tokens (
  token_hash TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
  used_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS wechat_code_replays (
  code_hash TEXT PRIMARY KEY,
  used_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  bucket TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  hits INTEGER NOT NULL CHECK(hits >= 1),
  PRIMARY KEY(bucket, subject_hash)
);
CREATE TABLE IF NOT EXISTS visit_sessions (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bar_id INTEGER CHECK(bar_id IS NULL OR bar_id > 0),
  place_label TEXT,
  occurred_at TEXT NOT NULL,
  note TEXT,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility = 'private'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
  client_mutation_id TEXT NOT NULL,
  UNIQUE(owner_user_id, id)
);
CREATE INDEX IF NOT EXISTS idx_visits_owner_time ON visit_sessions(owner_user_id, occurred_at DESC, id);
CREATE TABLE IF NOT EXISTS drink_entries (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  drink_label TEXT NOT NULL,
  cocktail_id TEXT,
  recipe_variant_id TEXT,
  visit_session_id TEXT,
  consumed_at TEXT NOT NULL,
  context_kind TEXT NOT NULL CHECK(context_kind IN ('bar','home','other')),
  photo_refs_json TEXT NOT NULL DEFAULT '[]',
  note TEXT,
  personal_rating REAL CHECK(personal_rating IS NULL OR (personal_rating >= 0 AND personal_rating <= 5)),
  context_details_json TEXT NOT NULL DEFAULT '{}',
  visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility = 'private'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
  client_mutation_id TEXT NOT NULL,
  FOREIGN KEY (owner_user_id, visit_session_id)
    REFERENCES visit_sessions(owner_user_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_drinks_owner_time ON drink_entries(owner_user_id, consumed_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_drinks_owner_visit ON drink_entries(owner_user_id, visit_session_id);
CREATE INDEX IF NOT EXISTS idx_drinks_owner_cocktail ON drink_entries(owner_user_id, cocktail_id);
CREATE TABLE IF NOT EXISTS mutation_idempotency (
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mutation_id TEXT NOT NULL,
  entity_kind TEXT NOT NULL CHECK(entity_kind IN ('drink','visit')),
  entity_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(owner_user_id, mutation_id)
);
CREATE INDEX IF NOT EXISTS idx_idempotency_entity ON mutation_idempotency(owner_user_id, entity_kind, entity_id);
