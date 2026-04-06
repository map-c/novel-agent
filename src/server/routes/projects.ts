import { Hono } from 'hono';
import { getDb } from '../../db/index.js';
import * as db from '../../db/operations.js';
import { getProjectUsage } from '../../db/usage.js';
import { getProjectFeedback, saveFeedback } from '../../db/feedback.js';

const app = new Hono();

/** 列出所有项目 */
app.get('/', async (c) => {
  getDb(); // 确保初始化
  const projects = await db.listProjects();
  return c.json(projects);
});

/** 获取单个项目详情（含角色、章节） */
app.get('/:id', async (c) => {
  getDb();
  const id = c.req.param('id');
  try {
    const state = await db.loadPipelineState(id);
    return c.json(state);
  } catch {
    return c.json({ error: 'Project not found' }, 404);
  }
});

/** 创建新项目 */
app.post('/', async (c) => {
  getDb();
  const body = await c.req.json<{ prompt: string; title?: string }>();
  if (!body.prompt) {
    return c.json({ error: 'prompt is required' }, 400);
  }
  const id = await db.createProject(body.prompt, body.title);
  return c.json({ id }, 201);
});

/** 删除项目 */
app.delete('/:id', async (c) => {
  getDb();
  const id = c.req.param('id');
  await db.deleteProject(id);
  return c.json({ ok: true });
});

/** 导出项目为 Markdown */
app.get('/:id/export', async (c) => {
  getDb();
  const id = c.req.param('id');
  let state;
  try {
    state = await db.loadPipelineState(id);
  } catch {
    return c.json({ error: 'Project not found' }, 404);
  }

  const project = await db.getProject(id);
  const lines: string[] = [`# ${project?.title ?? '未命名小说'}`, ''];

  if (state.worldBuilding) {
    lines.push(`> ${state.worldBuilding.synopsis}`, '');
  }

  for (const ch of state.chapters) {
    lines.push(`## 第 ${ch.number} 章：${ch.title}`, '', ch.content, '');
  }

  const markdown = lines.join('\n');
  return new Response(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="novel.md"`,
    },
  });
});

// ─── Token Usage ───

app.get('/:id/usage', async (c) => {
  getDb();
  const id = c.req.param('id');
  const usage = await getProjectUsage(id);
  return c.json(usage);
});

// ─── Feedback ───

app.get('/:id/feedback', async (c) => {
  getDb();
  const id = c.req.param('id');
  const feedbackList = await getProjectFeedback(id);
  return c.json(feedbackList);
});

app.post('/:id/feedback', async (c) => {
  getDb();
  const id = c.req.param('id');
  const { targetType, targetId, rating } = await c.req.json<{
    targetType: string;
    targetId?: string;
    rating: string;
  }>();

  if (!targetType || !rating) {
    return c.json({ error: 'targetType and rating are required' }, 400);
  }
  if (!['satisfied', 'unsatisfied'].includes(rating)) {
    return c.json({ error: 'rating must be "satisfied" or "unsatisfied"' }, 400);
  }

  await saveFeedback(id, targetType, targetId ?? '', rating);
  return c.json({ ok: true });
});

export default app;
