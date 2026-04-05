# 用户介入点实现计划

## 背景

当前小说 Agent 流水线几乎全自动：用户输入提示词后，唯一的介入机会是在大纲生成后的 `review` 门控（且只能通过/驳回，不能编辑）。章节生成过程完全不可中断。

本次改造添加 4 个介入点，让用户在创作流程中有更多控制权。

---

## 阶段 1：分阶段独立确认

**目标：** 把单一 `review` 门控拆成 3 个独立审阅点（世界观/角色/大纲各一个）。

### 1.1 扩展状态类型

**文件：** `src/types/project.ts`

```typescript
export type PipelineStatus =
  | 'input'
  | 'world_building'
  | 'review_world'          // 新增
  | 'character_design'
  | 'review_characters'     // 新增
  | 'outline'
  | 'review_outline'        // 替代原 'review'
  | 'generating'
  | 'complete';
```

### 1.2 更新状态机

**文件：** `src/pipeline/state-machine.ts`

```
transitions:
  input            → ['world_building']
  world_building   → ['review_world']
  review_world     → ['character_design', 'world_building']
  character_design → ['review_characters']
  review_characters→ ['outline', 'character_design']
  outline          → ['review_outline']
  review_outline   → ['generating', 'outline']
  generating       → ['complete']

REVIEW_GATES: Set(['review_world', 'review_characters', 'review_outline'])
```

### 1.3 泛化 Engine 的 approve/reject

**文件：** `src/pipeline/engine.ts`

- `approve()`: 不再硬编码 `transition('generating')`，改为 `sm.advance()`（取 transitions[0]），然后 `await this.run()` 继续跑到下一个门控
- `reject()`: 取 `sm.nextStates[1]` 作为回退目标，然后 `await this.run()`
- 特殊处理：当从 `review_outline` 推进到 `generating` 时，走章节生成逻辑

### 1.4 更新 SSE 路由

**文件：** `src/server/routes/pipeline.ts`

- `GET /:id/stream`: 处理所有审阅态（不只是 `'review'`），审阅态时直接发 `review_ready` 事件
- 新增 `POST /:id/approve`: 推进当前审阅态
- 新增 `POST /:id/reject`: 驳回当前审阅态
- `GET /:id/stream/generate`: 改为接受 `review_outline` 状态
- 流程：前端 approve → POST /approve → 前端重连 GET /stream 继续

### 1.5 更新 SSE 事件

**文件：** `src/types/pipeline.ts`

- `review_ready` 事件的 `stage` 字段现在会是 `'review_world' | 'review_characters' | 'review_outline'`

### 1.6 前端更新

**文件：** `web/src/pages/Project.tsx`

- 更新进度条 STAGES 和标签
- `ReviewView` 根据当前 stage 展示不同内容（世界观 / 角色 / 大纲）
- 每个审阅视图都有"确认"和"驳回重新生成"按钮

### 1.7 DB 兼容

**文件：** `src/db/operations.ts`

- `loadPipelineState` 中将旧数据的 `'review'` 映射为 `'review_outline'`

### 验证

- [ ] 启动新项目，流水线在世界观完成后暂停，显示审阅界面
- [ ] 确认世界观后继续，角色完成后再次暂停
- [ ] 确认角色后继续，大纲完成后第三次暂停
- [ ] 确认大纲后进入章节生成
- [ ] 驳回测试：在角色审阅时驳回，重新生成角色后再次暂停
- [ ] 旧项目兼容：status 为 `'review'` 的旧项目能正常加载

---

## 阶段 2：审阅阶段可编辑

**目标：** 审阅时用户可以修改内容，修改后的数据替代 Agent 生成的原始数据继续流转。

### 2.1 Engine 添加 applyEdits

**文件：** `src/pipeline/engine.ts`

```typescript
private async applyEdits(reviewStage: PipelineStatus, data: unknown) {
  switch (reviewStage) {
    case 'review_world':
      this.state.worldBuilding = data as WorldBuilding;
      if (this.persist) await db.saveWorldBuilding(this.state.projectId, data);
      break;
    case 'review_characters':
      this.state.characters = data as Character[];
      if (this.persist) await db.saveCharacters(this.state.projectId, data);
      break;
    case 'review_outline':
      this.state.plotOutline = data as PlotOutline;
      if (this.persist) await db.savePlotOutline(this.state.projectId, data);
      break;
  }
}
```

- `approve(editedData?: unknown)` — 如果有 editedData，先调 `applyEdits`

### 2.2 API 路由

**文件：** `src/server/routes/pipeline.ts`

- `POST /:id/approve` 接受可选的 `{ editedData }` body

### 2.3 前端编辑 UI

**文件：** `web/src/pages/Project.tsx`

每个审阅视图添加编辑控件：
- **世界观**：era/setting/tone 等字段的 textarea
- **角色**：可展开的角色卡编辑（name/role/description/backstory/motivations/voiceNotes/arc）
- **大纲**：章节列表，每章的 title/summary/keyEvents/endHook 可编辑
- 两个按钮："直接确认"和"保存修改并确认"

### 2.4 前端 API 客户端

**文件：** `web/src/api.ts`

```typescript
export async function approveStage(id: string, editedData?: unknown)
export async function rejectStage(id: string)
```

### 验证

- [ ] 在世界观审阅时修改 setting 字段，确认后查看 DB 中数据已更新
- [ ] 修改后续角色/大纲生成是否使用了修改后的世界观内容
- [ ] 在角色审阅时修改角色名字，确认大纲中引用的角色名一致
- [ ] 不做修改直接确认，行为与阶段 1 一致

