export const authSchema = `
CREATE TABLE IF NOT EXISTS invitations(hash TEXT PRIMARY KEY, inviter_id TEXT REFERENCES users(id), reset_user_id TEXT REFERENCES users(id), expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS web_sessions(hash TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS connections(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), label TEXT NOT NULL, scope TEXT NOT NULL, client_id TEXT, revoked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS access_tokens(hash TEXT PRIMARY KEY, connection_id TEXT NOT NULL REFERENCES connections(id), expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS refresh_tokens(hash TEXT PRIMARY KEY, connection_id TEXT NOT NULL REFERENCES connections(id), expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS oauth_clients(id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_requests(id TEXT PRIMARY KEY, session_hash TEXT, client_id TEXT NOT NULL, params TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS authorization_codes(hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), client_id TEXT NOT NULL, params TEXT NOT NULL, expires_at INTEGER NOT NULL);
`;
