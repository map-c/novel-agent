export type InputMode = 'freeform' | 'synopsis';

export type PipelineStatus =
  | 'input'
  | 'world_building'
  | 'character_design'
  | 'outline'
  | 'review'
  | 'generating'
  | 'complete';

export interface Project {
  id: string;
  title: string;
  inputMode: InputMode;
  userPrompt: string;
  referenceSynopsis?: string;
  status: PipelineStatus;
  worldBuilding?: WorldBuilding;
  characters: Character[];
  plotOutline?: PlotOutline;
  chapters: Chapter[];
  llmProvider: string;
  llmModel: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorldBuilding {
  era: string;
  setting: string;
  tone: string;
  themes: string[];
  rules: string[];
  synopsis: string;
}

export interface Character {
  id: string;
  name: string;
  role: 'protagonist' | 'antagonist' | 'supporting' | 'minor';
  description: string;
  backstory: string;
  motivations: string[];
  relationships: CharacterRelationship[];
  voiceNotes: string;
  arc: string;
}

export interface CharacterRelationship {
  targetCharacterId: string;
  type: string;
  description: string;
}

export interface PlotOutline {
  premise: string;
  totalChapters: number;
  acts: Act[];
}

export interface Act {
  number: number;
  title: string;
  summary: string;
  chapters: ChapterOutline[];
}

export interface ChapterOutline {
  number: number;
  title: string;
  summary: string;
  keyEvents: string[];
  charactersInvolved: string[];
  endHook: string;
}

export interface Chapter {
  id: string;
  number: number;
  title: string;
  content: string;
  charCount: number;
  status: 'pending' | 'generating' | 'generated' | 'revised' | 'approved';
}
