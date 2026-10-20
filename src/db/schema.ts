export const schema = `
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, handle TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS contacts(a TEXT REFERENCES users(id), b TEXT REFERENCES users(id), state TEXT NOT NULL CHECK(state IN ('accepted','revoked')), invite_floor INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(a,b), CHECK(a<b));
CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY, a TEXT REFERENCES users(id), b TEXT REFERENCES users(id), UNIQUE(a,b), CHECK(a<b));
CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id TEXT NOT NULL REFERENCES conversations(id), sender_id TEXT NOT NULL REFERENCES users(id), recipient_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL, context TEXT, reply_to INTEGER REFERENCES messages(id), client_message_id TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(sender_id,client_message_id));
CREATE INDEX IF NOT EXISTS message_inbox ON messages(recipient_id,id);
CREATE INDEX IF NOT EXISTS message_conversation ON messages(conversation_id,id);
CREATE TABLE IF NOT EXISTS deliveries(message_id INTEGER PRIMARY KEY REFERENCES messages(id), user_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL DEFAULT 'pending', error TEXT, submitted_at TEXT);
CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
`;
