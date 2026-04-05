import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb, schema } from './index.js';
import type { PipelineState } from '../types/pipeline.js';
import type { Character, WorldBuilding, PlotOutline } from '../types/project.js';

const { projects, characters, chapters } = schema;

// ─── Project CRUD ───

export async function createProject(userPrompt: string, title = '未命名项目') {
  const db = getDb();
  const now = new Date().toISOString();
  const id = nanoid();

  await db.insert(projects).values({
    id,
    title,
    userPrompt,
    status: 'input',
    currentChapter: 0,
    createdAt: now,
    updatedAt: now,
  });

  return id;
}

export async function getProject(id: string) {
  const db = getDb();
  return db.select().from(projects).where(eq(projects.id, id)).get();
}

export async function listProjects() {
  const db = getDb();
  return db.select({
    id: projects.id,
    title: projects.title,
    status: projects.status,
    createdAt: projects.createdAt,
    updatedAt: projects.updatedAt,
  }).from(projects).all();
}

export async function deleteProject(id: string) {
  const db = getDb();
  await db.delete(chapters).where(eq(chapters.projectId, id));
  await db.delete(characters).where(eq(characters.projectId, id));
  await db.delete(projects).where(eq(projects.id, id));
}

// ─── Stage persistence ───

export async function saveInputAnalysis(projectId: string, title: string, analysis: unknown) {
  const db = getDb();
  await db.update(projects).set({
    title,
    inputAnalysis: analysis,
    status: 'clarifying',
    updatedAt: new Date().toISOString(),
  }).where(eq(projects.id, projectId));
}

export async function saveInputAnalysisData(projectId: string, title: string, analysis: unknown) {
  const db = getDb();
  await db.update(projects).set({
    title,
    inputAnalysis: analysis,
    updatedAt: new Date().toISOString(),
  }).where(eq(projects.id, projectId));
}

export async function saveClarification(projectId: string, questions: string[], answers?: string[]) {
  const db = getDb();
  await db.update(projects).set({
    clarifyQuestions: questions,
    ...(answers ? { clarifyAnswers: answers } : {}),
    updatedAt: new Date().toISOString(),
  }).where(eq(projects.id, projectId));
}

export async function saveWorldBuilding(projectId: string, world: WorldBuilding) {
  const db = getDb();
  await db.update(projects).set({
    worldBuilding: world,
    status: 'review_world',
    updatedAt: new Date().toISOString(),
  }).where(eq(projects.id, projectId));
}

export async function saveCharacters(projectId: string, chars: Character[]) {
  const db = getDb();
  await db.delete(characters).where(eq(characters.projectId, projectId));
  for (const c of chars) {
    await db.insert(characters).values({
      id: c.id,
      projectId,
      name: c.name,
      role: c.role,
      description: c.description,
      backstory: c.backstory,
      motivations: c.motivations,
      relationships: c.relationships,
      voiceNotes: c.voiceNotes,
      arc: c.arc,
    });
  }
  await db.update(projects).set({
    status: 'review_characters',
    updatedAt: new Date().toISOString(),
  }).where(eq(projects.id, projectId));
}

export async function savePlotOutline(projectId: string, outline: PlotOutline) {
  const db = getDb();
  await db.update(projects).set({
    plotOutline: outline,
    status: 'review_outline',
    updatedAt: new Date().toISOString(),
  }).where(eq(projects.id, projectId));
}

// ─── 仅保存数据（不更新状态，用于用户编辑） ───

export async function saveWorldBuildingData(projectId: string, world: WorldBuilding) {
  const db = getDb();
  await db.update(projects).set({
    worldBuilding: world,
    updatedAt: new Date().toISOString(),
  }).where(eq(projects.id, projectId));
}

export async function saveCharactersData(projectId: string, chars: Character[]) {
  const db = getDb();
  await db.delete(characters).where(eq(characters.projectId, projectId));
  for (const c of chars) {
    await db.insert(characters).values({
      id: c.id,
      projectId,
      name: c.name,
      role: c.role,
      description: c.description,
      backstory: c.backstory,
      motivations: c.motivations,
      relationships: c.relationships,
      voiceNotes: c.voiceNotes,
      arc: c.arc,
    });
  }
  await db.update(projects).set({
    updatedAt: new Date().toISOString(),
  }).where(eq(projects.id, projectId));
}

