# 开发计划

## 目标

构建一个小说生成 Agent，通过实践深入理解：Agent 循环、多 Agent 编排、上下文管理、LLM 调用。

---

## Phase 0：项目初始化

**目标：** 搭好项目骨架，能跑起来。

- [ ] pnpm monorepo 初始化（packages: shared, server, web）
- [ ] TypeScript 配置（tsconfig base + 各包继承）
- [ ] shared 包：定义核心类型（Project, Character, Chapter, PlotOutline, PipelineStatus）
- [ ] server 包：Hono 最小启动，一个 health check 接口
- [ ] web 包：Vite + React 最小启动，能访问页面
- [ ] 验证：`pnpm dev` 前后端都能跑起来

---

## Phase 1：LLM 调用层

**目标：** 理解 Vercel AI SDK 的统一抽象，能调通 LLM。

- [ ] 安装 `ai`、`@ai-sdk/anthropic`、`@ai-sdk/openai`
- [ ] 实现 LLM 调用封装
  - `createModel(provider, model, apiKey)` —— 根据配置返回对应模型实例
  - `callLLM(model, prompt, system)` —— 普通文本生成
  - `callLLMStructured(model, prompt, schema)` —— 结构化输出（用 Zod schema）
  - `streamLLM(model, prompt, system)` —— 流式文本生成
- [ ] 实现简单的配置管理（从 `.env` 读 API Key）
- [ ] 验证：写一个测试脚本，分别用 Claude 和 OpenAI 生成一段文字，确认两个模型都能调通

**学习重点：** Vercel AI SDK 的 `generateText`、`generateObject`、`streamText` 三个核心 API。

---

## Phase 2：单 Agent 循环

**目标：** 自己实现 Agent 循环，理解 Agent 的核心机制。

- [ ] 实现 Agent 循环核心
  ```
  while (true) {
    调用 LLM（带工具定义）
    if LLM 说"完成了" → 返回结果
    if LLM 说"要调用工具" → 执行工具 → 把结果喂回去 → 继续循环
  }
  ```
- [ ] 定义 Tool 接口（name, description, parameters, execute）
- [ ] 实现 2-3 个简单工具用于测试（如：获取当前时间、字数统计、关键词提取）
- [ ] 验证：给 Agent 一个任务（"分析这段文字的主题和情感"），观察它自主决定调用哪个工具、循环几次

**学习重点：** 理解 Agent 不是魔法，就是一个 while 循环 + 工具调用。LLM 扮演的是"决策者"角色。

---

## Phase 3：多 Agent 编排 —— Pipeline Engine

**目标：** 实现多 Agent 协作的流水线，理解 Agent 之间怎么传递状态。

- [ ] 实现状态机（PipelineStateMachine）
  - 状态：`input → world_building → character_design → outline → [review] → chapter_gen → complete`
  - 每个状态有：进入条件、执行逻辑、退出条件
- [ ] 实现 Pipeline Engine
  - 按状态机顺序调度各阶段 Agent
  - 每个阶段的 Agent 有独立的 system prompt
  - 阶段间通过 `PipelineState` 对象传递数据
- [ ] 实现各阶段 Agent（先用简单 prompt，后续迭代优化）：
  - [ ] 输入分析 Agent：解析用户输入，提取体裁/主题/基调
  - [ ] 世界观 Agent：生成世界观设定（结构化输出）
  - [ ] 角色设计 Agent：生成角色卡（结构化输出）
  - [ ] 大纲 Agent：生成章节大纲（结构化输出）
- [ ] 实现"审阅门控"：大纲阶段完成后暂停，等待外部确认信号
- [ ] 验证：输入一个简单提示词，跑完 input → outline 全流程，检查每个阶段的输出是否正确传递给下一个阶段

**学习重点：** Agent 之间的数据流设计、状态机驱动的流程控制、结构化输出的 schema 设计。

---

## Phase 4：章节生成 + 上下文管理

**目标：** 实现逐章生成，解决跨章节上下文管理这个核心难题。

