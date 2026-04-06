import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  userPrompt: text('user_prompt').notNull(),
  inputMode: text('input_mode').notNull().default('freeform'),
  status: text('status').notNull().default('input'),
  /** 世界观 JSON */
  worldBuilding: text('world_building', { mode: 'json' }),
  /** 大纲 JSON */
  plotOutline: text('plot_outline', { mode: 'json' }),
  /** 输入分析结果 JSON（中间状态，用于恢复） */
  inputAnalysis: text('input_analysis', { mode: 'json' }),
  /** 追问问题 JSON */
  clarifyQuestions: text('clarify_questions', { mode: 'json' }),
  /** 追问回答 JSON */
  clarifyAnswers: text('clarify_answers', { mode: 'json' }),
  /** 滚动摘要文本 */
  plotSummary: text('plot_summary'),
  /** 当前正在生成的章节号 */
  currentChapter: integer('current_chapter').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const characters = sqliteTable('characters', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  name: text('name').notNull(),
  role: text('role').notNull(),
  description: text('description').notNull(),
  backstory: text('backstory').notNull(),
  /** JSON array of strings */
  motivations: text('motivations', { mode: 'json' }).notNull(),
  /** JSON array of relationship objects */
  relationships: text('relationships', { mode: 'json' }).notNull(),
  voiceNotes: text('voice_notes').notNull(),
  arc: text('arc').notNull(),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const tokenUsage = sqliteTable('token_usage', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  stage: text('stage').notNull(),
  model: text('model').notNull(),
  promptTokens: integer('prompt_tokens').notNull().default(0),
  completionTokens: integer('completion_tokens').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

export const feedback = sqliteTable('feedback', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull().default(''),
  rating: text('rating').notNull(),
  createdAt: text('created_at').notNull(),
});

export const chapters = sqliteTable('chapters', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull().default(''),
  charCount: integer('char_count').notNull().default(0),
  status: text('status').notNull().default('pending'),
  /** 本章摘要，用于恢复 ContextManager */
  summary: text('summary'),
  /** 本章结尾段落，用于恢复 ContextManager */
  ending: text('ending'),
});
