import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';

let db: ReturnType<typeof drizzle>;

export function getDb(dbPath = 'novel-agent.db') {
  if (!db) {
    const client = createClient({ url: `file:${dbPath}` });
    db = drizzle(client, { schema });

    // 自动建表 + 迁移
    initTables(client);
    migrate(client);
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

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS token_usage (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      stage TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL DEFAULT '',
      rating TEXT NOT NULL,
      created_at TEXT NOT NULL
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

function migrate(client: ReturnType<typeof createClient>) {
  // 检查列是否存在后再添加（避免 duplicate column 错误）
  client.execute("PRAGMA table_info(projects)").then((result) => {
    const columns = new Set(result.rows.map((r) => r[1] as string));
    if (!columns.has('clarify_questions')) {
      client.execute('ALTER TABLE projects ADD COLUMN clarify_questions TEXT');
    }
    if (!columns.has('clarify_answers')) {
      client.execute('ALTER TABLE projects ADD COLUMN clarify_answers TEXT');
    }
  });
}

export { schema };