---

## 阶段 3：章节生成时可暂停

**目标：** 生成过程中支持暂停（当前章写完后暂停），用户审阅后决定是否继续。

### 3.1 扩展状态

**文件：** `src/types/project.ts`

```typescript
// PipelineStatus 新增:
| 'paused'
```

### 3.2 状态机

**文件：** `src/pipeline/state-machine.ts`

```
generating → ['paused', 'complete']
paused     → ['generating']
```

### 3.3 Engine 暂停机制

**文件：** `src/pipeline/engine.ts`

```typescript
private pauseRequested = false;

requestPause() { this.pauseRequested = true; }

// stageGenerating 循环内，每章完成后：
if (this.pauseRequested && i < totalChapters) {
  this.pauseRequested = false;
  this.sm.transition('paused');
  // ... 保存状态，发送事件
  return;  // 退出循环
}

async resumeGeneration() {
  this.sm.transition('generating');
  // 从 this.state.chapters.length + 1 继续
}
```

### 3.4 活跃引擎存储

**文件：** `src/server/routes/pipeline.ts`

```typescript
const activeEngines = new Map<string, PipelineEngine>();
```

生成开始时存入，完成/错误时移除。

### 3.5 新增路由

- `POST /:id/pause` — 调 `activeEngines.get(id).requestPause()`
- `POST /:id/resume` — 恢复引擎，开新 SSE 流继续推送

### 3.6 前端

- `GeneratingView` 添加"暂停（完成当前章后暂停）"按钮
- 新增 `PausedView`：展示已完成章节，提供"继续生成"按钮

### 3.7 SSE 事件扩展

**文件：** `src/types/pipeline.ts`

```typescript
| { type: 'chapter_paused'; chapterNumber: number }
```

### 验证

- [ ] 开始生成 5 章小说，在第 2 章生成中点暂停，第 2 章写完后暂停
- [ ] 暂停状态下能查看已生成的章节
- [ ] 点继续，从第 3 章恢复生成，SSE 正常推送
- [ ] 不暂停时行为不变，正常生成到完成
- [ ] 暂停后关闭页面再重新打开，能恢复暂停状态

---

## 阶段 4：输入阶段渐进式引导

**目标：** 输入分析后 Agent 追问 1-3 个关键问题，用户回答后补充分析。

### 4.1 扩展状态

```typescript
// PipelineStatus 新增:
| 'clarifying'

// transitions:
input      → ['clarifying']
clarifying → ['world_building']
```

`clarifying` 加入 REVIEW_GATES。

### 4.2 新建 Agent

**文件：** `src/pipeline/agents/clarify-agent.ts`

```typescript
// 根据初步分析结果，生成 1-3 个关键问题
export async function runClarifyAgent(
  analysis: InputAnalysis,
  config: LLMConfig
): Promise<string[]>

// 根据用户回答，补充完善分析
export async function runRefineAgent(
  analysis: InputAnalysis,
  answers: { question: string; answer: string }[],
  config: LLMConfig
): Promise<InputAnalysis>
```

### 4.3 Engine 变更

**文件：** `src/pipeline/engine.ts`

- `stageInput()` 末尾调 `runClarifyAgent` 生成问题，存入 state
- 新增 `submitClarification(answers)` 方法：调 `runRefineAgent` 更新分析，推进到 `world_building`

### 4.4 PipelineState 扩展

**文件：** `src/types/pipeline.ts`

```typescript
clarifyQuestions?: string[];
clarifyAnswers?: string[];
```

### 4.5 SSE 事件扩展

```typescript
| { type: 'clarify_questions'; questions: string[] }
```

### 4.6 DB

**文件：** `src/db/schema.ts`

- projects 表新增 `clarify_questions`、`clarify_answers` 列（JSON text）

### 4.7 路由

**文件：** `src/server/routes/pipeline.ts`

- `POST /:id/clarify` — 接收 `{ answers: string[] }`，保存并推进状态

### 4.8 前端

- 新增 `ClarifyView`：展示问题列表 + 文本输入框 + 提交按钮

### 验证

- [ ] 输入模糊提示词（如"写一个故事"），Agent 提出 1-3 个追问
- [ ] 回答问题后，分析结果比不追问时更丰富
- [ ] 输入详细提示词时，追问的问题更具体、有针对性
- [ ] 回答后流水线正常推进到世界观生成

---

## 涉及的关键文件

| 文件 | 改动 |
|------|------|
| `src/types/project.ts` | 扩展 PipelineStatus 类型 |
| `src/types/pipeline.ts` | 扩展 PipelineState、SSEEvent |
| `src/pipeline/state-machine.ts` | 新状态转换、新审阅门控 |
| `src/pipeline/engine.ts` | 泛化 approve/reject、applyEdits、暂停机制、clarification |
| `src/pipeline/agents/clarify-agent.ts` | 新建：问题生成 + 分析补充 |
| `src/server/routes/pipeline.ts` | 新增 POST approve/reject/clarify/pause/resume，更新 SSE |
| `src/db/schema.ts` | 新增 clarify 字段 |
| `src/db/operations.ts` | 兼容旧 review 状态 |
| `web/src/pages/Project.tsx` | 可编辑审阅视图、ClarifyView、PausedView、暂停按钮 |
| `web/src/api.ts` | 新增 API 调用函数 |
| `web/src/hooks/useSSE.ts` | 处理新事件类型 |
