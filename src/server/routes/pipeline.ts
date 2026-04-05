import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { getDb } from '../../db/index.js';
import * as db from '../../db/operations.js';
import { PipelineEngine, type PipelineCallbacks, type PipelineModelConfig } from '../../pipeline/engine.js';
import { runRefineAgent } from '../../pipeline/agents/clarify-agent.js';
import type { InputAnalysis } from '../../pipeline/agents/input-agent.js';
import type { SSEEvent } from '../../types/pipeline.js';
import type { PipelineStatus } from '../../types/project.js';

const app = new Hono();

/** 所有审阅门控状态 */
const REVIEW_STATES: Set<PipelineStatus> = new Set([
  'review_world',
  'review_characters',
  'review_outline',
]);

/** 活跃的生成引擎（用于暂停请求） */
const activeEngines = new Map<string, PipelineEngine>();

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
    onReviewReady: (state) => {
      send({ type: 'review_ready', stage: state.status, data: null });
    },
    onChapterChunk: (num, text) => { send({ type: 'chunk', chapterNumber: num, text }); },
    onChapterComplete: (num) => { send({ type: 'chapter_complete', chapterNumber: num }); },
    onClarifyQuestions: (questions) => { send({ type: 'clarify_questions', questions }); },
    onError: (err) => { send({ type: 'error', message: err.message }); },
  };
}

/**
 * GET /projects/:id/stream
 * SSE 流式推送 —— 运行流水线直到下一个审阅门控
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

    // 心跳：每 15 秒发送 comment 防止连接超时
    const heartbeat = setInterval(async () => {
      try { await stream.writeSSE({ event: 'heartbeat', data: '' }); } catch { /* stream closed */ }
    }, 15_000);

    try {
      // 如果在追问阶段，发送已有的问题
      if (project.status === 'clarifying') {
        const state = await db.loadPipelineState(id);
        if (state.clarifyQuestions?.length) {
          await write('clarify_questions', JSON.stringify({
            type: 'clarify_questions',
            questions: state.clarifyQuestions,
          }));
        }
        await write('review_ready', JSON.stringify({
          type: 'review_ready',
          stage: 'clarifying',
          data: null,
        }));
        return;
      }

      // 如果已经在审阅态，直接发 review_ready
      if (REVIEW_STATES.has(project.status as PipelineStatus)) {
        await write('review_ready', JSON.stringify({
          type: 'review_ready',
          stage: project.status,
          data: null,
        }));
        return;
      }

      // 如果已完成或已暂停
      if (project.status === 'complete') {
        await write('complete', JSON.stringify({ type: 'complete' }));
        return;
      }
      if (project.status === 'paused') {
        await write('stage_changed', JSON.stringify({ type: 'stage_changed', stage: 'paused' }));
        return;
      }

      // 新建或恢复流水线
      let engine: PipelineEngine;
      if (project.status === 'input') {
        engine = await PipelineEngine.create(
          project.userPrompt,
          getModels(),
          makeSseCallbacks(write),
          { persist: true, projectId: id },
        );
      } else {
        engine = await PipelineEngine.resume(id, getModels(), makeSseCallbacks(write));
      }

      await engine.run();
    } catch (err) {
      await write('error', JSON.stringify({ type: 'error', message: (err as Error).message }));
    } finally {
      clearInterval(heartbeat);
    }
  });
});

/**
 * POST /projects/:id/approve
 * 审阅通过当前阶段
 */
app.post('/:id/approve', async (c) => {
  getDb();
  const id = c.req.param('id');
  const project = await db.getProject(id);
  if (!project) return c.json({ error: 'Project not found' }, 404);

  if (!REVIEW_STATES.has(project.status as PipelineStatus)) {
    return c.json({ error: `当前状态 "${project.status}" 不是审阅状态` }, 400);
  }

  // 如果有编辑数据，先保存
  const body = await c.req.json().catch(() => ({}));
  if (body.editedData) {
    switch (project.status) {
      case 'review_world':
        await db.saveWorldBuildingData(id, body.editedData);
        break;
      case 'review_characters':
        await db.saveCharactersData(id, body.editedData);
        break;
      case 'review_outline':
        await db.savePlotOutlineData(id, body.editedData);
        break;
    }
  }

  // 推进到下一个状态
  const nextStatusMap: Record<string, PipelineStatus> = {
    review_world: 'character_design',
    review_characters: 'outline',
    review_outline: 'generating',
  };
  const nextStatus = nextStatusMap[project.status];
  await db.updateProjectStatus(id, nextStatus);

  return c.json({ ok: true, nextStatus });
});

