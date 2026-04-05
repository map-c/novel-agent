# Novel Agent

AI 小说生成工作台 — 基于多阶段 Agent 流水线，自动完成从创意到成稿的全过程。

## 功能概览

- **多阶段生成流水线**：输入分析 → 渐进式追问 → 世界观 → 角色设计 → 大纲 → 逐章生成
- **渐进式引导**：Agent 分析用户输入后追问 1-3 个关键问题，完善创作方向
- **分阶段独立审阅**：世界观、角色、大纲各自独立确认，每个阶段可编辑或驳回重新生成
- **审阅阶段可编辑**：直接修改 Agent 生成的世界观设定、角色卡、章节大纲
- **章节生成可暂停**：生成过程中可暂停（当前章完成后生效），审阅后再继续
- **实时流式输出**：章节生成过程通过 SSE 实时推送，前端逐字展示
- **断点续传**：流水线状态持久化到数据库，中断后可从上次阶段恢复
- **Markdown 导出**：完成后可一键导出全书 Markdown 文件

## 技术栈

| 层级 | 技术 |
|------|------|
| LLM | OpenRouter API + Vercel AI SDK |
| 后端 | Hono + TypeScript + tsx |
| 数据库 | SQLite (LibSQL / Turso) + Drizzle ORM |
| 前端 | React 19 + React Router 7 + Tailwind CSS 4 + Vite |
| 工程 | pnpm workspace monorepo |

## 快速开始

### 前置条件

- Node.js >= 18
- pnpm >= 9

### 安装

```bash
git clone https://github.com/map-c/novel-agent.git
cd novel-agent
pnpm install
```

### 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填入你的 OpenRouter API Key：

```
OPENROUTER_API_KEY=sk-or-v1-your-key-here
PORT=3000
```

### 启动开发服务器

```bash
# 同时启动前后端
pnpm dev:all
```

或分别启动：

```bash
# 后端 (端口 3000)
pnpm dev

# 前端 (端口 5173)
pnpm dev:web
```

启动后访问 http://localhost:5173 即可使用。

## 使用流程

1. **创建项目** — 在首页输入小说创意描述，点击「开始创作」
2. **启动生成** — 进入项目页面，点击「启动生成」
3. **回答追问** — Agent 分析输入后提出 1-3 个关键问题，回答后完善创作方向
4. **审阅世界观** — 审阅生成的世界观设定，可编辑修改或驳回重新生成
5. **审阅角色** — 审阅角色卡（名字、背景、动机、弧线等），可编辑或驳回
6. **审阅大纲** — 审阅章节大纲（三幕结构、章节摘要、关键事件），确认后开始生成
7. **章节生成** — 系统逐章生成正文，实时流式展示，可随时暂停
8. **阅读导出** — 生成完成后可在线阅读各章节，或点击「导出 Markdown」下载全文

## 项目结构

```
novel-agent/
├── src/                    # 后端代码
│   ├── server/             # Hono HTTP 服务 & 路由
│   ├── pipeline/           # 生成流水线
│   │   ├── engine.ts       # 流水线引擎（核心调度）
│   │   ├── state-machine.ts# 状态机（阶段流转）
│   │   ├── context-manager.ts # 章节生成上下文管理
│   │   └── agents/         # 各阶段 Agent (input/clarify/world/character/outline/chapter)
│   ├── agent/              # Agent 循环 & 工具调用
│   ├── llm/                # LLM 客户端封装
│   ├── db/                 # 数据库 schema & 操作
│   └── types/              # 类型定义
├── web/                    # 前端代码 (React + Vite)
│   └── src/
│       ├── pages/          # 页面组件
│       ├── hooks/          # 自定义 Hook (SSE)
│       └── api.ts          # API 客户端
└── docs/                   # 设计文档
```

## 流水线阶段

```
input → clarifying → world_building → review_world → character_design → review_characters
  → outline → review_outline → generating ⇄ paused → complete
```

每个 `review_*` 阶段都支持：
- **确认** — 进入下一阶段
- **编辑后确认** — 修改内容后进入下一阶段
- **驳回** — 回退到对应生成阶段重新生成

`generating` 阶段支持暂停，当前章完成后进入 `paused` 状态，可查看已完成章节后继续生成。

## License

MIT
