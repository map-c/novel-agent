import { z } from 'zod';
import { callLLMStructured } from '../../llm/index.js';
import type { LLMConfig } from '../../types/llm.js';
import type { InputAnalysis } from './input-agent.js';
import { DEFAULT_PROMPTS } from '../../config/defaults.js';

export const worldBuildingSchema = z.object({
  era: z.string().describe('时代背景'),
  setting: z.string().describe('主要场景描述，包含地理、气候、社会环境'),
  tone: z.string().describe('叙事基调和氛围'),
  themes: z.array(z.string()).describe('世界观中体现的主题'),
  rules: z.array(z.string()).describe('世界观规则/设定，如魔法体系、科技水平、社会制度等'),
  synopsis: z.string().describe('世界观总览，300-500 字的完整描述'),
});

export type WorldBuildingResult = z.infer<typeof worldBuildingSchema>;

export async function runWorldAgent(
  input: InputAnalysis,
  config: LLMConfig,
  systemPrompt?: string,
): Promise<WorldBuildingResult> {
  const prompt = `故事信息：
- 标题：${input.title}
- 体裁：${input.genre}
- 基调：${input.tone}
- 主题：${input.themes.join('、')}
- 梗概：${input.synopsis}

请基于以上信息构建完整的世界观设定。`;

  const system = systemPrompt ?? DEFAULT_PROMPTS['world'];
  const { object } = await callLLMStructured(prompt, config, worldBuildingSchema, system);
  return object;
}
