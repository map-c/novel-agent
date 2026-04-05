/**
 * Agent 循环测试脚本
 * 用法: pnpm tsx src/agent/test.ts
 *
 * 提供 3 个工具给 Agent，观察它如何自主决定调用哪个工具、循环几次
 */
import 'dotenv/config';
import { z } from 'zod';
import { runAgent } from './loop.js';
import type { AgentTool } from './tool.js';

// 工具 1：字数统计
const wordCountTool: AgentTool = {
  name: 'word_count',
  description: '统计给定文本的字数（中文按字符计，英文按单词计）',
  parameters: z.object({
    text: z.string().describe('要统计字数的文本'),
  }),
  execute: async ({ text }) => {
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const englishWords = text.replace(/[\u4e00-\u9fff]/g, '').trim().split(/\s+/).filter(Boolean).length;
    return { chineseChars, englishWords, total: chineseChars + englishWords };
  },
};

// 工具 2：关键词提取（简单版 - 按词频）
const keywordTool: AgentTool = {
  name: 'extract_keywords',
  description: '从文本中提取高频关键词',
  parameters: z.object({
    text: z.string().describe('要提取关键词的文本'),
    topN: z.number().optional().describe('返回前 N 个关键词，默认 5'),
  }),
  execute: async ({ text, topN = 5 }) => {
    // 简单实现：按字符 bigram 频率
    const words = text.match(/[\u4e00-\u9fff]{2,4}|[a-zA-Z]+/g) || [];
    const freq = new Map<string, number>();
    for (const w of words) {
      freq.set(w, (freq.get(w) || 0) + 1);
    }
    const sorted = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN);
    return sorted.map(([word, count]) => ({ word, count }));
  },
};

// 工具 3：情感分析（模拟 - 基于关键词匹配）
const sentimentTool: AgentTool = {
  name: 'analyze_sentiment',
  description: '分析文本的情感倾向（正面/负面/中性）',
  parameters: z.object({
    text: z.string().describe('要分析情感的文本'),
  }),
  execute: async ({ text }) => {
    const positive = ['喜欢', '开心', '美好', '希望', '温暖', '快乐', '幸福', 'happy', 'love', 'good'];
    const negative = ['悲伤', '痛苦', '失望', '恐惧', '孤独', '绝望', 'sad', 'pain', 'fear', 'bad'];
    let score = 0;
    for (const w of positive) if (text.includes(w)) score++;
    for (const w of negative) if (text.includes(w)) score--;
    const sentiment = score > 0 ? '正面' : score < 0 ? '负面' : '中性';
    return { sentiment, score };
  },
};

async function main() {
  const sampleText = `
    在那个温暖的春天，小明终于鼓起勇气走出了孤独的房间。
    他感到一丝希望，尽管心中仍有些许恐惧和失望。
    街道上的樱花开得美好而灿烂，让他想起了那些快乐的童年时光。
    但回忆中也夹杂着悲伤，那些再也回不去的日子，让他感到一阵痛苦。
  `;

  console.log('=== Agent 循环测试 ===\n');
  console.log('任务：分析以下文本的主题、情感和统计信息\n');
  console.log('---');

  const result = await runAgent(
    `请分析以下文本，我需要你：
1. 统计文本字数
2. 提取关键词
3. 分析情感倾向
最后给我一个综合总结。

文本：
${sampleText}`,
    {
      llm: {
        model: 'google/gemini-2.0-flash-001',
        temperature: 0,
        maxTokens: 1000,
      },
      system: '你是一个文本分析助手。使用提供的工具来分析文本，然后基于工具结果给出综合总结。',
      tools: [wordCountTool, keywordTool, sentimentTool],
      maxIterations: 10,
      onStep: (step) => {
        if (step.type === 'tool_call') {
          console.log(`\n[第 ${step.iteration + 1} 轮] 调用工具: ${step.toolName}`);
          console.log('  参数:', JSON.stringify(step.toolArgs, null, 2).slice(0, 200));
          console.log('  结果:', JSON.stringify(step.toolResult));
        } else {
          console.log(`\n[第 ${step.iteration + 1} 轮] Agent 完成，输出最终回复`);
        }
      },
    },
  );

  console.log('\n--- Agent 最终回复 ---');
  console.log(result.text);
  console.log(`\n总步骤数: ${result.steps.length}`);
  console.log(`总 Token 用量: ${result.totalTokens}`);
  console.log('\n✅ Agent 循环测试完成');
}

main().catch((err) => {
  console.error('❌ 测试失败:', err.message);
  process.exit(1);
});
