import { z } from 'zod';

/**
 * 我们自定义的 Tool 接口 —— 比 AI SDK 内置的更直观
 * AI SDK 的 tool() 会在内部自动执行，我们不用它，手动控制循环
 */
export interface AgentTool<TParams extends z.ZodType = z.ZodType, TResult = unknown> {
  name: string;
  description: string;
  parameters: TParams;
  execute: (args: z.infer<TParams>) => Promise<TResult>;
}
