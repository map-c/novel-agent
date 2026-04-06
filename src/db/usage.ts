import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb, schema } from './index.js';
import type { TokenUsage } from '../types/llm.js';

const { tokenUsage } = schema;

export async function saveTokenUsage(
  projectId: string,
  stage: string,
  model: string,
  usage: TokenUsage,
): Promise<void> {
  const db = getDb();
  await db.insert(tokenUsage).values({
    id: nanoid(),
    projectId,
    stage,
    model,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    createdAt: new Date().toISOString(),
  });
}

export interface UsageSummary {
  stages: {
    stage: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    calls: number;
  }[];
  total: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    calls: number;
  };
}

export async function getProjectUsage(projectId: string): Promise<UsageSummary> {
  const db = getDb();
  const rows = await db.select().from(tokenUsage)
    .where(eq(tokenUsage.projectId, projectId))
    .all();

  // 按 stage 分组汇总
  const stageMap = new Map<string, { model: string; promptTokens: number; completionTokens: number; totalTokens: number; calls: number }>();
  for (const row of rows) {
    const existing = stageMap.get(row.stage);
    if (existing) {
      existing.promptTokens += row.promptTokens;
      existing.completionTokens += row.completionTokens;
      existing.totalTokens += row.totalTokens;
      existing.calls += 1;
    } else {
      stageMap.set(row.stage, {
        model: row.model,
        promptTokens: row.promptTokens,
        completionTokens: row.completionTokens,
        totalTokens: row.totalTokens,
        calls: 1,
      });
    }
  }

  const stages = Array.from(stageMap.entries()).map(([stage, data]) => ({ stage, ...data }));
  const total = {
    promptTokens: rows.reduce((sum, r) => sum + r.promptTokens, 0),
    completionTokens: rows.reduce((sum, r) => sum + r.completionTokens, 0),
    totalTokens: rows.reduce((sum, r) => sum + r.totalTokens, 0),
    calls: rows.length,
  };

  return { stages, total };
}
