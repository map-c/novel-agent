import { callLLM } from '../llm/index.js';
import type { LLMConfig } from '../types/llm.js';
import type { WorldBuilding, Character, ChapterOutline } from '../types/project.js';
import type { PipelineState } from '../types/pipeline.js';

/**
 * 章节上下文 —— 喂给章节生成 Agent 的完整上下文
 */
export interface ChapterContext {
  /** 世界观摘要 */
  worldSummary: string;
  /** 本章出场角色卡片 */
  characterCards: string;
  /** 到目前为止的情节进展摘要（滚动更新） */
  plotProgress: string;
  /** 上一章结尾段落（用于衔接） */
  previousEnding: string;
  /** 当前章节的大纲 */
  currentOutline: string;
  /** 组装好的完整 prompt */
  fullPrompt: string;
}

/**
 * 上下文管理器
 *
 * 核心职责：
 * 1. 为每章组装精确的上下文（控制 token 用量）
 * 2. 每章完成后更新滚动摘要（压缩而非追加）
 *
 * 这是整个项目最关键的组件 —— 决定了长篇叙事的一致性
 */
export class ContextManager {
  /** 滚动摘要：每章完成后压缩更新，而非无限追加 */
  private plotSummary = '';
  /** 每章的独立摘要 */
  private chapterSummaries: Map<number, string> = new Map();
  /** 每章结尾段落（用于衔接） */
  private chapterEndings: Map<number, string> = new Map();
  /** 用于生成摘要的弱模型配置 */
  private summaryConfig: LLMConfig;

  constructor(
    private state: PipelineState,
    private strongConfig: LLMConfig,
    summaryConfig?: LLMConfig,
  ) {
    this.summaryConfig = summaryConfig ?? {
      model: 'google/gemini-2.0-flash-001',
      temperature: 0.3,
      maxTokens: 800,
    };
  }

  /** 从持久化数据恢复内部状态（用于中断恢复） */
  restore(data: {
    plotSummary?: string;
    chapterSummaries: Map<number, string>;
    chapterEndings: Map<number, string>;
  }) {
    this.plotSummary = data.plotSummary ?? '';
    this.chapterSummaries = data.chapterSummaries;
    this.chapterEndings = data.chapterEndings;
  }

  /** 获取当前滚动摘要（用于持久化） */
  getPlotSummary() { return this.plotSummary; }

  /** 获取指定章节的摘要和结尾（用于持久化） */
  getChapterMeta(chapterNumber: number) {
    return {
      summary: this.chapterSummaries.get(chapterNumber),
      ending: this.chapterEndings.get(chapterNumber),
    };
  }

  /**
   * 为指定章节组装上下文
   */
  buildChapterContext(chapterNumber: number): ChapterContext {
    const outline = this.findChapterOutline(chapterNumber);
    if (!outline) throw new Error(`Chapter outline not found: ${chapterNumber}`);

    const worldSummary = this.buildWorldSummary();
    const characterCards = this.buildCharacterCards(outline.charactersInvolved);
    const plotProgress = this.plotSummary || '（这是第一章，尚无前情）';
    const previousEnding = this.chapterEndings.get(chapterNumber - 1) || '';

    const currentOutline = [
      `## 第 ${outline.number} 章：${outline.title}`,
      `摘要：${outline.summary}`,
      `关键事件：${outline.keyEvents.join('；')}`,
      `出场角色：${outline.charactersInvolved.join('、')}`,
      `章末悬念：${outline.endHook}`,
    ].join('\n');

    const parts: string[] = [
      '=== 世界观 ===',
      worldSummary,
      '',
      '=== 出场角色 ===',
      characterCards,
      '',
      '=== 前情摘要 ===',
      plotProgress,
    ];

    if (previousEnding) {
      parts.push('', '=== 上章结尾（请自然衔接） ===', previousEnding);
    }

    parts.push('', '=== 本章大纲 ===', currentOutline);

    return {
      worldSummary,
      characterCards,
      plotProgress,
      previousEnding,
      currentOutline,
      fullPrompt: parts.join('\n'),
    };
  }

