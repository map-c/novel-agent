import { streamLLM } from '../../llm/index.js';
import type { LLMConfig } from '../../types/llm.js';
import type { ChapterContext } from '../context-manager.js';

const SYSTEM = `你是一个小说作家。根据提供的世界观、角色设定、前情摘要和章节大纲，撰写完整的章节正文。

写作要求：
1. 严格按照大纲的关键事件和章末悬念来写
2. 角色对话要符合各自的语言风格
3. 自然衔接上一章的结尾（如果有）
4. 场景描写要生动具体，符合世界观设定
5. 章节长度约 1500-2500 字
6. 只输出正文内容，不要输出章节标题或 markdown 格式`;

/**
 * 章节生成 Agent
 * 使用流式输出，方便前端实时展示
 */
export async function runChapterAgent(
  context: ChapterContext,
  config: LLMConfig,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  const stream = streamLLM(
    `请根据以下信息撰写本章正文：\n\n${context.fullPrompt}`,
    config,
    SYSTEM,
  );

  let fullText = '';

  for await (const chunk of stream.textStream) {
    fullText += chunk;
    onChunk?.(chunk);
  }

  return fullText;
}
