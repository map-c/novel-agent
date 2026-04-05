import type { PipelineStatus, WorldBuilding, Character, PlotOutline, Chapter } from './project.js';

export interface PipelineState {
  projectId: string;
  status: PipelineStatus;
  userPrompt?: string;
  worldBuilding?: WorldBuilding;
  characters: Character[];
  plotOutline?: PlotOutline;
  chapters: Chapter[];
  currentChapter: number;
  error?: string;
}

export type SSEEvent =
  | { type: 'stage_changed'; stage: PipelineStatus }
  | { type: 'chunk'; chapterNumber: number; text: string }
  | { type: 'chapter_complete'; chapterNumber: number }
  | { type: 'review_ready'; stage: string; data: unknown }
  | { type: 'error'; message: string }
  | { type: 'complete' };