/**
 * POST /projects/:id/reject
 * 驳回当前阶段，重新生成
 */
app.post('/:id/reject', async (c) => {
  getDb();
  const id = c.req.param('id');
  const project = await db.getProject(id);
  if (!project) return c.json({ error: 'Project not found' }, 404);

  if (!REVIEW_STATES.has(project.status as PipelineStatus)) {
    return c.json({ error: `当前状态 "${project.status}" 不是审阅状态` }, 400);
  }

  const regenTargetMap: Record<string, PipelineStatus> = {
    review_world: 'world_building',
    review_characters: 'character_design',
    review_outline: 'outline',
  };
  const regenTarget = regenTargetMap[project.status];
  await db.updateProjectStatus(id, regenTarget);

  return c.json({ ok: true, regenTarget });
});

/**
 * POST /projects/:id/clarify
 * 提交追问回答
 */
app.post('/:id/clarify', async (c) => {
  getDb();
  const id = c.req.param('id');
  const project = await db.getProject(id);
  if (!project) return c.json({ error: 'Project not found' }, 404);

  if (project.status !== 'clarifying') {
    return c.json({ error: `当前状态 "${project.status}" 不是追问阶段` }, 400);
  }

  const { answers } = await c.req.json<{ answers: string[] }>();
  if (!answers?.length) {
    return c.json({ error: '请提供回答' }, 400);
  }

  const questions = (project.clarifyQuestions as string[]) ?? [];
  const analysis = project.inputAnalysis as InputAnalysis | null;

  // 保存回答
  await db.saveClarification(id, questions, answers);

  // 用回答补充完善分析
  if (analysis) {
    const qa = questions.map((q: string, i: number) => ({ question: q, answer: answers[i] ?? '' }));
    const refined = await runRefineAgent(analysis, qa, getModels().planning);
    await db.saveInputAnalysisData(id, refined.title, refined);
  }

  // 推进状态到 world_building
  await db.updateProjectStatus(id, 'world_building');

  return c.json({ ok: true, nextStatus: 'world_building' });
});

/**
 * POST /projects/:id/pause
 * 请求暂停章节生成（当前章写完后暂停）
 */
app.post('/:id/pause', async (c) => {
  const id = c.req.param('id');
  const engine = activeEngines.get(id);
  if (!engine) {
    return c.json({ error: '没有正在运行的生成任务' }, 400);
  }
  engine.requestPause();
  return c.json({ ok: true });
});

/**
 * GET /projects/:id/stream/generate
 * SSE 流式推送章节生成（审阅大纲通过后 或 暂停恢复时调用）
 */
app.get('/:id/stream/generate', async (c) => {
  getDb();
  const id = c.req.param('id');
  const project = await db.getProject(id);
  if (!project) return c.json({ error: 'Project not found' }, 404);

  // 如果状态已变化（如已完成或进入审阅），返回 SSE 事件而非 400 JSON
  // 避免 EventSource 重连时收到非 SSE 响应导致报错
  if (project.status !== 'generating' && project.status !== 'paused') {
    return streamSSE(c, async (stream) => {
      const write = async (event: string, data: string) => {
        await stream.writeSSE({ event, data });
      };
      if (project.status === 'complete') {
        await write('complete', JSON.stringify({ type: 'complete' }));
      } else {
        await write('stage_changed', JSON.stringify({ type: 'stage_changed', stage: project.status }));
      }
    });
  }

  return streamSSE(c, async (stream) => {
    const write = async (event: string, data: string) => {
      await stream.writeSSE({ event, data });
    };

    // 心跳：每 15 秒发送 comment 防止连接超时
    const heartbeat = setInterval(async () => {
      try { await stream.writeSSE({ event: 'heartbeat', data: '' }); } catch { /* stream closed */ }
    }, 15_000);

    try {
      const engine = await PipelineEngine.resume(id, getModels(), makeSseCallbacks(write));
      activeEngines.set(id, engine);

      if (project.status === 'paused') {
        await engine.resumeGeneration();
      } else {
        await engine.startGeneration();
      }

      // 如果没有被暂停，说明已完成
      if (engine.currentState.status !== 'paused') {
        await write('complete', JSON.stringify({ type: 'complete' }));
      }
    } catch (err) {
      await write('error', JSON.stringify({ type: 'error', message: (err as Error).message }));
    } finally {
      clearInterval(heartbeat);
      activeEngines.delete(id);
    }
  });
});

export default app;
