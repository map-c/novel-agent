import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  getPrompts, updatePrompt, resetPrompt,
  getModelsConfig, updateModelConfig, resetModelConfig,
  getPresets, applyPreset,
  listProjects, getUsage, getFeedback,
  type PromptInfo, type ModelInfo, type PresetInfo,
  type ProjectSummary, type UsageSummary, type FeedbackRecord,
} from '../api';

type Tab = 'models' | 'prompts' | 'presets' | 'stats';

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 2500);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
      <div className="bg-gray-900 text-white text-sm px-5 py-2.5 rounded-xl shadow-lg flex items-center gap-2">
        <svg className="w-4 h-4 text-primary-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        {message}
      </div>
    </div>
  );
}

const TIER_LABELS: Record<string, string> = {
  planning: '规划模型（分析/大纲）',
  writing: '写作模型（章节生成）',
  summary: '摘要模型（压缩/总结）',
};

const TIER_ICONS: Record<string, string> = {
  planning: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  writing: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
  summary: 'M4 6h16M4 12h16M4 18h7',
};

export default function Settings() {
  const [tab, setTab] = useState<Tab>('models');
  const [toast, setToast] = useState<string | null>(null);
  const navigate = useNavigate();

  const showToast = (message: string) => setToast(message);

  const tabs: [Tab, string][] = [
    ['models', '模型配置'],
    ['prompts', '提示词管理'],
    ['presets', '生成预设'],
    ['stats', '用量统计'],
  ];

  return (
    <div className="min-h-screen bg-warm-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => navigate('/')} className="text-gray-400 hover:text-primary-600 cursor-pointer">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-serif font-bold text-gray-900">Settings</h1>
            <p className="text-gray-400 text-sm">管理模型、提示词和生成预设</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 bg-warm-100 rounded-xl p-1 mb-6">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 py-2 px-2 sm:px-4 rounded-lg text-xs sm:text-sm font-medium cursor-pointer text-center ${
                tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {tab === 'models' && <ModelsTab showToast={showToast} />}
        {tab === 'prompts' && <PromptsTab showToast={showToast} />}
        {tab === 'presets' && <PresetsTab showToast={showToast} />}
        {tab === 'stats' && <StatsTab />}
      </div>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

// ─── Models Tab ───

function ModelsTab({ showToast }: { showToast: (msg: string) => void }) {
  const [models, setModels] = useState<Record<string, ModelInfo>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    getModelsConfig().then(setModels).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleSave = async (tier: string) => {
    setSaving(tier);
    await updateModelConfig(tier, models[tier].config);
    const fresh = await getModelsConfig();
    setModels(fresh);
    setSaving(null);
    showToast('模型配置已保存');
  };

  const handleReset = async (tier: string) => {
    setSaving(tier);
    await resetModelConfig(tier);
    const fresh = await getModelsConfig();
    setModels(fresh);
    setSaving(null);
    showToast('已重置为默认配置');
  };

  const updateField = (tier: string, field: string, value: string | number) => {
    setModels((prev) => ({
      ...prev,
      [tier]: {
        ...prev[tier],
        config: { ...prev[tier].config, [field]: value },
      },
    }));
  };

  if (loading) return <div className="text-gray-400 text-center py-12 font-serif italic">加载中...</div>;

  return (
    <div className="space-y-4">
      {Object.entries(models).map(([tier, info]) => (
        <div key={tier} className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={TIER_ICONS[tier] ?? TIER_ICONS.planning} />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 text-sm sm:text-base">{TIER_LABELS[tier] ?? tier}</h3>
            </div>
            {!info.isDefault && (
              <span className="text-[11px] bg-primary-50 text-primary-700 px-2.5 py-0.5 rounded-full font-medium whitespace-nowrap shrink-0">已自定义</span>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1 font-medium">模型名称</label>
              <input
                type="text"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
                value={info.config.model}
                onChange={(e) => updateField(tier, 'model', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1 font-medium">
                  Temperature: <span className="text-primary-600">{info.config.temperature ?? 0}</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  className="w-full accent-primary-600"
                  value={info.config.temperature ?? 0}
                  onChange={(e) => updateField(tier, 'temperature', parseFloat(e.target.value))}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1 font-medium">Max Tokens</label>
                <input
                  type="number"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
                  value={info.config.maxTokens ?? 4000}
                  onChange={(e) => updateField(tier, 'maxTokens', parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-5">
            {!info.isDefault && (
              <button
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 cursor-pointer"
                onClick={() => handleReset(tier)}
                disabled={saving === tier}
              >
                重置为默认
              </button>
            )}
            <button
              className="text-sm bg-primary-600 text-white px-4 py-1.5 rounded-lg hover:bg-primary-700 disabled:opacity-50 cursor-pointer"
              onClick={() => handleSave(tier)}
              disabled={saving === tier}
            >
              {saving === tier ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Prompts Tab ───

function PromptsTab({ showToast }: { showToast: (msg: string) => void }) {
  const [prompts, setPrompts] = useState<Record<string, PromptInfo>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    getPrompts().then((data) => {
      setPrompts(data);
      const values: Record<string, string> = {};
      for (const [key, info] of Object.entries(data)) {
        values[key] = info.value;
      }
      setEditValues(values);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleSave = async (key: string) => {
    setSaving(key);
    await updatePrompt(key, editValues[key]);
    const fresh = await getPrompts();
    setPrompts(fresh);
    setSaving(null);
    showToast('提示词已保存');
  };

  const handleReset = async (key: string) => {
    setSaving(key);
    const result = await resetPrompt(key);
    setEditValues((prev) => ({ ...prev, [key]: result.defaultValue }));
    const fresh = await getPrompts();
    setPrompts(fresh);
    setSaving(null);
    showToast('已重置为默认提示词');
  };

  if (loading) return <div className="text-gray-400 text-center py-12 font-serif italic">加载中...</div>;

  return (
    <div className="space-y-2">
      {Object.entries(prompts).map(([key, info]) => (
        <div key={key} className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <button
            className="w-full px-5 py-4 flex items-center justify-between text-left cursor-pointer"
            onClick={() => setExpanded(expanded === key ? null : key)}
          >
            <div className="flex items-center gap-3">
              <span className="font-medium text-gray-900 text-sm">{info.label}</span>
              {!info.isDefault && (
                <span className="text-[11px] bg-primary-50 text-primary-700 px-2.5 py-0.5 rounded-full font-medium">已自定义</span>
              )}
            </div>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${expanded === key ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {expanded === key && (
            <div className="px-5 pb-5 border-t border-gray-50">
              <textarea
                className="w-full border border-gray-200 rounded-lg p-3 text-sm mt-4 resize-none focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent font-mono"
                rows={8}
                value={editValues[key] ?? ''}
                onChange={(e) => setEditValues((prev) => ({ ...prev, [key]: e.target.value }))}
              />

              {!info.isDefault && (
                <details className="mt-2">
                  <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
                    查看默认值
                  </summary>
                  <pre className="mt-1 text-xs text-gray-400 bg-warm-50 rounded-lg p-3 whitespace-pre-wrap">
                    {info.defaultValue}
                  </pre>
                </details>
              )}

              <div className="flex justify-end gap-2 mt-3">
                {!info.isDefault && (
                  <button
                    className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 cursor-pointer"
                    onClick={() => handleReset(key)}
                    disabled={saving === key}
                  >
                    重置为默认
                  </button>
                )}
                <button
                  className="text-sm bg-primary-600 text-white px-4 py-1.5 rounded-lg hover:bg-primary-700 disabled:opacity-50 cursor-pointer"
                  onClick={() => handleSave(key)}
                  disabled={saving === key}
                >
                  {saving === key ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Presets Tab ───

function PresetsTab({ showToast }: { showToast: (msg: string) => void }) {
  const [presets, setPresets] = useState<Record<string, PresetInfo>>({});
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);

  useEffect(() => {
    getPresets().then(setPresets).finally(() => setLoading(false));
  }, []);

  const handleApply = async (name: string) => {
    setApplying(name);
    await applyPreset(name);
    setApplying(null);
    showToast(`已应用「${presets[name].label}」预设`);
  };

  if (loading) return <div className="text-gray-400 text-center py-12 font-serif italic">加载中...</div>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400 mb-2">
        预设会覆盖当前的模型配置（模型名称 + 参数）。应用后可在「模型配置」Tab 中查看和微调。
      </p>
      {Object.entries(presets).map(([name, preset]) => (
        <div key={name} className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-900">{preset.label}</h3>
              <p className="text-sm text-gray-400 mt-0.5">{preset.description}</p>
            </div>
            <button
              className="text-sm bg-primary-600 text-white px-4 py-1.5 rounded-lg hover:bg-primary-700 disabled:opacity-50 cursor-pointer"
              onClick={() => handleApply(name)}
              disabled={applying === name}
            >
              {applying === name ? '应用中...' : '应用'}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {Object.entries(preset.models).map(([tier, config]) => (
              <div key={tier} className="bg-warm-50 rounded-lg p-3">
                <div className="text-xs text-gray-400 mb-1">{TIER_LABELS[tier] ?? tier}</div>
                <div className="text-sm font-mono">
                  <span className="text-gray-500">temp:</span>{' '}
                  <span className="font-semibold text-gray-700">{config.temperature}</span>
                  <span className="text-gray-300 mx-1">|</span>
                  <span className="text-gray-500">tokens:</span>{' '}
                  <span className="font-semibold text-gray-700">{config.maxTokens}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Stats Tab ───

const STAGE_NAME_MAP: Record<string, string> = {
  input: '输入分析',
  clarify: '追问生成',
  refine: '回答完善',
  world_building: '世界观',
  character_design: '角色设计',
  outline: '大纲',
};

function formatStage(stage: string): string {
  if (STAGE_NAME_MAP[stage]) return STAGE_NAME_MAP[stage];
  if (stage.startsWith('chapter_')) return `第 ${stage.split('_')[1]} 章`;
  if (stage.startsWith('summary_')) return `摘要 ${stage.split('_')[1]}`;
  if (stage.startsWith('compress_')) return `压缩 ${stage.split('_')[1]}`;
  return stage;
}

const RATING_LABELS: Record<string, { text: string; color: string }> = {
  satisfied: { text: '满意', color: 'text-primary-700 bg-primary-50' },
  unsatisfied: { text: '不满意', color: 'text-red-600 bg-red-50' },
};

const TARGET_LABELS: Record<string, string> = {
  world: '世界观',
  characters: '角色设计',
  outline: '大纲',
  chapter: '章节',
};

function StatsTab() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [feedback, setFeedback] = useState<FeedbackRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [globalStats, setGlobalStats] = useState<{ totalTokens: number; totalCalls: number; projectCount: number; feedbackCount: number; satisfiedCount: number } | null>(null);

  useEffect(() => {
    listProjects().then(async (ps) => {
      setProjects(ps);
      if (ps.length > 0) setSelectedId(ps[0].id);
      const allData = await Promise.all(ps.map(async (p) => {
        const [u, f] = await Promise.all([getUsage(p.id), getFeedback(p.id)]);
        return { usage: u, feedback: f };
      }));
      const totalTokens = allData.reduce((s, d) => s + d.usage.total.totalTokens, 0);
      const totalCalls = allData.reduce((s, d) => s + d.usage.total.calls, 0);
      const allFeedback = allData.flatMap((d) => d.feedback);
      setGlobalStats({
        totalTokens,
        totalCalls,
        projectCount: ps.length,
        feedbackCount: allFeedback.length,
        satisfiedCount: allFeedback.filter((f) => f.rating === 'satisfied').length,
      });
    });
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    Promise.all([getUsage(selectedId), getFeedback(selectedId)])
      .then(([u, f]) => { setUsage(u); setFeedback(f); })
      .finally(() => setLoading(false));
  }, [selectedId]);

  return (
    <div className="space-y-6">
      {/* Global summary */}
      {globalStats && (
        <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
          <h3 className="font-serif font-semibold text-gray-900 text-sm mb-4">全局汇总</h3>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            <div className="bg-primary-50 rounded-xl p-3 text-center">
              <div className="text-lg font-bold text-primary-700">{globalStats.totalTokens.toLocaleString()}</div>
              <div className="text-xs text-primary-500">总 Tokens</div>
            </div>
            <div className="bg-warm-50 rounded-xl p-3 text-center">
              <div className="text-lg font-bold text-gray-700">{globalStats.totalCalls}</div>
              <div className="text-xs text-gray-500">总调用次数</div>
            </div>
            <div className="bg-warm-50 rounded-xl p-3 text-center">
              <div className="text-lg font-bold text-gray-700">{globalStats.projectCount}</div>
              <div className="text-xs text-gray-500">项目数</div>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <div className="text-lg font-bold text-green-700">{globalStats.satisfiedCount}</div>
              <div className="text-xs text-green-500">满意</div>
            </div>
            <div className="bg-red-50 rounded-xl p-3 text-center">
              <div className="text-lg font-bold text-red-700">{globalStats.feedbackCount - globalStats.satisfiedCount}</div>
              <div className="text-xs text-red-500">不满意</div>
            </div>
          </div>
        </div>
      )}

      {/* Project selector */}
      <div>
        <label className="block text-xs text-gray-400 mb-1 font-medium">选择项目查看详情</label>
        <select
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title} — {p.status}
            </option>
          ))}
        </select>
      </div>

      {loading && <div className="text-gray-400 text-center py-8 font-serif italic">加载中...</div>}

      {!loading && usage && (
        <>
          {/* Token usage */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-50">
              <h3 className="font-serif font-semibold text-gray-900 text-sm">Token 用量</h3>
            </div>

            {usage.total.calls === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-gray-400 font-serif italic">
                该项目暂无用量数据
              </div>
            ) : (
              <div className="px-6 py-4">
                {/* Summary cards */}
                <div className="grid grid-cols-4 gap-3 mb-4">
                  <div className="bg-primary-50 rounded-xl p-3 text-center">
                    <div className="text-lg font-bold text-primary-700">{usage.total.totalTokens.toLocaleString()}</div>
                    <div className="text-xs text-primary-500">总 Tokens</div>
                  </div>
                  <div className="bg-warm-50 rounded-xl p-3 text-center">
                    <div className="text-lg font-bold text-gray-700">{usage.total.promptTokens.toLocaleString()}</div>
                    <div className="text-xs text-gray-500">Prompt</div>
                  </div>
                  <div className="bg-warm-50 rounded-xl p-3 text-center">
                    <div className="text-lg font-bold text-gray-700">{usage.total.completionTokens.toLocaleString()}</div>
                    <div className="text-xs text-gray-500">Completion</div>
                  </div>
                  <div className="bg-warm-50 rounded-xl p-3 text-center">
                    <div className="text-lg font-bold text-gray-700">{usage.total.calls}</div>
                    <div className="text-xs text-gray-500">调用次数</div>
                  </div>
                </div>

                {/* Detail table */}
                <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[500px]">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-100">
                      <th className="text-left py-2.5 font-medium">阶段</th>
                      <th className="text-left py-2.5 font-medium">模型</th>
                      <th className="text-right py-2.5 font-medium">Prompt</th>
                      <th className="text-right py-2.5 font-medium">Completion</th>
                      <th className="text-right py-2.5 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.stages.map((s) => (
                      <tr key={s.stage} className="border-b border-gray-50 hover:bg-warm-50">
                        <td className="py-2.5 text-gray-700">{formatStage(s.stage)}</td>
                        <td className="py-2.5 text-gray-400 font-mono">{s.model.split('/').pop()}</td>
                        <td className="py-2.5 text-right text-gray-600">{s.promptTokens.toLocaleString()}</td>
                        <td className="py-2.5 text-right text-gray-600">{s.completionTokens.toLocaleString()}</td>
                        <td className="py-2.5 text-right font-medium text-gray-800">{s.totalTokens.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-200 font-medium">
                      <td className="py-2.5 text-gray-800" colSpan={2}>合计</td>
                      <td className="py-2.5 text-right text-gray-800">{usage.total.promptTokens.toLocaleString()}</td>
                      <td className="py-2.5 text-right text-gray-800">{usage.total.completionTokens.toLocaleString()}</td>
                      <td className="py-2.5 text-right text-gray-900">{usage.total.totalTokens.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
                </div>
              </div>
            )}
          </div>

          {/* User feedback */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-50">
              <h3 className="font-serif font-semibold text-gray-900 text-sm">用户反馈</h3>
            </div>

            {feedback.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-gray-400 font-serif italic">
                该项目暂无反馈
              </div>
            ) : (
              <div className="px-6 py-3">
                <div className="space-y-1">
                  {feedback.map((f) => {
                    const ratingInfo = RATING_LABELS[f.rating] ?? { text: f.rating, color: 'text-gray-600 bg-gray-50' };
                    return (
                      <div key={f.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-700">
                            {TARGET_LABELS[f.targetType] ?? f.targetType}
                            {f.targetId && ` ${f.targetId}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium ${ratingInfo.color}`}>
                            {ratingInfo.text}
                          </span>
                          <span className="text-xs text-gray-300">
                            {new Date(f.createdAt).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
