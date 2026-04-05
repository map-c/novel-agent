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
