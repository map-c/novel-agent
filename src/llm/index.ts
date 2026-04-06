import { generateText, generateObject, streamText, streamObject } from 'ai';
import type { z } from 'zod';
import { createOpenRouterProvider } from './client.js';
import type { LLMConfig } from '../types/llm.js';

const provider = () => createOpenRouterProvider();

/**
 * 纯文本生成
 */
export async function callLLM(
  prompt: string,
  config: LLMConfig,
  system?: string,
) {
  const openrouter = provider();
  const result = await generateText({
    model: openrouter(config.model),
    prompt,
    system,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  });

  return {
    text: result.text,
    usage: result.usage,
  };
}

/**
 * 结构化输出 — 传入 Zod schema，返回类型安全的对象
 */
export async function callLLMStructured<T extends z.ZodType>(
  prompt: string,
  config: LLMConfig,
  schema: T,
  system?: string,
) {
  const openrouter = provider();
  const result = await generateObject({
    model: openrouter(config.model),
    prompt,
    system,
    schema,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  });

  return {
    object: result.object as z.infer<T>,
    usage: result.usage,
  };
}

/**
 * 流式结构化生成 — 边生成边回调原始文本片段，最终返回类型安全的对象
 */
export async function streamLLMStructured<T extends z.ZodType>(
  prompt: string,
  config: LLMConfig,
  schema: T,
  system?: string,
  onChunk?: (chunk: string) => void,
): Promise<{ object: z.infer<T>; usage: unknown }> {
  const openrouter = provider();
  const result = streamObject({
    model: openrouter(config.model),
    prompt,
    system,
    schema,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  });

  // 消费文本流，逐 chunk 回调
  for await (const chunk of result.textStream) {
    onChunk?.(chunk);
  }

  // 等待最终对象
  const finalObject = await result.object;
  const usage = await result.usage;

  return {
    object: finalObject as z.infer<T>,
    usage,
  };
}

/**
 * 流式文本生成 — 返回 streamText 的结果，调用方可以逐 chunk 消费
 */
export function streamLLM(
  prompt: string,
  config: LLMConfig,
  system?: string,
) {
  const openrouter = provider();
  return streamText({
    model: openrouter(config.model),
    prompt,
    system,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  });
}
