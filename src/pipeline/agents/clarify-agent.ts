import { z } from 'zod';
import { callLLMStructured } from '../../llm/index.js';
import type { LLMConfig, TokenUsage } from '../../types/llm.js';
import type { InputAnalysis } from './input-agent.js';
import { inputAnalysisSchema } from './input-agent.js';
import { DEFAULT_PROMPTS } from '../../config/defaults.js';

/** 追问问题的 schema */
const clarifyQuestionsSchema = z.object({
  questions: z.array(z.string()).min(1).max(3).describe('1-3 个关键问题，帮助完善故事方向'),
});

/**
 * 根据初步输入分析生成 1-3 个追问
 */
export async function runClarifyAgent(
  analysis: InputAnalysis,
  config: LLMConfig,
  systemPrompt?: string,
  onUsage?: (usage: TokenUsage) => void,
): Promise<string[]> {
  const prompt = `以下是对用户创作想法的初步分析：

标题：${analysis.title}
体裁：${analysis.genre}
主题：${analysis.themes.join('、')}
基调：${analysis.tone}
建议章节数：${analysis.targetChapters}
梗概：${analysis.synopsis}

请提出 1-3 个关键问题，帮助进一步明确故事方向。`;

  const system = systemPrompt ?? DEFAULT_PROMPTS['clarify'];
  const { object, usage } = await callLLMStructured(prompt, config, clarifyQuestionsSchema, system);
  if (usage) onUsage?.(usage as TokenUsage);
  return object.questions;
}

/**
 * 根据用户的回答补充完善输入分析
 */
export async function runRefineAgent(
  analysis: InputAnalysis,
  answers: { question: string; answer: string }[],
  config: LLMConfig,
  systemPrompt?: string,
  onUsage?: (usage: TokenUsage) => void,
): Promise<InputAnalysis> {
  const qaText = answers
    .map((a, i) => `问题 ${i + 1}：${a.question}\n回答：${a.answer}`)
    .join('\n\n');

  const prompt = `原始分析：
标题：${analysis.title}
体裁：${analysis.genre}
主题：${analysis.themes.join('、')}
基调：${analysis.tone}
建议章节数：${analysis.targetChapters}
梗概：${analysis.synopsis}

用户的补充回答：
${qaText}

请根据用户的回答，输出完善后的分析。`;

  const system = systemPrompt ?? DEFAULT_PROMPTS['refine'];
  const { object, usage } = await callLLMStructured(prompt, config, inputAnalysisSchema, system);
  if (usage) onUsage?.(usage as TokenUsage);
  return object;
}
