import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { getDb } from '../../db/index.js';
import * as db from '../../db/operations.js';
import { PipelineEngine, type PipelineCallbacks, type PipelineModelConfig } from '../../pipeline/engine.js';
import type { SSEEvent } from '../../types/pipeline.js';

const app = new Hono();

function getModels(): PipelineModelConfig {
  return {
    planning: { model: process.env.PLANNING_MODEL ?? 'google/gemini-2.0-flash-001', temperature: 0.7, maxTokens: 4000 },
    writing:  { model: process.env.WRITING_MODEL  ?? 'google/gemini-2.0-flash-001', temperature: 0.8, maxTokens: 4000 },
    summary:  { model: process.env.SUMMARY_MODEL  ?? 'google/gemini-2.0-flash-001', temperature: 0.3, maxTokens: 800 },
  };
}

function makeSseCallbacks(
  write: (event: string, data: string) => Promise<void>,
): PipelineCallbacks {
  const send = async (event: SSEEvent) => {
    await write(event.type, JSON.stringify(event));
  };
  return {
    onStageChange: (stage) => { send({ type: 'stage_changed', stage }); },
    onReviewReady: () => { send({ type: 'review_ready', stage: 'review', data: null }); },
    onChapterChunk: (num, text) => { send({ type: 'chunk', chapterNumber: num, text }); },
    onChapterComplete: (num) => { send({ type: 'chapter_complete', chapterNumber: num }); },
    onError: (err) => { send({ type: 'error', message: err.message }); },
  };
}

/**
 * GET /projects/:id/stream
 * SSE 流式推送 input → review 阶段
 */
app.get('/:id/stream', async (c) => {
  getDb();
  const id = c.req.param('id');
  const project = await db.getProject(id);
  if (!project) return c.json({ error: 'Project not found' }, 404);

  return streamSSE(c, async (stream) => {
    const write = async (event: string, data: string) => {
      await stream.writeSSE({ event, data });
    };

    try {
      if (project.status === 'review') {
        await write('review_ready', JSON.stringify({ type: 'review_ready', stage: 'review', data: null }));
        return;
      }

      const engine = await PipelineEngine.create(
        project.userPrompt,
        getModels(),
        makeSseCallbacks(write),
        { persist: true, projectId: id },
      );

      await engine.run();
    } catch (err) {
      await write('error', JSON.stringify({ type: 'error', message: (err as Error).message }));
    }
  });
});

/**
 * GET /projects/:id/stream/generate
 * SSE 流式推送章节生成（审阅通过后调用）
 */
app.get('/:id/stream/generate', async (c) => {
  getDb();
  const id = c.req.param('id');
  const project = await db.getProject(id);
  if (!project) return c.json({ error: 'Project not found' }, 404);
  if (project.status !== 'review') {
    return c.json({ error: `Expected "review" status, got "${project.status}"` }, 400);
  }

  return streamSSE(c, async (stream) => {
    const write = async (event: string, data: string) => {
      await stream.writeSSE({ event, data });
    };

    try {
      const engine = await PipelineEngine.resume(id, getModels(), makeSseCallbacks(write));
      await engine.approve();
      await write('complete', JSON.stringify({ type: 'complete' }));
    } catch (err) {
      await write('error', JSON.stringify({ type: 'error', message: (err as Error).message }));
    }
  });
});

export default app;
