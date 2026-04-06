const BASE = '/api';

export interface ProjectSummary {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDetail {
  projectId: string;
  status: string;
  userPrompt?: string;
  worldBuilding?: {
    era: string;
    setting: string;
    tone: string;
    themes: string[];
    rules: string[];
    synopsis: string;
  };
  characters: {
    id: string;
    name: string;
    role: string;
    description: string;
    backstory: string;
    motivations: string[];
    relationships: {
      targetCharacterId: string;
      type: string;
      description: string;
    }[];
    voiceNotes: string;
    arc: string;
  }[];
  plotOutline?: {
    premise: string;
    totalChapters: number;
    acts: {
      number: number;
      title: string;
      summary: string;
      chapters: {
        number: number;
        title: string;
        summary: string;
        keyEvents: string[];
        charactersInvolved: string[];
        endHook: string;
      }[];
    }[];
  };
  chapters: {
    id: string;
    number: number;
    title: string;
    content: string;
    charCount: number;
    status: string;
  }[];
  currentChapter: number;
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function listProjects(): Promise<ProjectSummary[]> {
  return fetchJSON(`${BASE}/projects`);
}

export async function createProject(prompt: string): Promise<{ id: string }> {
  return fetchJSON(`${BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
}

export async function getProject(id: string): Promise<ProjectDetail> {
  return fetchJSON(`${BASE}/projects/${id}`);
}

export async function deleteProject(id: string): Promise<void> {
  const res = await fetch(`${BASE}/projects/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
}

export function getExportUrl(id: string): string {
  return `${BASE}/projects/${id}/export`;
}

export async function approveStage(id: string, editedData?: unknown): Promise<{ ok: boolean; nextStatus: string }> {
  return fetchJSON(`${BASE}/projects/${id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(editedData ? { editedData } : {}),
  });
}

export async function rejectStage(id: string): Promise<{ ok: boolean; regenTarget: string }> {
  return fetchJSON(`${BASE}/projects/${id}/reject`, { method: 'POST' });
}

export async function pauseGeneration(id: string): Promise<{ ok: boolean }> {
  return fetchJSON(`${BASE}/projects/${id}/pause`, { method: 'POST' });
}

export async function submitClarification(id: string, answers: string[]): Promise<{ ok: boolean; nextStatus: string }> {
  return fetchJSON(`${BASE}/projects/${id}/clarify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  });
}

// ─── Settings API ───

export interface PromptInfo {
  value: string;
  isDefault: boolean;
  label: string;
  defaultValue: string;
}

export interface ModelInfo {
  config: { model: string; temperature?: number; maxTokens?: number };
  isDefault: boolean;
  defaultConfig: { model: string; temperature?: number; maxTokens?: number };
}

export interface PresetInfo {
  label: string;
  description: string;
  models: Record<string, { model: string; temperature?: number; maxTokens?: number }>;
}

export async function getPrompts(): Promise<Record<string, PromptInfo>> {
  return fetchJSON(`${BASE}/settings/prompts`);
}

export async function updatePrompt(key: string, value: string): Promise<void> {
  await fetchJSON(`${BASE}/settings/prompts/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });
}

export async function resetPrompt(key: string): Promise<{ ok: boolean; defaultValue: string }> {
  return fetchJSON(`${BASE}/settings/prompts/${key}`, { method: 'DELETE' });
}

export async function getModelsConfig(): Promise<Record<string, ModelInfo>> {
  return fetchJSON(`${BASE}/settings/models`);
}

export async function updateModelConfig(tier: string, config: { model: string; temperature?: number; maxTokens?: number }): Promise<void> {
  await fetchJSON(`${BASE}/settings/models/${tier}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
}

export async function resetModelConfig(tier: string): Promise<void> {
  await fetchJSON(`${BASE}/settings/models/${tier}`, { method: 'DELETE' });
}

export async function getPresets(): Promise<Record<string, PresetInfo>> {
  return fetchJSON(`${BASE}/settings/presets`);
}

export async function applyPreset(name: string): Promise<void> {
  await fetchJSON(`${BASE}/settings/presets/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

// ─── Usage & Feedback API ───

export interface UsageSummary {
  stages: {
    stage: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    calls: number;
  }[];
  total: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    calls: number;
  };
}

export interface FeedbackRecord {
  id: string;
  projectId: string;
  targetType: string;
  targetId: string;
  rating: string;
  createdAt: string;
}

export async function getUsage(id: string): Promise<UsageSummary> {
  return fetchJSON(`${BASE}/projects/${id}/usage`);
}

export async function getFeedback(id: string): Promise<FeedbackRecord[]> {
  return fetchJSON(`${BASE}/projects/${id}/feedback`);
}

export async function submitFeedback(
  id: string,
  targetType: string,
  targetId: string,
  rating: 'satisfied' | 'unsatisfied',
): Promise<void> {
  await fetchJSON(`${BASE}/projects/${id}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetType, targetId, rating }),
  });
}
