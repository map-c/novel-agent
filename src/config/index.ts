import { getSetting, getSettingsByPrefix } from '../db/settings.js';
import { DEFAULT_PROMPTS, DEFAULT_MODELS } from './defaults.js';
import type { PipelineModelConfig } from '../pipeline/engine.js';
import type { LLMConfig } from '../types/llm.js';

/**
 * 获取单个提示词：DB > 默认值
 */
export async function getPrompt(key: string): Promise<string> {
  const dbValue = await getSetting(`prompt:${key}`);
  if (dbValue) return dbValue;
  return DEFAULT_PROMPTS[key] ?? '';
}

/**
 * 获取所有提示词（标记是否已自定义）
 */
export async function getAllPrompts(): Promise<Record<string, { value: string; isDefault: boolean }>> {
  const dbOverrides = await getSettingsByPrefix('prompt:');
  const result: Record<string, { value: string; isDefault: boolean }> = {};

  for (const [key, defaultValue] of Object.entries(DEFAULT_PROMPTS)) {
    const dbKey = `prompt:${key}`;
    if (dbOverrides[dbKey]) {
      result[key] = { value: dbOverrides[dbKey], isDefault: false };
    } else {
      result[key] = { value: defaultValue, isDefault: true };
    }
  }

  return result;
}

/**
 * 获取模型配置：DB > 环境变量 > 默认值
 */
export async function getModelConfig(): Promise<PipelineModelConfig> {
  const tiers = ['planning', 'writing', 'summary'] as const;
  const envMap = {
    planning: 'PLANNING_MODEL',
    writing: 'WRITING_MODEL',
    summary: 'SUMMARY_MODEL',
  } as const;

  const loadTier = async (tier: 'planning' | 'writing' | 'summary'): Promise<LLMConfig> => {
    const dbValue = await getSetting(`models:${tier}`);
    if (dbValue) return JSON.parse(dbValue);
    const envModel = process.env[envMap[tier]];
    const defaults = DEFAULT_MODELS[tier];
    return envModel ? { ...defaults, model: envModel } : { ...defaults };
  };

  return {
    planning: await loadTier('planning'),
    writing: await loadTier('writing'),
    summary: await loadTier('summary'),
  };
}

/**
 * 获取所有模型配置（含 isDefault 标记）
 */
export async function getAllModels(): Promise<Record<string, { config: LLMConfig; isDefault: boolean }>> {
  const tiers = ['planning', 'writing', 'summary'] as const;
  const result: Record<string, { config: LLMConfig; isDefault: boolean }> = {};

  for (const tier of tiers) {
    const dbValue = await getSetting(`models:${tier}`);
    if (dbValue) {
      result[tier] = { config: JSON.parse(dbValue), isDefault: false };
    } else {
      result[tier] = { config: { ...DEFAULT_MODELS[tier] }, isDefault: true };
    }
  }

  return result;
}
