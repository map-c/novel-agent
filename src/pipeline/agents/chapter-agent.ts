import { streamLLM } from '../../llm/index.js';
import type { LLMConfig, TokenUsage } from '../../types/llm.js';
import type { ChapterContext } from '../context-manager.js';
import { DEFAULT_PROMPTS } from '../../config/defaults.js';

/**
 * 章节生成 Agent
 * 使用流式输出，方便前端实时展示
 */
export async function runChapterAgent(
  context: ChapterContext,
  config: LLMConfig,
  onChunk?: (chunk: string) => void,
  systemPrompt?: string,
  onUsage?: (usage: TokenUsage) => void,
): Promise<string> {
  const system = systemPrompt ?? DEFAULT_PROMPTS['chapter'];
  const stream = streamLLM(
    `请根据以下信息撰写本章正文：\n\n${context.fullPrompt}`,
    config,
    system,
  );

  let fullText = '';

  for await (const chunk of stream.textStream) {
    fullText += chunk;
    onChunk?.(chunk);
  }

  const usage = await stream.usage;
  if (usage) onUsage?.(usage as TokenUsage);

  return fullText;
}
