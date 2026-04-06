import { Hono } from 'hono';
import { getDb } from '../../db/index.js';
import { getSetting, setSetting, deleteSetting } from '../../db/settings.js';
import { getAllPrompts, getAllModels, getModelConfig } from '../../config/index.js';
import { DEFAULT_PROMPTS, DEFAULT_MODELS, DEFAULT_PRESETS, PROMPT_LABELS } from '../../config/defaults.js';

const app = new Hono();

// ─── Prompts ───

/**
 * GET /settings/prompts
 * 返回所有提示词（含默认值标记和标签）
 */
app.get('/prompts', async (c) => {
  getDb();
  const prompts = await getAllPrompts();
  // 附加标签
  const result: Record<string, { value: string; isDefault: boolean; label: string; defaultValue: string }> = {};
  for (const [key, data] of Object.entries(prompts)) {
    result[key] = {
      ...data,
      label: PROMPT_LABELS[key] ?? key,
      defaultValue: DEFAULT_PROMPTS[key] ?? '',
    };
  }
  return c.json(result);
});

/**
 * PUT /settings/prompts/:key
 * 更新单个提示词
 */
app.put('/prompts/:key', async (c) => {
  getDb();
  const key = c.req.param('key');
  if (!(key in DEFAULT_PROMPTS)) {
    return c.json({ error: `Unknown prompt key: ${key}` }, 400);
  }
  const { value } = await c.req.json<{ value: string }>();
  if (!value?.trim()) {
    return c.json({ error: '提示词不能为空' }, 400);
  }
  await setSetting(`prompt:${key}`, value);
  return c.json({ ok: true });
});

/**
 * DELETE /settings/prompts/:key
 * 重置为默认值（删除 DB 覆盖）
 */
app.delete('/prompts/:key', async (c) => {
  getDb();
  const key = c.req.param('key');
  await deleteSetting(`prompt:${key}`);
  return c.json({ ok: true, defaultValue: DEFAULT_PROMPTS[key] ?? '' });
});

// ─── Models ───

/**
 * GET /settings/models
 * 返回三个层级的模型配置
 */
app.get('/models', async (c) => {
  getDb();
  const models = await getAllModels();
  const result: Record<string, { config: { model: string; temperature?: number; maxTokens?: number }; isDefault: boolean; defaultConfig: { model: string; temperature?: number; maxTokens?: number } }> = {};
  for (const [tier, data] of Object.entries(models)) {
    result[tier] = {
      ...data,
      defaultConfig: DEFAULT_MODELS[tier as keyof typeof DEFAULT_MODELS],
    };
  }
  return c.json(result);
});

/**
 * PUT /settings/models/:tier
 * 更新单个层级的模型配置
 */
app.put('/models/:tier', async (c) => {
  getDb();
  const tier = c.req.param('tier');
  if (!['planning', 'writing', 'summary'].includes(tier)) {
    return c.json({ error: `Unknown tier: ${tier}` }, 400);
  }
  const config = await c.req.json<{ model: string; temperature?: number; maxTokens?: number }>();
  if (!config.model?.trim()) {
    return c.json({ error: '模型名称不能为空' }, 400);
  }
  await setSetting(`models:${tier}`, JSON.stringify(config));
  return c.json({ ok: true });
});

/**
 * DELETE /settings/models/:tier
 * 重置为默认值
 */
app.delete('/models/:tier', async (c) => {
  getDb();
  const tier = c.req.param('tier');
  await deleteSetting(`models:${tier}`);
  return c.json({ ok: true, defaultConfig: DEFAULT_MODELS[tier as keyof typeof DEFAULT_MODELS] });
});

// ─── Presets ───

/**
 * GET /settings/presets
 * 返回所有预设
 */
app.get('/presets', async (c) => {
  return c.json(DEFAULT_PRESETS);
});

/**
 * POST /settings/presets/apply
 * 应用预设（覆盖当前模型配置）
 */
app.post('/presets/apply', async (c) => {
  getDb();
  const { name } = await c.req.json<{ name: string }>();
  const preset = DEFAULT_PRESETS[name];
  if (!preset) {
    return c.json({ error: `Unknown preset: ${name}` }, 400);
  }

  for (const [tier, config] of Object.entries(preset.models)) {
    await setSetting(`models:${tier}`, JSON.stringify(config));
  }

  return c.json({ ok: true });
});

export default app;
