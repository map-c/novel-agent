/**
 * Phase 4 测试：完整流水线 + 章节生成
 * 用法: pnpm tsx src/pipeline/test-chapter-gen.ts
 *
 * 生成一篇 3 章短篇小说，验证：
 * - 上下文管理是否正确注入
 * - 滚动摘要是否正常工作
 * - 跨章节角色名和情节是否连贯
 */
import 'dotenv/config';
import { PipelineEngine } from './engine.js';

const FAST_MODEL = 'google/gemini-2.0-flash-001';

async function main() {
  console.log('=== Phase 4 测试：完整小说生成 ===\n');
  const startTime = Date.now();

  const engine = await PipelineEngine.create(
    '一个小镇少女发现自己能听到植物说话的声音，她用这个能力拯救了即将枯死的百年古树，也因此改变了自己的命运。风格温暖治愈，3章短篇。',
    {
      planning: { model: FAST_MODEL, temperature: 0.7, maxTokens: 4000 },
      writing:  { model: FAST_MODEL, temperature: 0.8, maxTokens: 4000 },
      summary:  { model: FAST_MODEL, temperature: 0.3, maxTokens: 800 },
    },
    {
      onStageChange: (stage) => {
        console.log(`\n${'─'.repeat(50)}`);
        console.log(`▶ ${stage}`);
      },
      onStageComplete: (stage, data) => {
        if (stage === 'input') {
          const d = data as { title: string; genre: string; targetChapters: number };
          console.log(`  标题: ${d.title} | 体裁: ${d.genre} | 章节数: ${d.targetChapters}`);
        } else if (stage === 'world_building') {
          const d = data as { era: string; tone: string };
          console.log(`  时代: ${d.era} | 基调: ${d.tone}`);
        } else if (stage === 'character_design') {
          const chars = data as { name: string; role: string }[];
          console.log(`  角色: ${chars.map((c) => `${c.name}(${c.role})`).join('、')}`);
        } else if (stage === 'outline') {
          const d = data as { totalChapters: number; acts: { chapters: { number: number; title: string }[] }[] };
          const titles = d.acts.flatMap((a) => a.chapters.map((c) => `${c.number}.${c.title}`));
          console.log(`  大纲: ${titles.join(' → ')}`);
        }
      },
      onReviewReady: () => {
        console.log('\n⏸  审阅门控 — 自动通过');
      },
      onChapterChunk: (num, chunk) => {
        // 只在每章开头输出前 100 字
        const ch = engine.currentState.chapters.find((c) => c.number === num);
        if (!ch) process.stdout.write(chunk.slice(0, 100));
      },
      onChapterComplete: (num, content) => {
        console.log(`\n  ✓ 第 ${num} 章完成 (${content.length} 字)`);
        // 输出前 200 字预览
        console.log(`  预览: ${content.slice(0, 200).replace(/\n/g, ' ')}...`);
      },
      onError: (err) => {
        console.error(`\n✗ 错误: ${err.message}`);
      },
    },
  );

  // 跑到审阅门控
  await engine.run();

  // 自动通过所有审阅门控（包括追问）
  const gates = ['clarifying', 'review_world', 'review_characters', 'review_outline'] as const;
  while (gates.includes(engine.currentState.status as typeof gates[number])) {
    const status = engine.currentState.status;
    if (status === 'clarifying') {
      console.log('\n>> 模拟追问回答（跳过）');
      await engine.submitClarification(['由 AI 自行决定']);
    } else {
      console.log(`\n>> 自动审阅通过: ${status}`);
      await engine.approve();
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const state = engine.currentState;

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`最终状态: ${state.status}`);
  console.log(`总章节: ${state.chapters.length}`);
  console.log(`总字数: ${state.chapters.reduce((sum, c) => sum + c.charCount, 0)}`);
  console.log(`耗时: ${elapsed}s`);

  // 输出完整小说
  console.log(`\n${'═'.repeat(50)}`);
  console.log('完整小说输出：');
  console.log('═'.repeat(50));
  for (const ch of state.chapters) {
    console.log(`\n## 第 ${ch.number} 章：${ch.title}\n`);
    console.log(ch.content);
  }

  console.log(`\n✅ Phase 4 测试完成`);
}

main().catch((err) => {
  console.error('❌ 测试失败:', err.message);
  process.exit(1);
});
