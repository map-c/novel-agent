import { z } from 'zod';
import { callLLMStructured } from '../../llm/index.js';
import type { LLMConfig } from '../../types/llm.js';
import { DEFAULT_PROMPTS } from '../../config/defaults.js';

/** 输入分析 Agent 的输出 schema */
export const inputAnalysisSchema = z.object({
  title: z.string().describe('小说标题'),
  genre: z.string().describe('体裁，如：奇幻、科幻、悬疑、都市、历史等'),
  themes: z.array(z.string()).describe('核心主题，2-4 个'),
  tone: z.string().describe('基调，如：轻松幽默、沉重严肃、温暖治愈、紧张刺激'),
  targetChapters: z.number().describe('建议章节数'),
  synopsis: z.string().describe('基于用户输入扩展的故事梗概，200-400 字'),
});

export type InputAnalysis = z.infer<typeof inputAnalysisSchema>;

export async function runInputAgent(
  userPrompt: string,
  config: LLMConfig,
  systemPrompt?: string,
): Promise<InputAnalysis> {
  const system = systemPrompt ?? DEFAULT_PROMPTS['input'];
  const { object } = await callLLMStructured(
    `用户的创作想法：\n${userPrompt}`,
    config,
    inputAnalysisSchema,
    system,
  );
  return object;
}
