import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  getPrompts, updatePrompt, resetPrompt,
  getModelsConfig, updateModelConfig, resetModelConfig,
  getPresets, applyPreset,
  type PromptInfo, type ModelInfo, type PresetInfo,
} from '../api';

type Tab = 'models' | 'prompts' | 'presets';

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 2500);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
      <div className="bg-gray-900 text-white text-sm px-5 py-2.5 rounded-lg shadow-lg flex items-center gap-2">
        <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

export default function Settings() {
  const [tab, setTab] = useState<Tab>('models');
  const [toast, setToast] = useState<string | null>(null);
  const navigate = useNavigate();

  const showToast = (message: string) => setToast(message);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
            <p className="text-gray-500 text-sm">管理模型、提示词和生成预设</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6">
          {([
            ['models', '模型配置'],
            ['prompts', '提示词管理'],
            ['presets', '生成预设'],
          ] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
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

  if (loading) return <div className="text-gray-400 text-center py-12">加载中...</div>;

  return (
    <div className="space-y-4">
      {Object.entries(models).map(([tier, info]) => (
        <div key={tier} className="bg-white rounded-lg border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">{TIER_LABELS[tier] ?? tier}</h3>
            {!info.isDefault && (
              <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">已自定义</span>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">模型名称</label>
              <input
                type="text"
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={info.config.model}
                onChange={(e) => updateField(tier, 'model', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Temperature: {info.config.temperature ?? 0}
                </label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  className="w-full"
                  value={info.config.temperature ?? 0}
                  onChange={(e) => updateField(tier, 'temperature', parseFloat(e.target.value))}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Max Tokens</label>
                <input
                  type="number"
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={info.config.maxTokens ?? 4000}
                  onChange={(e) => updateField(tier, 'maxTokens', parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            {!info.isDefault && (
              <button
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5"
                onClick={() => handleReset(tier)}
                disabled={saving === tier}
              >
                重置为默认
              </button>
            )}
            <button
              className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-50"
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

  if (loading) return <div className="text-gray-400 text-center py-12">加载中...</div>;

  return (
    <div className="space-y-2">
      {Object.entries(prompts).map(([key, info]) => (
        <div key={key} className="bg-white rounded-lg border">
          <button
            className="w-full px-5 py-4 flex items-center justify-between text-left"
            onClick={() => setExpanded(expanded === key ? null : key)}
          >
            <div className="flex items-center gap-3">
              <span className="font-medium text-gray-900 text-sm">{info.label}</span>
              {!info.isDefault && (
                <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">已自定义</span>
              )}
            </div>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${expanded === key ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {expanded === key && (
            <div className="px-5 pb-4 border-t">
              <textarea
                className="w-full border rounded-md p-3 text-sm mt-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                rows={8}
                value={editValues[key] ?? ''}
                onChange={(e) => setEditValues((prev) => ({ ...prev, [key]: e.target.value }))}
              />

              {!info.isDefault && (
                <details className="mt-2">
                  <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
                    查看默认值
                  </summary>
                  <pre className="mt-1 text-xs text-gray-400 bg-gray-50 rounded p-2 whitespace-pre-wrap">
                    {info.defaultValue}
                  </pre>
                </details>
              )}

              <div className="flex justify-end gap-2 mt-3">
                {!info.isDefault && (
                  <button
                    className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5"
                    onClick={() => handleReset(key)}
                    disabled={saving === key}
                  >
                    重置为默认
                  </button>
                )}
                <button
                  className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-50"
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

  if (loading) return <div className="text-gray-400 text-center py-12">加载中...</div>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 mb-2">
        预设会覆盖当前的模型配置（模型名称 + 参数）。应用后可在「模型配置」Tab 中查看和微调。
      </p>
      {Object.entries(presets).map(([name, preset]) => (
        <div key={name} className="bg-white rounded-lg border p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-gray-900">{preset.label}</h3>
              <p className="text-sm text-gray-500 mt-0.5">{preset.description}</p>
            </div>
            <button
              className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-50"
              onClick={() => handleApply(name)}
              disabled={applying === name}
            >
              {applying === name ? '应���中...' : '应用'}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {Object.entries(preset.models).map(([tier, config]) => (
              <div key={tier} className="bg-gray-50 rounded-md p-3">
                <div className="text-xs text-gray-500 mb-1">{TIER_LABELS[tier] ?? tier}</div>
                <div className="text-sm font-mono">
                  <span className="text-gray-600">temp:</span>{' '}
                  <span className="font-semibold">{config.temperature}</span>
                  <span className="text-gray-400 mx-1">|</span>
                  <span className="text-gray-600">tokens:</span>{' '}
                  <span className="font-semibold">{config.maxTokens}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
