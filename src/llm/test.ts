/**
 * LLM 调用层测试脚本
 * 用法: pnpm tsx src/llm/test.ts
 *
 * 测试三种调用方式:
 * 1. callLLM - 纯文本生成
 * 2. callLLMStructured - 结构化输出
 * 3. streamLLM - 流式生成
 */
import 'dotenv/config';
import { z } from 'zod';
import { callLLM, callLLMStructured, streamLLM } from './index.js';
import type { LLMConfig } from '../types/llm.js';

const config: LLMConfig = {
  model: 'google/gemini-2.0-flash-001',
  temperature: 0.7,
  maxTokens: 200,
};

async function testCallLLM() {
  console.log('=== 1. callLLM: 纯文本生成 ===');
  const { text, usage } = await callLLM(
    '用一句话介绍你自己',
    config,
  );
  console.log('回复:', text);
  console.log('Token 用量:', usage);
  console.log();
}

async function testCallLLMStructured() {
  console.log('=== 2. callLLMStructured: 结构化输出 ===');
  const schema = z.object({
    name: z.string().describe('角色姓名'),
    role: z.enum(['主角', '配角', '反派']).describe('角色类型'),
    description: z.string().describe('一句话描述'),
  });

  const { object, usage } = await callLLMStructured(
    '创建一个奇幻小说的角色',
    config,
    schema,
  );
  console.log('角色:', JSON.stringify(object, null, 2));
  console.log('Token 用量:', usage);
  console.log();
}

async function testStreamLLM() {
  console.log('=== 3. streamLLM: 流式生成 ===');
  const stream = await streamLLM(
    '写一段50字以内的小说开头',
    config,
  );

  process.stdout.write('流式输出: ');
  for await (const chunk of stream.textStream) {
    process.stdout.write(chunk);
  }
  console.log('\nToken 用量:', await stream.usage);
  console.log();
}

async function main() {
  console.log(`使用模型: ${config.model}\n`);

  await testCallLLM();
  await testCallLLMStructured();
  await testStreamLLM();

  console.log('✅ 全部测试通过');
}

main().catch((err) => {
  console.error('❌ 测试失败:', err.message);
  process.exit(1);
});
