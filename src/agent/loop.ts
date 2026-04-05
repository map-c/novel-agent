import { generateText } from 'ai';
import type { CoreMessage } from 'ai';
import { createOpenRouterProvider } from '../llm/client.js';
import type { LLMConfig } from '../types/llm.js';
import type { AgentTool } from './tool.js';

export interface AgentConfig {
  /** LLM 配置 */
  llm: LLMConfig;
  /** system prompt，定义 Agent 的角色和行为 */
  system: string;
  /** Agent 可用的工具列表 */
  tools: AgentTool[];
  /** 最大循环次数，防止无限循环 */
  maxIterations?: number;
  /** 每步回调，用于观察 Agent 的决策过程 */
  onStep?: (step: AgentStep) => void;
}

export interface AgentStep {
  iteration: number;
  type: 'tool_call' | 'final';
  toolName?: string;
  toolArgs?: unknown;
  toolResult?: unknown;
  text?: string;
}

export interface AgentResult {
  text: string;
  steps: AgentStep[];
  totalTokens: number;
}

/**
 * Agent 循环核心
 *
 * 本质就是一个 while 循环：
 * 1. 把消息历史发给 LLM（带工具定义）
 * 2. LLM 返回文本 → 结束
 * 3. LLM 返回工具调用 → 执行工具 → 把结果追加到消息历史 → 回到 1
 */
export async function runAgent(
  task: string,
  config: AgentConfig,
): Promise<AgentResult> {
  const openrouter = createOpenRouterProvider();
  const maxIterations = config.maxIterations ?? 10;

  // 把 AgentTool[] 转成 AI SDK 需要的 tools 格式（不传 execute，手动执行）
  const aiTools: Record<string, { description: string; parameters: AgentTool['parameters'] }> = {};
  const toolMap = new Map<string, AgentTool>();
  for (const t of config.tools) {
    aiTools[t.name] = { description: t.description, parameters: t.parameters };
    toolMap.set(t.name, t);
  }

  // 消息历史 —— Agent 的"记忆"
  const messages: CoreMessage[] = [{ role: 'user', content: task }];
  const steps: AgentStep[] = [];
  let totalTokens = 0;

  for (let i = 0; i < maxIterations; i++) {
    // 调用 LLM
    const response = await generateText({
      model: openrouter(config.llm.model),
      system: config.system,
      messages,
      tools: aiTools,
      temperature: config.llm.temperature,
      maxTokens: config.llm.maxTokens,
    });

    totalTokens += response.usage.totalTokens;

    // 没有工具调用 → Agent 认为任务完成，返回最终文本
    if (response.toolCalls.length === 0) {
      const step: AgentStep = { iteration: i, type: 'final', text: response.text };
      steps.push(step);
      config.onStep?.(step);
      return { text: response.text, steps, totalTokens };
    }

    // 有工具调用 → 逐个执行
    // 先把 assistant 的回复（含工具调用）加入消息历史
    messages.push({
      role: 'assistant',
      content: response.toolCalls.map((tc) => ({
        type: 'tool-call' as const,
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        args: tc.args,
      })),
    });

    // 执行每个工具调用，收集结果
    const toolResults: { type: 'tool-result'; toolCallId: string; toolName: string; result: unknown }[] = [];

    for (const tc of response.toolCalls) {
      const tool = toolMap.get(tc.toolName);
      if (!tool) {
        throw new Error(`Unknown tool: ${tc.toolName}`);
      }

      const result = await tool.execute(tc.args);

      const step: AgentStep = {
        iteration: i,
        type: 'tool_call',
        toolName: tc.toolName,
        toolArgs: tc.args,
        toolResult: result,
      };
      steps.push(step);
      config.onStep?.(step);

      toolResults.push({
        type: 'tool-result',
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        result,
      });
    }

    // 把工具结果作为 tool message 追加到消息历史
    messages.push({ role: 'tool', content: toolResults });
  }

  // 超过最大循环次数，取最后一次的文本返回
  return { text: '[Agent reached max iterations]', steps, totalTokens };
}
