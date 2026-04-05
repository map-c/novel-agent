import { nanoid } from 'nanoid';
import type { PipelineStatus, WorldBuilding, Character, PlotOutline } from '../types/project.js';
import type { PipelineState } from '../types/pipeline.js';
import type { LLMConfig } from '../types/llm.js';
import { PipelineStateMachine } from './state-machine.js';
import { runInputAgent, type InputAnalysis } from './agents/input-agent.js';
import { runWorldAgent } from './agents/world-agent.js';
import { runCharacterAgent } from './agents/character-agent.js';
import { runOutlineAgent } from './agents/outline-agent.js';
import { runChapterAgent } from './agents/chapter-agent.js';
import { runClarifyAgent, runRefineAgent } from './agents/clarify-agent.js';
import { ContextManager } from './context-manager.js';
import * as db from '../db/operations.js';

export interface PipelineCallbacks {
  onStageChange?: (stage: PipelineStatus) => void;
  onStageComplete?: (stage: PipelineStatus, data: unknown) => void;
  onReviewReady?: (state: PipelineState) => void;
  onChapterChunk?: (chapterNumber: number, chunk: string) => void;
  onChapterComplete?: (chapterNumber: number, content: string) => void;
  onClarifyQuestions?: (questions: string[]) => void;
  onError?: (error: Error) => void;
}

export interface PipelineModelConfig {
  planning: LLMConfig;
  writing: LLMConfig;
  summary: LLMConfig;
}

export class PipelineEngine {
  private sm: PipelineStateMachine;
  private state: PipelineState;
  private inputAnalysis?: InputAnalysis;
  private models: PipelineModelConfig;
  private callbacks: PipelineCallbacks;
  private persist: boolean;
  private _resumeData?: {
    plotSummary?: string;
    chapterSummaries: Map<number, string>;
    chapterEndings: Map<number, string>;
  };
  private pauseRequested = false;

  private constructor(
    state: PipelineState,
    models: PipelineModelConfig,
    callbacks: PipelineCallbacks,
    persist: boolean,
  ) {
    this.sm = new PipelineStateMachine(state.status);
    this.state = state;
    this.models = models;
    this.callbacks = callbacks;
    this.persist = persist;
  }

  /** 创建新流水线 */
  static async create(
    userPrompt: string,
    models: PipelineModelConfig,
    callbacks: PipelineCallbacks = {},
    options?: { persist?: boolean; projectId?: string },
  ) {
    const persist = options?.persist ?? false;
    let projectId: string;
    if (options?.projectId) {
      // 复用已有项目 ID（由 API 层预先创建）
      projectId = options.projectId;
    } else {
      projectId = persist ? await db.createProject(userPrompt) : nanoid();
    }

    const state: PipelineState = {
      projectId,
      status: 'input',
      userPrompt,
      characters: [],
      chapters: [],
      currentChapter: 0,
    };

    return new PipelineEngine(state, models, callbacks, persist);
  }

  /** 从数据库恢复中断的流水线 */
  static async resume(
    projectId: string,
    models: PipelineModelConfig,
    callbacks: PipelineCallbacks = {},
  ) {
    const saved = await db.loadPipelineState(projectId);
    const state: PipelineState = {
      projectId: saved.projectId,
      status: saved.status,
      userPrompt: saved.userPrompt,
      clarifyQuestions: saved.clarifyQuestions,
      clarifyAnswers: saved.clarifyAnswers,
      worldBuilding: saved.worldBuilding,
      characters: saved.characters,
      plotOutline: saved.plotOutline,
      chapters: saved.chapters,
      currentChapter: saved.currentChapter,
    };

    const engine = new PipelineEngine(state, models, callbacks, true);
    engine.inputAnalysis = saved.inputAnalysis as InputAnalysis | undefined;
    engine._resumeData = {
      plotSummary: saved.plotSummary,
      chapterSummaries: saved.chapterSummaries,
      chapterEndings: saved.chapterEndings,
    };
    return engine;
  }

  get currentState(): PipelineState {
    return { ...this.state };
  }

  /** 请求暂停（当前章节完成后生效） */
  requestPause() {
    this.pauseRequested = true;
  }

  /** 从暂停状态恢复生成 */
  async resumeGeneration() {
    if (this.sm.status !== 'paused') {
      throw new Error(`Cannot resume from "${this.sm.status}", expected "paused"`);
    }
    this.sm.transition('generating');
    this.state.status = 'generating';
    if (this.persist) await db.updateProjectStatus(this.state.projectId, 'generating');
    this.callbacks.onStageChange?.('generating');

    await this._runGeneration();
  }

  /** 直接执行章节生成（引擎已处于 generating 状态时使用） */
  async startGeneration() {
    if (this.sm.status !== 'generating') {
      throw new Error(`Cannot start generation from "${this.sm.status}", expected "generating"`);
    }
    this.callbacks.onStageChange?.('generating');

    await this._runGeneration();
  }

