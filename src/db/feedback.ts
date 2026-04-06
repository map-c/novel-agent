import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb, schema } from './index.js';

const { feedback } = schema;

export interface FeedbackRecord {
  id: string;
  projectId: string;
  targetType: string;
  targetId: string;
  rating: string;
  createdAt: string;
}

export async function saveFeedback(
  projectId: string,
  targetType: string,
  targetId: string,
  rating: string,
): Promise<void> {
  const db = getDb();

  // upsert: 同一 project+target 只保留一条
  const existing = await db.select().from(feedback)
    .where(and(
      eq(feedback.projectId, projectId),
      eq(feedback.targetType, targetType),
      eq(feedback.targetId, targetId),
    ))
    .get();

  if (existing) {
    await db.update(feedback).set({
      rating,
      createdAt: new Date().toISOString(),
    }).where(eq(feedback.id, existing.id));
  } else {
    await db.insert(feedback).values({
      id: nanoid(),
      projectId,
      targetType,
      targetId,
      rating,
      createdAt: new Date().toISOString(),
    });
  }
}

export async function getProjectFeedback(projectId: string): Promise<FeedbackRecord[]> {
  const db = getDb();
  return db.select().from(feedback)
    .where(eq(feedback.projectId, projectId))
    .all();
}
