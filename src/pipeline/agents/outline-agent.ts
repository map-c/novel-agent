import { z } from 'zod';
import { streamLLMStructured } from '../../llm/index.js';
import type { LLMConfig } from '../../types/llm.js';
import type { InputAnalysis } from './input-agent.js';
import type { WorldBuildingResult } from './world-agent.js';
import type { CharacterDesignResult } from './character-agent.js';
import { DEFAULT_PROMPTS } from '../../config/defaults.js';

const chapterOutlineSchema = z.object({
  number: z.number().describe('章节序号'),
  title: z.string().describe('章节标题'),
  summary: z.string().describe('章节内容摘要，100-200 字'),
  keyEvents: z.array(z.string()).describe('关键事件，2-4 个'),
  charactersInvolved: z.array(z.string()).describe('出场角色姓名列表'),
  endHook: z.string().describe('章末悬念/过渡，引导读者继续阅读'),
});

const actSchema = z.object({
  number: z.number().describe('幕序号'),
  title: z.string().describe('幕标题'),
  summary: z.string().describe('本幕概要'),
  chapters: z.array(chapterOutlineSchema),
});

export const plotOutlineSchema = z.object({
  premise: z.string().describe('故事核心前提，一句话概括'),
  totalChapters: z.number().describe('总章节数'),
  acts: z.array(actSchema).describe('三幕结构'),
});

export type PlotOutlineResult = z.infer<typeof plotOutlineSchema>;

export async function runOutlineAgent(
  input: InputAnalysis,
  world: WorldBuildingResult,
  characters: CharacterDesignResult,
  config: LLMConfig,
  onChunk?: (chunk: string) => void,
  systemPrompt?: string,
): Promise<PlotOutlineResult> {
  const characterSummary = characters.characters
    .map((c) => `- ${c.name}（${c.role}）：${c.description}。动机：${c.motivations.join('、')}`)
    .join('\n');

  const relationshipSummary = characters.relationships
    .map((r) => `- ${r.from} ↔ ${r.to}：${r.type}，${r.description}`)
    .join('\n');

  const prompt = `故事信息：
- 标题：${input.title}
- 体裁：${input.genre}
- 目标章节数：${input.targetChapters}
- 梗概：${input.synopsis}

世界观：
- 时代：${world.era}
- 场景：${world.setting}
- 规则：${world.rules.join('；')}

角色：
${characterSummary}

角色关系：
${relationshipSummary}

请设计完整的章节大纲，使用三幕结构。`;

  const system = systemPrompt ?? DEFAULT_PROMPTS['outline'];
  const { object } = await streamLLMStructured(prompt, config, plotOutlineSchema, system, onChunk);
  return object;
}
