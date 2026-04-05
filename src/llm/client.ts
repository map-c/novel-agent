import { createOpenAI } from '@ai-sdk/openai';

/**
 * 创建指向 OpenRouter 的 AI SDK provider
 * 所有模型调用都通过这个 provider，用 model ID 区分不同后端
 * 例如: "anthropic/claude-sonnet-4-20250514", "openai/gpt-4o", "google/gemini-2.0-flash-001"
 */
export function createOpenRouterProvider() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  return createOpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
  });
}
