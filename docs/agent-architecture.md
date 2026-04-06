# Agent 架构说明

## 概览

所有 LLM 调用通过 OpenRouter (`src/llm/client.ts`) 统一路由，使用 Vercel AI SDK (`ai` 库) 封装。

三种调用方式：
- `callLLMStructured()` — 结构化输出（Zod schema 约束），用于规划类 Agent
- `streamLLM()` — 流式文本输出，用于章节生成
- `callLLM()` — 普通文本输出，用于摘要等

## Agent 列表

| Agent | 文件 | 模型配置 | 调用方式 | 用途 |
|-------|------|----------|----------|------|
| Input Agent | `src/pipeline/agents/input-agent.ts` | `planning` | `callLLMStructured` | 分析用户创意输入，提取标题、类型、主题、语气、章节数、梗概等结构化信息 |
| Clarify Agent | `src/pipeline/agents/clarify-agent.ts` | `planning` | `callLLMStructured` | 根据初步分析结果，生成 1-3 个关键追问问题 |
| Refine Agent | `src/pipeline/agents/clarify-agent.ts` | `planning` | `callLLMStructured` | 根据用户对追问的回答，补充完善 InputAnalysis |
| World Agent | `src/pipeline/agents/world-agent.ts` | `planning` | `callLLMStructured` | 基于分析结果构建世界观设定（时代、场景、语气、规则、梗概） |
| Character Agent | `src/pipeline/agents/character-agent.ts` | `planning` | `callLLMStructured` | 设计 3-6 个核心角色及其关系（背景、动机、弧线、声音特征） |
| Outline Agent | `src/pipeline/agents/outline-agent.ts` | `planning` | `callLLMStructured` | 生成三幕式情节大纲，包含章节、关键事件、角色参与、章末悬念 |
| Chapter Agent | `src/pipeline/agents/chapter-agent.ts` | `writing` | `streamLLM` | 流式生成章节正文（1500-2500 字），支持实时推送到前端 |
| Context Manager | `src/pipeline/context-manager.ts` | `summary` | `callLLM` | 章节完成后生成摘要，压缩上下文窗口，维护全局情节摘要 |

## 模型配置

定义在 `src/server/routes/pipeline.ts` 的 `getModels()` 函数：

```typescript
{
  planning: { model: process.env.PLANNING_MODEL ?? 'google/gemini-2.0-flash-001', temperature: 0.7, maxTokens: 4000 },
  writing:  { model: process.env.WRITING_MODEL  ?? 'google/gemini-2.0-flash-001', temperature: 0.8, maxTokens: 4000 },
  summary:  { model: process.env.SUMMARY_MODEL  ?? 'google/gemini-2.0-flash-001', temperature: 0.3, maxTokens: 800  },
}
```

- **planning** — 用于所有规划类 Agent（input / clarify / refine / world / character / outline），温度 0.7，兼顾创意与一致性
- **writing** — 用于章节生成，温度 0.8，偏向更丰富的文学表达
- **summary** — 用于上下文摘要压缩，温度 0.3，偏向准确简洁

三个配置槽通过环境变量 `PLANNING_MODEL` / `WRITING_MODEL` / `SUMMARY_MODEL` 配置，硬编码默认值为 `google/gemini-2.0-flash-001`。

### 预设方案

| | 规划 (planning) | 正文 (writing) | 摘要 (summary) |
|---|---|---|---|
| **方案 1** | `anthropic/claude-sonnet-4.6` | `anthropic/claude-sonnet-4.6`（可换 `deepseek/deepseek-v3.2`） | `openai/gpt-4o-mini` |
| **方案 2** | `anthropic/claude-sonnet-4.6`（可换 `z-ai/glm-5`） | `z-ai/glm-5`（可换 `deepseek/deepseek-v3.2`） | `openai/gpt-4o-mini`（可换 `mistralai/mistral-small-creative`） |

在 `.env` 文件中切换方案：注释/取消注释对应行即可。

## 流水线流程

```
用户输入
  │
  ▼
Input Agent (planning)     ── 分析创意
  │
  ▼
Clarify Agent (planning)   ── 生成追问
  │
  ▼
[用户回答追问]
  │
  ▼
Refine Agent (planning)    ── 完善分析
  │
  ▼
World Agent (planning)     ── 构建世界观
  │
  ▼
[用户审阅世界观]           ── 可编辑/确认/驳回
  │
  ▼
Character Agent (planning) ── 设计角色
  │
  ▼
[用户审阅角色]             ── 可编辑/确认/驳回
  │
  ▼
Outline Agent (planning)   ── 生成大纲
  │
  ▼
[用户审阅大纲]             ── 可编辑/确认/驳回
  │
  ▼
Chapter Agent (writing)    ── 逐章流式生成
  + Context Manager (summary) ── 每章完成后摘要压缩
  │
  ▼
完成
```

每个审阅门控点用户都可以：编辑内容后确认、直接确认、或驳回重新生成。
章节生成过程中支持暂停（当前章完成后生效）和恢复。
