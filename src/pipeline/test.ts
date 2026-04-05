/**
 * Pipeline 流水线测试脚本
 * 用法: pnpm tsx src/pipeline/test.ts
 *
 * 输入一个简单提示词，跑完 input → world_building → character_design → outline → review 全流程
 * 观察每个阶段的输出如何传递给下一个阶段
 */
import 'dotenv/config';
import { PipelineEngine } from './engine.js';

async function main() {
  console.log('=== Pipeline 流水线测试 ===\n');

  const engine = await PipelineEngine.create(
    '一个少年在末日废土中寻找传说中的净土城市，途中结识了各种幸存者，揭开了灾难背后的阴谋。',
    {
      planning: { model: 'google/gemini-2.0-flash-001', temperature: 0.7, maxTokens: 4000 },
      writing:  { model: 'google/gemini-2.0-flash-001', temperature: 0.8, maxTokens: 4000 },
      summary:  { model: 'google/gemini-2.0-flash-001', temperature: 0.3, maxTokens: 800 },
    },
    {
      onStageChange: (stage) => {
        console.log(`\n${'='.repeat(50)}`);
        console.log(`▶ 进入阶段: ${stage}`);
        console.log('='.repeat(50));
      },
      onStageComplete: (stage, data) => {
        console.log(`\n✓ 阶段 ${stage} 完成`);
        console.log(JSON.stringify(data, null, 2).slice(0, 2000));
        if (JSON.stringify(data).length > 2000) console.log('... (输出已截断)');
      },
      onReviewReady: (state) => {
        console.log(`\n${'='.repeat(50)}`);
        console.log('⏸  到达审阅门控 — 流水线暂停');
        console.log(`当前状态: ${state.status}`);
        console.log(`世界观: ${state.worldBuilding ? '✓' : '✗'}`);
        console.log(`角色数: ${state.characters.length}`);
        console.log(`大纲章节数: ${state.plotOutline?.totalChapters ?? 0}`);
        console.log('='.repeat(50));
      },
      onError: (err) => {
        console.error(`\n✗ 错误: ${err.message}`);
      },
    },
  );

  // 运行流水线（会在 review 阶段暂停）
  await engine.run();

  // 模拟审阅通过
  const state = engine.currentState;
  if (state.status === 'review') {
    console.log('\n>> 模拟审阅通过...');
    await engine.approve();
    console.log(`\n最终状态: ${engine.currentState.status}`);
  }

  console.log('\n✅ Pipeline 测试完成');
}

main().catch((err) => {
  console.error('❌ 测试失败:', err.message);
  process.exit(1);
});
