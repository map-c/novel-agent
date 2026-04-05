# 小说生成 Agent 技术框架选型对比

## 框架定位

| | Claude Agent SDK | Vercel AI SDK (`ai`) | LangChain / LangGraph |
|---|---|---|---|
| **本质** | Agent 框架 | LLM 调用抽象层 | AI 应用全栈框架 |
| **一句话定位** | 把 Claude Code 的 Agent 能力封装为可编程的库 | 统一不同 LLM 提供商的调用接口 | AI 应用开发的瑞士军刀 |
| **语言支持** | Python, TypeScript | TypeScript (主), Python | Python (主), TypeScript |
| **维护方** | Anthropic 官方 | Vercel | LangChain Inc. |

---

## 核心能力对比

### 1. Agent 循环（Tool Use Loop）

**Claude Agent SDK** — 自动处理

SDK 完整接管 Agent 循环：模型调用 → 检测工具调用 → 执行工具 → 将结果反馈给模型 → 继续，直到任务完成。开发者只需接收最终结果。

```typescript
// Claude Agent SDK：自动循环
for await (const message of query("根据这个概念生成一部小说")) {
  // Agent 自动调用工具、读写文件、派发子Agent
  // 开发者只需处理输出
}
```

**Vercel AI SDK** — 手动实现

SDK 提供 LLM 调用和流式输出能力，但 Agent 循环需要开发者自行编排。

```typescript
// Vercel AI SDK：手动循环
const response = await generateText({ model, prompt, tools });
// 开发者自行检查 tool_use → 执行工具 → 组装结果 → 再次调用
```

**LangChain / LangGraph** — 半自动

LangChain 的 AgentExecutor 提供自动循环但灵活性有限；LangGraph 通过图（Graph）定义工作流，支持条件分支和循环，更灵活。

---

### 2. 多 Agent 编排

| 维度 | Claude Agent SDK | Vercel AI SDK | LangChain / LangGraph |
|---|---|---|---|
| **编排方式** | 原生 Subagent 机制 | 无内置，需自行实现 | LangGraph 提供图编排 |
| **Agent 间通信** | 子 Agent 结果自动回传父 Agent | 需自建 | 通过 State 传递 |
| **并行执行** | 支持多个子 Agent 并发 | 需自建 | LangGraph 支持并行节点 |
| **上下文隔离** | 每个子 Agent 独立上下文 | 需自建 | 每个节点独立 |

**Claude Agent SDK 示例：**

```typescript
const options = {
  agents: {
    "world-builder": {
      description: "设计虚构世界的专家",
      prompt: "你是一个世界观架构师...",
      tools: ["Write", "Edit", "Read"],
      model: "opus",
    },
    "character-designer": {
      description: "设计复杂角色的专家",
      prompt: "你是一个角色设计师...",
      tools: ["Write", "Edit", "Read"],
    },
    "chapter-writer": {
      description: "撰写小说章节的写手",
      prompt: "你是一个小说写手...",
      tools: ["Write", "Edit", "Read"],
      model: "opus",
    },
  },
};
```

**LangGraph 示例：**

```typescript
const graph = new StateGraph({ channels: novelState })
  .addNode("analyze", analyzeInput)
  .addNode("world_building", buildWorld)
  .addNode("character_design", designCharacters)
  .addNode("outline", createOutline)
  .addNode("user_review", humanReview)  // 人工审阅节点
  .addNode("chapter_gen", generateChapter)
  .addEdge("analyze", "world_building")
  .addEdge("world_building", "character_design")
  .addEdge("character_design", "outline")
  .addEdge("outline", "user_review")
  .addConditionalEdge("user_review", routeAfterReview)
  .addEdge("chapter_gen", "chapter_gen")  // 循环生成下一章
  .compile();
```

---

### 3. 内置工具

| 工具 | Claude Agent SDK | Vercel AI SDK | LangChain |
|---|---|---|---|
| 文件读写 (Read/Write/Edit) | 内置 | 无 | 无（需自建） |
| 文件搜索 (Glob/Grep) | 内置 | 无 | 无（需自建） |
| Bash 执行 | 内置 | 无 | ShellTool |
| Web 搜索 | 内置 | 无 | SerpAPI/Tavily |
| 用户交互 (AskUserQuestion) | 内置 | 无 | LangGraph interrupt |

