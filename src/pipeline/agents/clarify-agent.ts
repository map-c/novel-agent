import { z } from 'zod';
import { callLLMStructured } from '../../llm/index.js';
import type { LLMConfig } from '../../types/llm.js';
import type { InputAnalysis } from './input-agent.js';
import { inputAnalysisSchema } from './input-agent.js';

/** 追问问题的 schema */
const clarifyQuestionsSchema = z.object({
  questions: z.array(z.string()).min(1).max(3).describe('1-3 个关键问题，帮助完善故事方向'),
});

const CLARIFY_SYSTEM = `你是一个小说策划专家。根据对用户创作想法的初步分析，提出 1-3 个最关键的追问。

要求：
- 只问真正影响故事方向的问题（角色身份、核心冲突、结局走向等）
- 不要问可以由 AI 自行决定的细节
- 每个问题简洁明了，用中文提问
- 如果初步分析已经足够详细，仍然提 1 个问题确认最重要的方向`;

/**
 * 根据初步输入分析生成 1-3 个追问
 */
export async function runClarifyAgent(
  analysis: InputAnalysis,
  config: LLMConfig,
): Promise<string[]> {
  const prompt = `以下是对用户创作想法的初步分析：

标题：${analysis.title}
体裁：${analysis.genre}
主题：${analysis.themes.join('、')}
基调：${analysis.tone}
建议章节数：${analysis.targetChapters}
梗概：${analysis.synopsis}

请提出 1-3 个关键问题，帮助进一步明确故事方向。`;

  const { object } = await callLLMStructured(prompt, config, clarifyQuestionsSchema, CLARIFY_SYSTEM);
  return object.questions;
}

const REFINE_SYSTEM = `你是一个小说策划专家。根据用户对追问的回答，完善和补充原有的故事分析。

要求：
- 将用户的回答融入到分析中
- 保留原有分析中没有被用户否定的部分
- 根据回答调整体裁、基调、主题等要素
- 丰富故事梗概，使其更加具体和有方向性
- 输出必须是结构化的 JSON`;

/**
 * 根据用户的回答补充完善输入分析
 */
export async function runRefineAgent(
  analysis: InputAnalysis,
  answers: { question: string; answer: string }[],
  config: LLMConfig,
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

  const { object } = await callLLMStructured(prompt, config, inputAnalysisSchema, REFINE_SYSTEM);
  return object;
}
