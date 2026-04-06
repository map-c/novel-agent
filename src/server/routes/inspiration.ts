import { Hono } from 'hono';
import { callLLMStructured } from '../../llm/index.js';
import { getModelConfig } from '../../config/index.js';
import { getDb } from '../../db/index.js';
import { z } from 'zod';

const app = new Hono();

const inspirationSchema = z.object({
  ideas: z.array(z.string().describe('一句话小说创意，50-100字，包含主角、核心冲突和世界观')).length(3),
});

/**
 * POST /api/inspiration
 * 生成 3 个小说创意灵感
 */
app.post('/', async (c) => {
  getDb();
  const models = await getModelConfig();

  const { object } = await callLLMStructured(
    `请生成 3 个风格各异的小说创意。每个创意用一句话描述，包含：主角身份、核心冲突、世界观背景。
要求：
- 3 个创意的体裁各不相同（如奇幻、科幻、悬疑、都市、历史等）
- 每个创意 50-100 字
- 有吸引力，能激发创作欲望
- 用中文输出`,
    { ...models.planning, maxTokens: 1000 },
    inspirationSchema,
    '你是一个创意灵感生成器，擅长为小说作者提供有趣的故事点子。',
  );

  return c.json({ ideas: object.ideas });
});

export default app;
