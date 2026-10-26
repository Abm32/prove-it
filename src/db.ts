import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config } from './config.js';

export function migrate(database: DatabaseSync): void {
  database.exec('PRAGMA journal_mode = WAL');
  database.exec(`
    CREATE TABLE IF NOT EXISTS tokens (
      user_id TEXT PRIMARY KEY,
      login TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      scopes TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      reward_id TEXT,
      broadcaster_type TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS dares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id TEXT NOT NULL,
      viewer_id TEXT NOT NULL,
      viewer_login TEXT NOT NULL,
      viewer_name TEXT NOT NULL,
      text TEXT NOT NULL,
      kind TEXT NOT NULL,
      condition_json TEXT NOT NULL,
      bounty_points INTEGER NOT NULL DEFAULT 0,
      bounty_bits INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      deadline_at INTEGER,
      decided_at INTEGER,
      verdict TEXT,
      confidence REAL,
      evidence TEXT,
      clip_id TEXT,
      clip_url TEXT,
      redemption_id TEXT,
      poll_id TEXT
    );

    CREATE TABLE IF NOT EXISTS verdict_ticks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dare_id INTEGER NOT NULL REFERENCES dares(id),
      at INTEGER NOT NULL,
      progress REAL NOT NULL,
      confidence REAL NOT NULL,
      done INTEGER NOT NULL,
      evidence TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS appeals (
      dare_id INTEGER NOT NULL REFERENCES dares(id),
      viewer_id TEXT NOT NULL,
      at INTEGER NOT NULL,
      PRIMARY KEY (dare_id, viewer_id)
    );
  `);
  const tokenColumns = database.prepare('PRAGMA table_info(tokens)').all() as Array<{ name: string }>;
  if (!tokenColumns.some((column) => column.name === 'broadcaster_type')) {
    database.exec("ALTER TABLE tokens ADD COLUMN broadcaster_type TEXT NOT NULL DEFAULT ''");
  }
}

const databasePath = resolve(config.DATABASE_PATH);
mkdirSync(dirname(databasePath), { recursive: true });

export const db = new DatabaseSync(databasePath);
migrate(db);
