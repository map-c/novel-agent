import { eq, like } from 'drizzle-orm';
import { getDb, schema } from './index.js';

const { settings } = schema;

export async function getSetting(key: string): Promise<string | undefined> {
  const db = getDb();
  const row = await db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value;
}

export async function getSettingsByPrefix(prefix: string): Promise<Record<string, string>> {
  const db = getDb();
  const rows = await db.select().from(settings).where(like(settings.key, `${prefix}%`)).all();
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  // INSERT OR REPLACE
  await db.insert(settings).values({ key, value, updatedAt: now })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } });
}

export async function deleteSetting(key: string): Promise<void> {
  const db = getDb();
  await db.delete(settings).where(eq(settings.key, key));
}
