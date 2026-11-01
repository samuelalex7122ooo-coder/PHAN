const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "krypton.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS guild_config (
  guild_id TEXT PRIMARY KEY,
  welcome_channel TEXT,
  welcome_message TEXT,
  verify_channel TEXT,
  verify_role TEXT,
  ticket_category TEXT,
  ticket_log_channel TEXT,
  ticket_inactivity INTEGER DEFAULT 1440,
  voice_enabled INTEGER DEFAULT 1,
  ticket_panel_title TEXT,
  ticket_panel_description TEXT,
  ticket_panel_color TEXT,
  ticket_panel_channel TEXT,
  ticket_panel_message TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS ticket_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT DEFAULT '🎫',
  description TEXT,
  category_channel TEXT,
  staff_role TEXT,
  staff_roles TEXT
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT UNIQUE,
  user_id TEXT NOT NULL,
  category_id INTEGER,
  claimed_by TEXT,
  status TEXT DEFAULT 'open',
  created_at INTEGER DEFAULT (strftime('%s','now')),
  last_activity INTEGER DEFAULT (strftime('%s','now')),
  closed_at INTEGER,
  close_reason TEXT
);

CREATE TABLE IF NOT EXISTS voice_hours (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  seconds INTEGER DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS voice_sessions (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  joined_at INTEGER,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS bot_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT,
  action TEXT,
  user_id TEXT,
  details TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);
`);

function addColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// Migraciones seguras: no eliminan datos existentes.
addColumn("ticket_categories", "staff_roles", "TEXT");
addColumn("guild_config", "ticket_panel_title", "TEXT");
addColumn("guild_config", "ticket_panel_description", "TEXT");
addColumn("guild_config", "ticket_panel_color", "TEXT");
addColumn("guild_config", "ticket_panel_channel", "TEXT");
addColumn("guild_config", "ticket_panel_message", "TEXT");

function ensureGuild(guildId) {
  db.prepare("INSERT OR IGNORE INTO guild_config (guild_id) VALUES (?)").run(guildId);
}

function updateGuild(guildId, values) {
  ensureGuild(guildId);
  const keys = Object.keys(values);
  if (!keys.length) return;
  const sql = keys.map(k => `${k} = ?`).join(", ");
  db.prepare(`UPDATE guild_config SET ${sql} WHERE guild_id = ?`)
    .run(...keys.map(k => values[k]), guildId);
}

module.exports = { db, ensureGuild, updateGuild };
