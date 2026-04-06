# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (run both backend + frontend concurrently)
pnpm dev:all

# Backend only (tsx watch, port 3000)
pnpm dev

# Frontend only (Vite, port 5173, proxies /api → localhost:3000)
pnpm dev:web

# Type check
npx tsc --noEmit            # backend
cd web && npx tsc --noEmit  # frontend

# Lint (frontend only)
pnpm --filter web lint

# Build
pnpm build       # backend (tsc → dist/)
pnpm build:web   # frontend (vite build)
```

No test framework is configured. Ad-hoc test scripts exist under `src/*/test.ts` and can be run with `npx tsx src/pipeline/test.ts`.

## Architecture

This is an AI novel generation agent — a pnpm monorepo with a TypeScript backend (Hono) and React 19 frontend (Vite + Tailwind CSS 4).

### Pipeline State Machine

The core of the system is a linear state machine (`src/pipeline/state-machine.ts`) with human-in-the-loop review gates:

```
input → clarifying → world_building → review_world → character_design →
review_characters → outline → review_outline → generating ⇄ paused → complete
```

`review_*` states pause for human approval. Users can approve (with optional edits), reject (regenerate), or answer clarifying questions. The `PipelineEngine` (`src/pipeline/engine.ts`) orchestrates this: it calls agents, persists state to DB, and emits SSE events.

### Agent Pattern

Each pipeline stage has a dedicated agent function (`src/pipeline/agents/*.ts`) that:
- Receives a `LLMConfig` (model, temperature, maxTokens), an optional `systemPrompt` override, and an optional `onUsage` callback for token tracking
- Uses Vercel AI SDK (`ai` package) via the wrapper in `src/llm/index.ts`
- Returns structured output (Zod schemas) or streamed text

A separate generic agent loop exists in `src/agent/loop.ts` for tool-using agents (not used in the main pipeline).

### Configuration System

Three-layer config priority: **Database → Environment Variables → Hardcoded Defaults**

- `src/config/defaults.ts` — all default prompts, model configs, and presets
- `src/config/index.ts` — loader functions (`getPrompt()`, `getModelConfig()`) that check DB first
- `src/db/settings.ts` — KV table CRUD (keys prefixed `prompt:` or `models:`)
- Env vars: `OPENROUTER_API_KEY` (required), `PLANNING_MODEL`, `WRITING_MODEL`, `SUMMARY_MODEL` (optional)

Three model tiers: `planning` (analysis/outline), `writing` (chapter generation), `summary` (compression). The engine loads all config once at creation time and passes prompts to agents as parameters — agents have no DB dependency.

### Token Usage & Feedback

- Each agent reports token consumption via `onUsage` callback → persisted to `token_usage` table and streamed as SSE `usage` events
- Users can rate generation results (satisfied/unsatisfied) at review stages and per chapter → stored in `feedback` table with upsert semantics
- Stats dashboard in Settings aggregates usage and feedback across all projects
- DB operations: `src/db/usage.ts`, `src/db/feedback.ts`

### LLM Integration

All LLM calls route through OpenRouter (`src/llm/client.ts`) using `@ai-sdk/openai` with a custom baseURL. Four call patterns in `src/llm/index.ts`: `callLLM` (text), `callLLMStructured` (Zod schema → typed object), `streamLLM` (streaming text), `streamLLMStructured` (streaming structured).

### SSE Streaming

Backend uses Hono's `streamSSE` to push real-time events to the frontend. Key events: `stage_changed`, `stage_chunk`, `chunk`, `chapter_complete`, `review_ready`, `clarify_questions`, `usage`, `complete`, `error`. Frontend consumes via `useSSE` hook (`web/src/hooks/useSSE.ts`) with auto-retry, exponential backoff, and retry exhaustion detection.

### Database

SQLite via LibSQL + Drizzle ORM. Tables: `projects`, `characters`, `chapters`, `settings`, `token_usage`, `feedback`. Schema in `src/db/schema.ts`, auto-created on first `getDb()` call (`src/db/index.ts`). The DB file is `novel-agent.db` in the project root.

### Frontend Routes

- `/` — Home (project list, create with AI inspiration)
- `/project/:id` — Project detail with streaming pipeline UI, feedback buttons, token usage panel
- `/settings` — Settings page (model config, prompt management, generation presets, usage stats dashboard)

## Key Conventions

- ESM throughout (`"type": "module"` in package.json), all local imports use `.js` extension
- Chinese language for all user-facing prompts, UI text, and git commit messages
- Agents are pure functions — they receive config as parameters, never access DB directly
- Pipeline state is persisted after each stage, enabling resume from interruption