  /**
   * 章节生成完成后，更新滚动摘要
   */
  async updateAfterChapter(chapterNumber: number, content: string) {
    // 1. 提取本章结尾段落
    const lines = content.trim().split('\n').filter(Boolean);
    const ending = lines.slice(-3).join('\n');
    this.chapterEndings.set(chapterNumber, ending);

    // 2. 用弱模型生成本章摘要
    const chapterSummary = await this.generateChapterSummary(chapterNumber, content);
    this.chapterSummaries.set(chapterNumber, chapterSummary);

    // 3. 压缩更新总摘要（滚动摘要的核心：压缩而非追加）
    this.plotSummary = await this.compressPlotSummary(chapterNumber, chapterSummary);
  }

  /**
   * 生成单章摘要（~300 字）
   */
  private async generateChapterSummary(chapterNumber: number, content: string): Promise<string> {
    const { text } = await callLLM(
      `请为以下章节内容写一段简要摘要（200-300字），重点记录：
1. 关键事件和情节推进
2. 角色的重要行为和态度变化
3. 新揭示的信息或线索

第 ${chapterNumber} 章内容：
${content}`,
      this.summaryConfig,
      '你是一个小说编辑助手，擅长提炼章节要点。输出纯文本摘要，不要用 markdown 格式。',
    );
    return text;
  }

  /**
   * 压缩总摘要 —— 将已有摘要 + 新章摘要合并压缩为一份更新的总摘要
   * 这样总摘要的长度始终可控，不会随章节增加无限膨胀
   */
  private async compressPlotSummary(chapterNumber: number, newChapterSummary: string): Promise<string> {
    if (!this.plotSummary) {
      // 第一章，直接用章节摘要作为总摘要
      return newChapterSummary;
    }

    const { text } = await callLLM(
      `已有的情节总摘要（截止到第 ${chapterNumber - 1} 章）：
${this.plotSummary}

第 ${chapterNumber} 章新摘要：
${newChapterSummary}

请将以上内容合并压缩为一份更新的情节总摘要（300-500字）。要求：
1. 保留所有重要的情节转折和角色发展
2. 压缩早期章节中不再重要的细节
3. 突出最近的事件和当前的故事走向
4. 保持时间线清晰`,
      this.summaryConfig,
      '你是一个小说编辑助手，擅长压缩和整理故事脉络。输出纯文本摘要，不要用 markdown 格式。',
    );
    return text;
  }

  private buildWorldSummary(): string {
    const w = this.state.worldBuilding;
    if (!w) return '（世界观未设定）';
    return [
      `时代：${w.era}`,
      `场景：${w.setting}`,
      `基调：${w.tone}`,
      `主题：${w.themes.join('、')}`,
      `规则：${w.rules.join('；')}`,
    ].join('\n');
  }

  private buildCharacterCards(involvedNames: string[]): string {
    const chars = this.state.characters.filter((c) =>
      involvedNames.some((name) => c.name.includes(name) || name.includes(c.name)),
    );

    if (chars.length === 0) {
      // fallback：如果匹配不上，至少给主角
      const protagonist = this.state.characters.find((c) => c.role === 'protagonist');
      if (protagonist) chars.push(protagonist);
    }

    return chars
      .map((c) => [
        `【${c.name}】（${c.role}）`,
        `描述：${c.description}`,
        `动机：${c.motivations.join('、')}`,
        `语言风格：${c.voiceNotes}`,
      ].join('\n'))
      .join('\n\n');
  }

  private findChapterOutline(chapterNumber: number): ChapterOutline | undefined {
    if (!this.state.plotOutline) return undefined;
    for (const act of this.state.plotOutline.acts) {
      const ch = act.chapters.find((c) => c.number === chapterNumber);
      if (ch) return ch;
    }
    return undefined;
  }
}
