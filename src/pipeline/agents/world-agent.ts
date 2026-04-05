import { z } from 'zod';
import { callLLMStructured } from '../../llm/index.js';
import type { LLMConfig } from '../../types/llm.js';
import type { InputAnalysis } from './input-agent.js';

export const worldBuildingSchema = z.object({
  era: z.string().describe('时代背景'),
  setting: z.string().describe('主要场景描述，包含地理、气候、社会环境'),
  tone: z.string().describe('叙事基调和氛围'),
  themes: z.array(z.string()).describe('世界观中体现的主题'),
  rules: z.array(z.string()).describe('世界观规则/设定，如魔法体系、科技水平、社会制度等'),
  synopsis: z.string().describe('世界观总览，300-500 字的完整描述'),
});

export type WorldBuildingResult = z.infer<typeof worldBuildingSchema>;

const SYSTEM = `你是一个世界观架构师。基于故事梗概和体裁信息，构建一个完整且自洽的世界观。
要求：
1. 世界观必须服务于故事主题
2. 设定要具体、可感知，避免空泛描述
3. 规则要清晰明确，为后续创作提供约束
4. 基调与故事整体风格一致`;

export async function runWorldAgent(input: InputAnalysis, config: LLMConfig): Promise<WorldBuildingResult> {
  const prompt = `故事信息：
- 标题：${input.title}
- 体裁：${input.genre}
- 基调：${input.tone}
- 主题：${input.themes.join('、')}
- 梗概：${input.synopsis}

请基于以上信息构建完整的世界观设定。`;

  const { object } = await callLLMStructured(prompt, config, worldBuildingSchema, SYSTEM);
  return object;
}
