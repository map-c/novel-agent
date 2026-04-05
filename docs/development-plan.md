# 开发计划

## 目标

构建一个小说生成 Agent，通过实践深入理解：Agent 循环、多 Agent 编排、上下文管理、LLM 调用。

---

## Phase 0：项目初始化 ✅

**目标：** 搭好项目骨架，能跑起来。

- [x] pnpm monorepo 初始化
- [x] TypeScript 配置（tsconfig base + 各包继承）
- [x] 核心类型定义（Project, Character, Chapter, PlotOutline, PipelineStatus）
- [x] Hono 最小启动，health check 接口
- [x] Vite + React 最小启动
- [x] 验证：`pnpm dev:all` 前后端都能跑起来

---

## Phase 1：LLM 调用层 ✅

**目标：** 理解 Vercel AI SDK 的统一抽象，能调通 LLM。

- [x] 安装 `ai`、`@ai-sdk/openai`
- [x] 实现 LLM 调用封装（`src/llm/`）
  - `callLLM()` —— 普通文本生成
  - `callLLMStructured()` —— 结构化输出（Zod schema）
  - `streamLLM()` —— 流式文本生成
- [x] 通过 OpenRouter 统一调用所有模型
- [x] 配置管理（`.env` 读 API Key）

**学习重点：** Vercel AI SDK 的 `generateText`、`generateObject`、`streamText` 三个核心 API。

---

## Phase 2：单 Agent 循环 ✅

**目标：** 自己实现 Agent 循环，理解 Agent 的核心机制。

- [x] 实现 Agent 循环核心（`src/agent/loop.ts`）
- [x] 定义 Tool 接口（`src/agent/tool.ts`）
- [x] LLM → 工具调用 → 结果喂回 → 继续循环

**学习重点：** Agent 就是一个 while 循环 + 工具调用，LLM 是"决策者"。

---

## Phase 3：多 Agent 编排 —— Pipeline Engine ✅

**目标：** 实现多 Agent 协作的流水线，理解 Agent 之间怎么传递状态。

- [x] 实现状态机（`src/pipeline/state-machine.ts`）
- [x] 实现 Pipeline Engine（`src/pipeline/engine.ts`）
- [x] 实现各阶段 Agent（`src/pipeline/agents/`）：
  - [x] 输入分析 Agent（`input-agent.ts`）
  - [x] 追问引导 Agent（`clarify-agent.ts`）
  - [x] 世界观 Agent（`world-agent.ts`）
  - [x] 角色设计 Agent（`character-agent.ts`）
  - [x] 大纲 Agent（`outline-agent.ts`）
- [x] 实现多阶段审阅门控（世界观/角色/大纲各自独立确认）

**当前状态流程：**
```
input → clarifying → world_building → review_world
  → character_design → review_characters
  → outline → review_outline
  → generating ⇄ paused → complete
```

**学习重点：** Agent 之间的数据流设计、状态机驱动的流程控制、结构化输出的 schema 设计。

---

## Phase 4：章节生成 + 上下文管理 ✅

**目标：** 实现逐章生成，解决跨章节上下文管理这个核心难题。

- [x] 实现 ContextManager（`src/pipeline/context-manager.ts`）
  - `buildChapterContext()` —— 组装上下文（世界观 + 出场角色卡 + 滚动摘要 + 上章结尾 + 当前章大纲）
  - `updateAfterChapter()` —— 章节完成后更新摘要
- [x] 实现章节生成 Agent（`chapter-agent.ts`），流式输出
- [x] 实现"滚动摘要"机制（压缩而非追加，始终 ≤500 字）
- [x] 实现分级模型调用（正文用强模型，摘要用弱模型）

**学习重点：** 如何在有限的上下文窗口内维护长篇叙事的一致性。

---

## Phase 5：数据持久化 ✅

**目标：** 把生成过程和结果存下来，支持中断恢复。

- [x] SQLite + Drizzle ORM 集成（`src/db/`）
- [x] 数据表：projects, characters, chapters
- [x] 每个阶段完成后持久化状态
- [x] 中断恢复：`PipelineEngine.resume()` 从断点继续
- [x] 自动迁移（新增 clarify_questions / clarify_answers 列）

---

## Phase 6：后端 API ✅

**目标：** 用 Hono 暴露流水线能力，为前端提供接口。

- [x] 项目 CRUD 接口（POST/GET/DELETE `/projects`）
- [x] 流水线控制接口
  - GET `/projects/:id/stream` —— SSE 推送（运行到下一个审阅门控）
  - GET `/projects/:id/stream/generate` —— SSE 推送章节生成
  - POST `/projects/:id/approve` —— 审阅通过（支持 editedData）
  - POST `/projects/:id/reject` —— 驳回重新生成
  - POST `/projects/:id/clarify` —— 提交追问回答
  - POST `/projects/:id/pause` —— 暂停章节生成
- [x] SSE 事件类型：stage_changed, chunk, chapter_complete, review_ready, clarify_questions, error, complete
- [x] 导出接口（GET `/projects/:id/export`）

---

## Phase 7：前端 Web ✅

**目标：** 做一个够用的界面，能可视化整个 Agent 工作过程。

- [x] 首页：项目列表 + 新建项目
- [x] 项目工作台
  - 进度条：11 阶段可视化
  - 追问阶段：ClarifyView（展示问题 + 文本输入）
  - 审阅阶段：预览 + 编辑模式切换（WorldEditor / CharacterEditor / OutlineEditor）
  - 生成阶段：流式文本预览 + 暂停按钮
  - 暂停阶段：PausedView（已完成章节列表 + 继续按钮）
  - 完成阶段：章节导航 + 阅读视图 + Markdown 导出
- [x] SSE 对接：useSSE hook
- [ ] 设置页：配置 LLM 提供商和 API Key（未实现）

---

## Phase 8：提示词优化与质量调优 ⬜

**目标：** 在流程跑通的基础上，优化各阶段提示词，提升生成质量。

- [ ] 优化各阶段 system prompt（风格锚点、角色语言、情节松紧度）
- [ ] 加入章节长度控制逻辑（过短续写、过长截断）
- [ ] 加入简单的一致性检查（角色名正则匹配、字数统计）
- [ ] 实现"参考简介"模式的主题种子提取
- [ ] 实际生成 2-3 篇不同体裁的小说，根据效果迭代 prompt

---

## 各 Phase 的依赖关系

```
Phase 0 (项目初始化)       ✅
   ↓
Phase 1 (LLM 调用层)       ✅
   ↓
Phase 2 (单 Agent 循环)     ✅
   ↓
Phase 3 (多 Agent 编排)     ✅
   ↓
Phase 4 (章节生成+上下文)   ✅
   ↓
Phase 5 (数据持久化)        ✅
   ↓
Phase 6 (后端 API)          ✅
   ↓
Phase 7 (前端 Web)          ✅
   ↓
Phase 8 (提示词优化)        ⬜
```

Phase 1-4 是核心学习路径。Phase 5-7 是工程包装。Phase 8 是持续迭代。

---

## 用户介入点（已实现）

在 Phase 3-7 基础上增加了 4 个用户介入点，详见 `docs/user-intervention-plan.md`：

1. **分阶段独立确认** —— 世界观/角色/大纲各自独立审阅
2. **审阅阶段可编辑** —— 用户可直接修改 Agent 生成的内容
3. **章节生成时可暂停** —— 当前章完成后暂停，用户审阅后决定是否继续
4. **输入阶段渐进式引导** —— Agent 追问 1-3 个关键问题，用户回答后补充分析
