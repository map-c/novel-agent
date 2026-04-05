/**
 * Phase 5 测试：持久化 + 中断恢复
 * 用法: pnpm tsx src/db/test.ts
 */
import 'dotenv/config';
import { PipelineEngine } from '../pipeline/engine.js';
import { getDb } from './index.js';
import { loadPipelineState, listProjects } from './operations.js';

const FAST_MODEL = 'google/gemini-2.0-flash-001';
const models = {
  planning: { model: FAST_MODEL, temperature: 0.7, maxTokens: 4000 },
  writing:  { model: FAST_MODEL, temperature: 0.8, maxTokens: 2000 },
  summary:  { model: FAST_MODEL, temperature: 0.3, maxTokens: 800 },
};

async function main() {
  getDb();
  console.log('=== Phase 5 测试：持久化 + 中断恢复 ===\n');

  // 1. 创建并运行流水线（启用持久化）
  console.log('1. 创建新项目并运行到 review...');
  const engine = await PipelineEngine.create(
    '一个程序员在加班时意外穿越到了古代，用现代知识解决了王朝的粮食危机。轻松搞笑风格，3章短篇。',
    models,
    {
      onStageChange: (s) => console.log(`  ▶ ${s}`),
      onStageComplete: (s) => console.log(`  ✓ ${s} 完成`),
      onReviewReady: () => console.log('  ⏸ 审阅门控'),
      onChapterComplete: (n, c) => console.log(`  ✓ 第 ${n} 章完成 (${c.length} 字)`),
    },
    { persist: true },
  );

  await engine.run();
  const projectId = engine.currentState.projectId;
  console.log(`\n  项目 ID: ${projectId}`);

  // 2. 验证数据库中有数据
  console.log('\n2. 验证数据库持久化...');
  const saved = await loadPipelineState(projectId);
  console.log(`  状态: ${saved.status}`);
  console.log(`  世界观: ${saved.worldBuilding ? '✓' : '✗'}`);
  console.log(`  角色数: ${saved.characters.length}`);
  console.log(`  大纲章节数: ${saved.plotOutline?.totalChapters ?? 0}`);

  // 3. 用 resume 恢复并 approve 生成
  console.log('\n3. 从数据库恢复并开始生成...');
  const resumed = await PipelineEngine.resume(projectId, models, {
    onStageChange: (s) => console.log(`  ▶ ${s}`),
    onChapterComplete: (n, c) => console.log(`  ✓ 第 ${n} 章完成 (${c.length} 字)`),
  });

  console.log(`  恢复状态: ${resumed.currentState.status}`);
  await resumed.approve();

  // 4. 验证最终数据
  console.log('\n4. 验证最终数据...');
  const final = await loadPipelineState(projectId);
  console.log(`  最终状态: ${final.status}`);
  console.log(`  章节数: ${final.chapters.length}`);
  console.log(`  总字数: ${final.chapters.reduce((s, c) => s + c.charCount, 0)}`);
  console.log(`  滚动摘要: ${final.plotSummary ? final.plotSummary.slice(0, 100) + '...' : '无'}`);
  console.log(`  章节摘要数: ${final.chapterSummaries.size}`);

  // 5. 列出所有项目
  console.log('\n5. 项目列表:');
  for (const p of await listProjects()) {
    console.log(`  - ${p.title} (${p.status}) ${p.id}`);
  }

  console.log('\n✅ Phase 5 测试完成');
}

main().catch((err) => {
  console.error('❌ 测试失败:', err.message);
  process.exit(1);
});