- [ ] 实现 ContextManager
  - `buildChapterContext(chapter)` —— 为当前章节组装上下文
  - `updateAfterChapter(chapter, content)` —— 章节完成后更新摘要
  - 上下文组成：世界观摘要 + 出场角色卡 + 情节进展摘要 + 上章结尾 + 当前章大纲
  - 严格控制每部分的长度上限
- [ ] 实现章节生成 Agent
  - 接收 ContextManager 组装的上下文
  - 流式输出章节内容
  - 生成完成后调用 ContextManager 更新摘要
- [ ] 实现"滚动摘要"机制
  - 每章生成后，用小模型生成该章摘要（~300 字）
  - 更新"情节进展总摘要"（压缩而非追加）
- [ ] 实现分级模型调用
  - 章节正文用强模型（Opus/GPT-4o）
  - 摘要生成用弱模型（Haiku/GPT-4o-mini）
- [ ] 验证：生成一篇 3-5 章的短篇小说，检查角色名一致性、情节连贯性、上下文是否正确注入

**学习重点：** 这是整个项目最有价值的部分——如何在有限的上下文窗口内维护长篇叙事的一致性。

---

## Phase 5：数据持久化

**目标：** 把生成过程和结果存下来，支持中断恢复。

- [ ] SQLite + Drizzle ORM 集成
- [ ] 数据表设计：projects, characters, chapters, pipeline_state
- [ ] 每个阶段完成后持久化状态到数据库
- [ ] 实现中断恢复：读取数据库状态，从断点继续流水线
- [ ] 验证：生成到第 3 章时手动中断进程，重启后能从第 3 章继续

---

## Phase 6：后端 API

**目标：** 用 Hono 暴露流水线能力，为前端提供接口。

- [ ] 项目 CRUD 接口（POST/GET/DELETE /projects）
- [ ] 流水线控制接口
  - POST `/projects/:id/start` —— 启动生成
  - POST `/projects/:id/approve` —— 审阅通过
  - POST `/projects/:id/regenerate/:chapter` —— 重新生成某章
- [ ] SSE 流式推送接口
  - GET `/projects/:id/stream` —— 实时推送生成进度和文本
  - 事件类型：stage_changed, chunk, chapter_complete, review_ready, error
- [ ] 导出接口（GET `/projects/:id/export` —— 返回 Markdown）
- [ ] 验证：用 curl/Postman 调用接口，完整跑通一次生成流程

---

## Phase 7：前端 Web

**目标：** 做一个够用的界面，能可视化整个 Agent 工作过程。

- [ ] 首页：项目列表 + 新建项目（输入提示词或参考简介）
- [ ] 项目工作台
  - 左侧：章节导航
  - 中间：根据阶段切换内容
    - 审阅阶段：展示大纲/角色卡，支持直接编辑 + 确认按钮
    - 生成阶段：流式文本预览
    - 完成阶段：阅读视图
  - 底部：流水线进度指示
- [ ] SSE 对接：useSSE hook，接收实时推送
- [ ] 设置页：配置 LLM 提供商和 API Key
- [ ] 验证：在浏览器中完成一次完整的小说生成流程

---

## Phase 8：提示词优化与质量调优

**目标：** 在流程跑通的基础上，优化各阶段提示词，提升生成质量。

- [ ] 优化各阶段 system prompt（风格锚点、角色语言、情节松紧度）
- [ ] 加入章节长度控制逻辑（过短续写、过长截断）
- [ ] 加入简单的一致性检查（角色名正则匹配、字数统计）
- [ ] 实现"参考简介"模式的主题种子提取
- [ ] 实际生成 2-3 篇不同体裁的小说，根据效果迭代 prompt

---

## 各 Phase 的依赖关系

```
Phase 0 (项目初始化)
   ↓
Phase 1 (LLM 调用层)
   ↓
Phase 2 (单 Agent 循环)
   ↓
Phase 3 (多 Agent 编排)
   ↓
Phase 4 (章节生成 + 上下文管理)
   ↓
Phase 5 (数据持久化)
   ↓
Phase 6 (后端 API)
   ↓
Phase 7 (前端 Web)
   ↓
Phase 8 (提示词优化)
```

Phase 1-4 是核心学习路径，建议重点投入。Phase 5-7 是工程包装。Phase 8 是持续迭代。