  private async _runGeneration() {
    try {
      await this.stageGenerating();
    } catch (err) {
      this.state.error = (err as Error).message;
      this.callbacks.onError?.(err as Error);
      return;
    }

    // 如果暂停了就不标记 complete
    if (this.sm.status === 'paused') return;

    this.sm.transition('complete');
    this.state.status = 'complete';
    if (this.persist) await db.updateProjectStatus(this.state.projectId, 'complete');
    this.callbacks.onStageComplete?.('generating', this.state.chapters);
  }

  async run() {
    while (!this.sm.isComplete) {
      if (this.sm.needsReview) {
        this.callbacks.onReviewReady?.(this.currentState);
        return;
      }

      const stage = this.sm.status;
      this.state.status = stage;
      this.callbacks.onStageChange?.(stage);

      try {
        await this.executeStage(stage);
      } catch (err) {
        this.state.error = (err as Error).message;
        this.callbacks.onError?.(err as Error);
        return;
      }

      this.sm.advance();
      this.state.status = this.sm.status;
    }
  }

  async approve(editedData?: unknown) {
    if (!this.sm.needsReview) {
      throw new Error(`Current stage "${this.sm.status}" does not require review`);
    }

    // 如果用户提供了编辑数据，先应用
    if (editedData) {
      await this.applyEdits(this.sm.status, editedData);
    }

    const wasOutlineReview = this.sm.status === 'review_outline';

    // 推进到下一个状态（transitions[0]）
    this.sm.advance();
    this.state.status = this.sm.status;
    if (this.persist) await db.updateProjectStatus(this.state.projectId, this.sm.status);
    this.callbacks.onStageChange?.(this.sm.status);

    if (wasOutlineReview) {
      // review_outline → generating：执行章节生成
      try {
        await this.stageGenerating();
      } catch (err) {
        this.state.error = (err as Error).message;
        this.callbacks.onError?.(err as Error);
        return;
      }

      this.sm.advance();
      this.state.status = this.sm.status;
      if (this.persist) await db.updateProjectStatus(this.state.projectId, 'complete');
      this.callbacks.onStageComplete?.('generating', this.state.chapters);
    } else {
      // review_world → character_design 或 review_characters → outline：继续流水线
      await this.run();
    }
  }

  async reject() {
    if (!this.sm.needsReview) {
      throw new Error(`Current stage "${this.sm.status}" does not require review`);
    }
    // 取 transitions 的第二个选项（回退目标）
    const regenTarget = this.sm.nextStates[1];
    if (!regenTarget) {
      throw new Error(`No regeneration target for stage "${this.sm.status}"`);
    }
    this.sm.transition(regenTarget);
    this.state.status = this.sm.status;
    if (this.persist) await db.updateProjectStatus(this.state.projectId, this.sm.status);
    await this.run();
  }

  private async applyEdits(reviewStage: PipelineStatus, data: unknown) {
    switch (reviewStage) {
      case 'review_world':
        this.state.worldBuilding = data as WorldBuilding;
        if (this.persist) await db.saveWorldBuildingData(this.state.projectId, data as WorldBuilding);
        break;
      case 'review_characters':
        this.state.characters = data as Character[];
        if (this.persist) await db.saveCharactersData(this.state.projectId, data as Character[]);
        break;
      case 'review_outline':
        this.state.plotOutline = data as PlotOutline;
        if (this.persist) await db.savePlotOutlineData(this.state.projectId, data as PlotOutline);
        break;
    }
  }

  private async executeStage(stage: PipelineStatus) {
    switch (stage) {
      case 'input':
        return this.stageInput();
      case 'world_building':
        return this.stageWorldBuilding();
      case 'character_design':
        return this.stageCharacterDesign();
      case 'outline':
        return this.stageOutline();
      case 'generating':
        return this.stageGenerating();
      default:
        break;
    }
  }

  private async stageInput() {
    const analysis = await runInputAgent(this.state.userPrompt!, this.models.planning);
    this.inputAnalysis = analysis;

    // 生成追问问题
    const questions = await runClarifyAgent(analysis, this.models.planning);
    this.state.clarifyQuestions = questions;

    if (this.persist) {
      await db.saveInputAnalysis(this.state.projectId, analysis.title, analysis);
      await db.saveClarification(this.state.projectId, questions);
    }
    this.callbacks.onStageComplete?.('input', analysis);
    this.callbacks.onClarifyQuestions?.(questions);
  }

  /** 提交追问回答，补充完善分析后继续流水线 */
  async submitClarification(answers: string[]) {
    if (this.sm.status !== 'clarifying') {
      throw new Error(`Cannot submit clarification in "${this.sm.status}" state`);
    }
    if (!this.inputAnalysis || !this.state.clarifyQuestions) {
      throw new Error('No clarify questions available');
    }

    this.state.clarifyAnswers = answers;
    const qa = this.state.clarifyQuestions.map((q, i) => ({ question: q, answer: answers[i] ?? '' }));
    const refined = await runRefineAgent(this.inputAnalysis, qa, this.models.planning);
    this.inputAnalysis = refined;

    if (this.persist) {
      await db.saveClarification(this.state.projectId, this.state.clarifyQuestions, answers);
      await db.saveInputAnalysis(this.state.projectId, refined.title, refined);
    }
    this.callbacks.onStageComplete?.('clarifying', refined);

    // 推进到 world_building
    this.sm.advance();
    this.state.status = this.sm.status;
    if (this.persist) await db.updateProjectStatus(this.state.projectId, this.sm.status);
    this.callbacks.onStageChange?.(this.sm.status);

    await this.run();
  }

