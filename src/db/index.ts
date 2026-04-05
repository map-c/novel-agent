import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';

let db: ReturnType<typeof drizzle>;

export function getDb(dbPath = 'novel-agent.db') {
  if (!db) {
    const client = createClient({ url: `file:${dbPath}` });
    db = drizzle(client, { schema });

    // 自动建表
    initTables(client);
  }
  return db;
}

function initTables(client: ReturnType<typeof createClient>) {
  client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      user_prompt TEXT NOT NULL,
      input_mode TEXT NOT NULL DEFAULT 'freeform',
      status TEXT NOT NULL DEFAULT 'input',
      world_building TEXT,
      plot_outline TEXT,
      input_analysis TEXT,
      plot_summary TEXT,
      current_chapter INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      description TEXT NOT NULL,
      backstory TEXT NOT NULL,
      motivations TEXT NOT NULL,
      relationships TEXT NOT NULL,
      voice_notes TEXT NOT NULL,
      arc TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      number INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      char_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      summary TEXT,
      ending TEXT
    );
  `);
}

export { schema };
