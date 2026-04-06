# Agent 架构说明

## 概览

所有 LLM 调用通过 OpenRouter (`src/llm/client.ts`) 统一路由，使用 Vercel AI SDK (`ai` 库) 封装。

四种调用方式：
- `callLLMStructured()` — 结构化输出（Zod schema 约束），用于规划类 Agent
- `streamLLMStructured()` — 流式结构化输出，用于角色和大纲 Agent
- `streamLLM()` — 流式文本输出，用于章节生成
- `callLLM()` — 普通文本输出，用于摘要等

## Agent 列表

| Agent | 文件 | 模型配置 | 调用方式 | 用途 |
|-------|------|----------|----------|------|
| Input Agent | `src/pipeline/agents/input-agent.ts` | `planning` | `callLLMStructured` | 分析用户创意输入，提取标题、类型、主题、语气、章节数、梗概等结构化信息 |
| Clarify Agent | `src/pipeline/agents/clarify-agent.ts` | `planning` | `callLLMStructured` | 根据初步分析结果，生成 1-3 个关键追问问题 |
| Refine Agent | `src/pipeline/agents/clarify-agent.ts` | `planning` | `callLLMStructured` | 根据用户对追问的回答，补充完善 InputAnalysis |
| World Agent | `src/pipeline/agents/world-agent.ts` | `planning` | `callLLMStructured` | 基于分析结果构建世界观设定（时代、场景、语气、规则、梗概） |
| Character Agent | `src/pipeline/agents/character-agent.ts` | `planning` | `streamLLMStructured` | 设计 3-6 个核心角色及其关系（背景、动机、弧线、声音特征） |
| Outline Agent | `src/pipeline/agents/outline-agent.ts` | `planning` | `streamLLMStructured` | 生成三幕式情节大纲，包含章节、关键事件、角色参与、章末悬念 |
| Chapter Agent | `src/pipeline/agents/chapter-agent.ts` | `writing` | `streamLLM` | 流式生成章节正文（1500-2500 字），支持实时推送到前端 |
| Context Manager | `src/pipeline/context-manager.ts` | `summary` | `callLLM` | 章节完成后生成摘要，压缩上下文窗口，维护全局情节摘要 |
| Inspiration | `src/server/routes/inspiration.ts` | `planning` | `callLLMStructured` | 生成 3 个风格各异的小说创意（首页灵感功能） |

## Agent 参数模式

所有 Agent 函数遵循统一的参数模式：

```typescript
async function runXxxAgent(
  // 必需参数：输入数据 + LLM 配置
  input: ...,
  config: LLMConfig,
  // 可选参数：
  onChunk?: (chunk: string) => void,    // 流式输出回调（仅流式 Agent）
  systemPrompt?: string,                // 系统提示词覆盖（来自配置中心）
  onUsage?: (usage: TokenUsage) => void, // Token 用量回调
): Promise<Result>
```

- **Agent 是纯函数**：不直接访问数据库或配置，所有依赖通过参数注入
- **onUsage 回调**：引擎在调用 Agent 时传入，用于记录每次 LLM 调用的 Token 消耗
- **systemPrompt 覆盖**：引擎启动时从配置中心（DB → 默认值）加载所有提示词，传递给 Agent

## 模型配置

配置优先级：**数据库 → 环境变量 → 代码默认值**

- 数据库配置通过 Settings 页面管理（`src/db/settings.ts`）
- 环境变量：`PLANNING_MODEL` / `WRITING_MODEL` / `SUMMARY_MODEL`
- 默认值定义在 `src/config/defaults.ts`

三个模型层级：

| 层级 | 用途 | 默认温度 | 默认 Token |
|------|------|----------|-----------|
| `planning` | 输入分析、追问、世界观、角色、大纲、灵感 | 0.7 | 4000 |
| `writing` | 章节正文生成 | 0.8 | 4000 |
| `summary` | 章节摘要、上下文压缩 | 0.3 | 800 |

### 内置预设

| 预设 | planning temp | writing temp | 适用场景 |
|------|---------------|--------------|----------|
| 创意模式 | 0.9 | 1.0 | 探索性、天马行空的写作 |
| 精确模式 | 0.4 | 0.5 | 逻辑严密、结构清晰的故事 |
| 均衡模式 | 0.7 | 0.8 | 默认，兼顾创意与稳定性 |

## Token 用量追踪

每次 LLM 调用的 Token 消耗通过 `onUsage` 回调链传递：

```
Agent (onUsage) → PipelineEngine (usageHandler) → PipelineCallbacks (onUsage)
  → SSE 推送 usage 事件到前端
  → 持久化到 token_usage 表
```

用量数据可通过：
- `GET /api/projects/:id/usage` 按项目查询
- Settings 页面「用量统计」Tab 全局汇总

## 流水线流程

```
用户输入 / AI 灵感
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
[用户审阅世界观]           ── 可编辑/确认/驳回 + 反馈
  │
  ▼
Character Agent (planning) ── 设计角色
  │
  ▼
[用户审阅角色]             ── 可编辑/确认/驳回 + 反馈
  │
  ▼
Outline Agent (planning)   ── 生成大纲
  │
  ▼
[用户审阅大纲]             ── 可编辑/确认/驳回 + 反馈
  │
  ▼
Chapter Agent (writing)    ── 逐章流式生成（可暂停/恢复）
  + Context Manager (summary) ── 每章完成后摘要压缩
  │
  ▼
完成                       ── 阅读 + 逐章反馈 + Token 用量查看
```

每个审阅门控点用户都可以：编辑内容后确认、直接确认、或驳回重新生成（驳回需二次确认）。
章节生成过程中支持暂停（当前章完成后生效）和恢复。