export async function savePlotOutlineData(projectId: string, outline: PlotOutline) {
  const db = getDb();
  await db.update(projects).set({
    plotOutline: outline,
    updatedAt: new Date().toISOString(),
  }).where(eq(projects.id, projectId));
}

export async function updateProjectStatus(projectId: string, status: string) {
  const db = getDb();
  await db.update(projects).set({
    status,
    updatedAt: new Date().toISOString(),
  }).where(eq(projects.id, projectId));
}

// ─── Chapter persistence ───

export async function saveChapter(
  projectId: string,
  chapter: { id: string; number: number; title: string; content: string; charCount: number; status: string },
  summary?: string,
  ending?: string,
) {
  const db = getDb();
  const existing = await db.select().from(chapters)
    .where(eq(chapters.id, chapter.id)).get();

  if (existing) {
    await db.update(chapters).set({
      content: chapter.content,
      charCount: chapter.charCount,
      status: chapter.status,
      summary,
      ending,
    }).where(eq(chapters.id, chapter.id));
  } else {
    await db.insert(chapters).values({
      id: chapter.id,
      projectId,
      number: chapter.number,
      title: chapter.title,
      content: chapter.content,
      charCount: chapter.charCount,
      status: chapter.status,
      summary,
      ending,
    });
  }

  await db.update(projects).set({
    currentChapter: chapter.number,
    updatedAt: new Date().toISOString(),
  }).where(eq(projects.id, projectId));
}

export async function savePlotSummary(projectId: string, summary: string) {
  const db = getDb();
  await db.update(projects).set({
    plotSummary: summary,
    updatedAt: new Date().toISOString(),
  }).where(eq(projects.id, projectId));
}

// ─── Load full state for resume ───

export async function loadPipelineState(projectId: string): Promise<PipelineState & {
  inputAnalysis?: unknown;
  plotSummary?: string;
  chapterSummaries: Map<number, string>;
  chapterEndings: Map<number, string>;
}> {
  const db = getDb();
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) throw new Error(`Project not found: ${projectId}`);

  const chars = await db.select().from(characters)
    .where(eq(characters.projectId, projectId)).all();

  const chaps = await db.select().from(chapters)
    .where(eq(chapters.projectId, projectId)).all();

  const chapterSummaries = new Map<number, string>();
  const chapterEndings = new Map<number, string>();
  for (const ch of chaps) {
    if (ch.summary) chapterSummaries.set(ch.number, ch.summary);
    if (ch.ending) chapterEndings.set(ch.number, ch.ending);
  }

  // 兼容旧数据：将 'review' 映射为 'review_outline'
  const status = project.status === 'review' ? 'review_outline' : project.status;

  return {
    projectId,
    status: status as PipelineState['status'],
    userPrompt: project.userPrompt,
    clarifyQuestions: (project.clarifyQuestions as string[] | null) ?? undefined,
    clarifyAnswers: (project.clarifyAnswers as string[] | null) ?? undefined,
    worldBuilding: project.worldBuilding as WorldBuilding | undefined,
    characters: chars.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role as Character['role'],
      description: c.description,
      backstory: c.backstory,
      motivations: c.motivations as string[],
      relationships: c.relationships as Character['relationships'],
      voiceNotes: c.voiceNotes,
      arc: c.arc,
    })),
    plotOutline: project.plotOutline as PlotOutline | undefined,
    chapters: chaps.map((c) => ({
      id: c.id,
      number: c.number,
      title: c.title,
      content: c.content,
      charCount: c.charCount,
      status: c.status as 'pending' | 'generating' | 'generated' | 'revised' | 'approved',
    })),
    currentChapter: project.currentChapter,
    inputAnalysis: project.inputAnalysis,
    plotSummary: project.plotSummary ?? undefined,
    chapterSummaries,
    chapterEndings,
  };
}
