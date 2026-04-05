import { z } from 'zod';
import { callLLMStructured } from '../../llm/index.js';
import type { LLMConfig } from '../../types/llm.js';
import type { InputAnalysis } from './input-agent.js';
import type { WorldBuildingResult } from './world-agent.js';

const characterSchema = z.object({
  name: z.string().describe('角色姓名'),
  role: z.enum(['protagonist', 'antagonist', 'supporting', 'minor']).describe('角色类型'),
  description: z.string().describe('外貌和性格的简要描述'),
  backstory: z.string().describe('背景故事，100-200 字'),
  motivations: z.array(z.string()).describe('核心动机，1-3 个'),
  voiceNotes: z.string().describe('说话风格和语言习惯'),
  arc: z.string().describe('角色成长弧线'),
});

export const charactersSchema = z.object({
  characters: z.array(characterSchema).describe('角色列表，3-6 个核心角色'),
  relationships: z.array(z.object({
    from: z.string().describe('角色A姓名'),
    to: z.string().describe('角色B姓名'),
    type: z.string().describe('关系类型，如：师徒、恋人、宿敌、挚友'),
    description: z.string().describe('关系描述'),
  })).describe('角色之间的关系'),
});

export type CharacterDesignResult = z.infer<typeof charactersSchema>;

const SYSTEM = `你是一个角色设计专家。基于故事梗概和世界观，设计一组鲜明、立体的角色。
要求：
1. 每个角色要有清晰的动机和成长弧线
2. 角色之间要有冲突或互补的关系
3. 角色的语言风格要有辨识度
4. 至少包含一个主角和一个对手角色
5. 角色设定必须与世界观规则一致`;

export async function runCharacterAgent(
  input: InputAnalysis,
  world: WorldBuildingResult,
  config: LLMConfig,
): Promise<CharacterDesignResult> {
  const prompt = `故事信息：
- 标题：${input.title}
- 体裁：${input.genre}
- 梗概：${input.synopsis}

世界观：
- 时代：${world.era}
- 场景：${world.setting}
- 基调：${world.tone}
- 规则：${world.rules.join('；')}

请设计一组角色及他们之间的关系。`;

  const { object } = await callLLMStructured(prompt, config, charactersSchema, SYSTEM);
  return object;
}
