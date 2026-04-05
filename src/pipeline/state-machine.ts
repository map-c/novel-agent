import type { PipelineStatus } from '../types/project.js';

/**
 * 状态转换定义
 * 每个状态列出它可以转移到的下一个状态
 */
const transitions: Record<PipelineStatus, PipelineStatus[]> = {
  input:             ['clarifying'],
  clarifying:        ['world_building'],
  world_building:    ['review_world'],
  review_world:      ['character_design', 'world_building'],   // 通过 → character_design，驳回 → 重新生成
  character_design:  ['review_characters'],
  review_characters: ['outline', 'character_design'],          // 通过 → outline，驳回 → 重新生成
  outline:           ['review_outline'],
  review_outline:    ['generating', 'outline'],                // 通过 → generating，驳回 → 重新生成
  generating:        ['paused', 'complete'],
  paused:            ['generating'],
  complete:          [],
};

/** 需要暂停等待人工确认的状态 */
const REVIEW_GATES: Set<PipelineStatus> = new Set([
  'clarifying',
  'review_world',
  'review_characters',
  'review_outline',
]);

export class PipelineStateMachine {
  private _status: PipelineStatus;

  constructor(initial: PipelineStatus = 'input') {
    this._status = initial;
  }

  get status() {
    return this._status;
  }

  /** 是否处于需要人工审阅的状态 */
  get needsReview() {
    return REVIEW_GATES.has(this._status);
  }

  /** 是否已完成 */
  get isComplete() {
    return this._status === 'complete';
  }

  /** 获取当前状态可转移到的状态列表 */
  get nextStates() {
    return transitions[this._status];
  }

  /** 转移到下一个状态 */
  transition(to: PipelineStatus) {
    const allowed = transitions[this._status];
    if (!allowed.includes(to)) {
      throw new Error(`Invalid transition: ${this._status} → ${to}. Allowed: ${allowed.join(', ')}`);
    }
    this._status = to;
  }

  /** 前进到下一个自动状态（非 review 分支时取第一个） */
  advance() {
    const next = transitions[this._status][0];
    if (!next) {
      throw new Error(`Cannot advance from ${this._status}: no next state`);
    }
    this.transition(next);
  }
}