---

### 4. LLM 模型支持

| | Claude Agent SDK | Vercel AI SDK | LangChain |
|---|---|---|---|
| Claude | 原生支持 | @ai-sdk/anthropic | ChatAnthropic |
| OpenAI | 不支持 | @ai-sdk/openai | ChatOpenAI |
| Google | 不支持 | @ai-sdk/google | ChatGoogleGenerativeAI |
| 本地模型 | 不支持 | @ai-sdk/ollama 等 | ChatOllama 等 |
| **多模型切换** | **不支持** | **统一接口，一行切换** | **统一接口** |

> Claude Agent SDK 仅支持 Claude 模型，这是最大的限制。

---

### 5. 状态持久化与会话恢复

| | Claude Agent SDK | Vercel AI SDK | LangChain / LangGraph |
|---|---|---|---|
| 会话持久化 | 自动保存到磁盘 | 需自建 | LangGraph 有 Checkpointer |
| 中断恢复 | 原生支持 resume/continue | 需自建 | LangGraph 支持 |
| 会话分支 | 支持 fork | 需自建 | 需自建 |

---

### 6. 流式输出

三者都支持流式输出，但方式不同：

- **Claude Agent SDK**：async iterator，逐条消息流出（包括工具调用过程）
- **Vercel AI SDK**：`streamText()` / `streamObject()`，细粒度控制流式 token
- **LangChain**：`.stream()` 方法，支持逐 token 或逐事件流

---

## 针对小说生成场景的评估

### 场景需求回顾

- 中篇小说生成（1-3 万字），分章节迭代生成
- 多阶段流水线：输入分析 → 世界观 → 角色 → 大纲 → [用户审阅] → 逐章生成
- 跨章节上下文管理（滑动窗口 + 层次化摘要）
- 半自动交互（关键节点用户审阅）
- Web 应用，实时流式预览
- 可选：多 LLM 后端

### 场景适配度

| 维度 | Claude Agent SDK | Vercel AI SDK | LangGraph |
|---|---|---|---|
| 多 Agent 流水线 | 原生支持，开发量最少 | 需完全自建 | 图编排天然适配 |
| 人工审阅门控 | AskUserQuestion 内置 | 需自建 | interrupt 机制适配 |
| 跨章节上下文管理 | 灵活性受限（框架管上下文） | 完全自控（最灵活） | 通过 State 管理 |
| 章节生成质量控制 | 通过提示词控制 | 可精确控制每次调用的参数 | 可精确控制 |
| Web 集成 | 需要额外封装为 API | 天然适合后端集成 | 需要额外封装 |
| 多 LLM 支持 | 仅 Claude | 多模型 | 多模型 |
| 长时间任务恢复 | Session 自动持久化 | 需自建 | Checkpointer 支持 |
| 开发速度 | 快（大量开箱即用） | 慢（需自建编排层） | 中等 |
| 可维护性 | 中（依赖框架行为） | 高（代码即逻辑） | 中（框架学习成本） |

---

## 推荐方案

### 方案 A：Claude Agent SDK（快速验证优先）

**适合场景：** 确定只用 Claude 模型，希望快速出原型。

- 多 Agent 编排开箱即用，省大量代码
- Session 持久化免费获得
- 限制：仅 Claude、上下文管理灵活性受限、Web 集成需额外封装

### 方案 B：Vercel AI SDK + 自建编排（控制力优先）

**适合场景：** 需要多 LLM 后端、精细控制上下文管理策略。

- LLM 调用层用 AI SDK 统一适配
- 流水线编排、状态机、上下文管理完全自主实现
- 开发量最大，但可控性最高

### 方案 C：混合架构（平衡方案）

**适合场景：** 主用 Claude，但保留多模型扩展性。

- 核心 Agent 编排用 Claude Agent SDK
- 章节生成阶段可选通过 Vercel AI SDK 调用其他模型
- 兼顾开发效率和灵活性，但架构复杂度增加

### 方案 D：LangGraph + Vercel AI SDK

**适合场景：** 需要复杂工作流编排 + 多模型支持。

- LangGraph 做流水线编排（图定义、状态管理、人工审阅节点）
- Vercel AI SDK 做底层 LLM 调用
- 学习成本较高，JS 版 LangGraph 成熟度偏低