  private async stageWorldBuilding() {
    if (!this.inputAnalysis) throw new Error('Input analysis not available');
    const world = await runWorldAgent(this.inputAnalysis, this.models.planning);
    this.state.worldBuilding = world;
    if (this.persist) await db.saveWorldBuilding(this.state.projectId, world);
    this.callbacks.onStageComplete?.('world_building', world);
  }

  private async stageCharacterDesign() {
    if (!this.inputAnalysis || !this.state.worldBuilding) {
      throw new Error('Previous stages not complete');
    }
    const result = await runCharacterAgent(this.inputAnalysis, this.state.worldBuilding, this.models.planning);

    this.state.characters = result.characters.map((c) => ({
      id: nanoid(),
      name: c.name,
      role: c.role,
      description: c.description,
      backstory: c.backstory,
      motivations: c.motivations,
      relationships: [],
      voiceNotes: c.voiceNotes,
      arc: c.arc,
    }));

    const nameToId = new Map(this.state.characters.map((c) => [c.name, c.id]));
    for (const rel of result.relationships) {
      const fromChar = this.state.characters.find((c) => c.name === rel.from);
      const toId = nameToId.get(rel.to);
      if (fromChar && toId) {
        fromChar.relationships.push({
          targetCharacterId: toId,
          type: rel.type,
          description: rel.description,
        });
      }
    }

    if (this.persist) await db.saveCharacters(this.state.projectId, this.state.characters);
    this.callbacks.onStageComplete?.('character_design', this.state.characters);
  }

  private async stageOutline() {
    if (!this.inputAnalysis || !this.state.worldBuilding || this.state.characters.length === 0) {
      throw new Error('Previous stages not complete');
    }

    const charDesign = {
      characters: this.state.characters.map((c) => ({
        name: c.name,
        role: c.role,
        description: c.description,
        backstory: c.backstory,
        motivations: c.motivations,
        voiceNotes: c.voiceNotes,
        arc: c.arc,
      })),
      relationships: this.state.characters.flatMap((c) =>
        c.relationships.map((r) => ({
          from: c.name,
          to: this.state.characters.find((ch) => ch.id === r.targetCharacterId)?.name ?? '',
          type: r.type,
          description: r.description,
        })),
      ),
    };

    const outline = await runOutlineAgent(this.inputAnalysis, this.state.worldBuilding, charDesign, this.models.planning);
    this.state.plotOutline = outline;
    if (this.persist) await db.savePlotOutline(this.state.projectId, outline);
    this.callbacks.onStageComplete?.('outline', outline);
  }

  private async stageGenerating() {
    if (!this.state.plotOutline) throw new Error('Plot outline not available');

    const ctxManager = new ContextManager(this.state, this.models.writing, this.models.summary);
    const totalChapters = this.state.plotOutline.totalChapters;

    if (this._resumeData) {
      ctxManager.restore(this._resumeData);
      this._resumeData = undefined;
    }

    const startFrom = this.state.chapters.length + 1;

    for (let i = startFrom; i <= totalChapters; i++) {
      this.state.currentChapter = i;

      const context = ctxManager.buildChapterContext(i);

      const content = await runChapterAgent(context, this.models.writing, (chunk) => {
        this.callbacks.onChapterChunk?.(i, chunk);
      });

      const chapter = {
        id: nanoid(),
        number: i,
        title: this.getChapterTitle(i),
        content,
        charCount: content.length,
        status: 'generated' as const,
      };
      this.state.chapters.push(chapter);

      await ctxManager.updateAfterChapter(i, content);

      if (this.persist) {
        const meta = ctxManager.getChapterMeta(i);
        await db.saveChapter(this.state.projectId, chapter, meta.summary, meta.ending);
        await db.savePlotSummary(this.state.projectId, ctxManager.getPlotSummary());
      }

      this.callbacks.onChapterComplete?.(i, content);

      // 检查暂停请求（最后一章不需要暂停）
      if (this.pauseRequested && i < totalChapters) {
        this.pauseRequested = false;
        this.sm.transition('paused');
        this.state.status = 'paused';
        if (this.persist) await db.updateProjectStatus(this.state.projectId, 'paused');
        this.callbacks.onStageChange?.('paused');
        return;
      }
    }
  }

  private getChapterTitle(chapterNumber: number): string {
    if (!this.state.plotOutline) return `第 ${chapterNumber} 章`;
    for (const act of this.state.plotOutline.acts) {
      const ch = act.chapters.find((c) => c.number === chapterNumber);
      if (ch) return ch.title;
    }
    return `第 ${chapterNumber} 章`;
  }
}
