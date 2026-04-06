import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router';
import { getProject, getExportUrl, approveStage, rejectStage, pauseGeneration, submitClarification, getUsage, getFeedback, submitFeedback, type ProjectDetail, type UsageSummary, type FeedbackRecord } from '../api';
import { useSSE, type SSEEvent } from '../hooks/useSSE';

const STAGE_LABELS: Record<string, string> = {
  input: '分析输入',
  clarifying: '补充信息',
  world_building: '构建世界观',
  review_world: '确认世界观',
  character_design: '设计角色',
  review_characters: '确认角色',
  outline: '生成大纲',
  review_outline: '确认大纲',
  generating: '生成章节',
  paused: '已暂停',
  complete: '完成',
};

const STAGES = [
  'input', 'clarifying', 'world_building', 'review_world',
  'character_design', 'review_characters',
  'outline', 'review_outline',
  'generating', 'paused', 'complete',
];

const REVIEW_STAGES = new Set(['review_world', 'review_characters', 'review_outline']);

const feedbackTargetMap: Record<string, string> = {
  review_world: 'world',
  review_characters: 'characters',
  review_outline: 'outline',
};

export default function Project() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [stage, setStage] = useState('input');
  const [streamingText, setStreamingText] = useState('');
  const [streamingChapter, setStreamingChapter] = useState(0);
  const [sseUrl, setSseUrl] = useState<string | null>(null);
  const [selectedChapter, setSelectedChapter] = useState(1);
  const [actionLoading, setActionLoading] = useState(false);
  const [clarifyQuestions, setClarifyQuestions] = useState<string[]>([]);
  const [stageStreamingText, setStageStreamingText] = useState('');
  const [usageData, setUsageData] = useState<UsageSummary | null>(null);
  const [feedbackData, setFeedbackData] = useState<FeedbackRecord[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const streamingRef = useRef('');
  const stageStreamingRef = useRef('');

  // 加载项目
  const loadProject = useCallback(async () => {
    if (!id) return;
    const p = await getProject(id);
    setProject(p);
    setStage(p.status);
    getUsage(id).then(setUsageData).catch(() => {});
    getFeedback(id).then(setFeedbackData).catch(() => {});
  }, [id]);

  useEffect(() => { loadProject(); }, [loadProject]);

  // 页面加载时，如果项目处于处理中状态，自动连接 SSE
  useEffect(() => {
    if (!project || !id || sseUrl) return;
    const processingStates = ['world_building', 'character_design', 'outline'];
    const reviewStates = ['clarifying', 'review_world', 'review_characters', 'review_outline'];
    if (processingStates.includes(project.status)) {
      setSseUrl(`/api/projects/${id}/stream`);
    } else if (project.status === 'generating') {
      setSseUrl(`/api/projects/${id}/stream/generate`);
    } else if (reviewStates.includes(project.status)) {
      // 审阅态需要先 loadProject 拿到数据，然后连 SSE 获取 review_ready 事件
      setSseUrl(`/api/projects/${id}/stream`);
    }
  }, [project, id, sseUrl]);

  // SSE 事件处理
  const handleSSE = useCallback((event: SSEEvent) => {
    switch (event.type) {
      case 'stage_changed':
        setStage(event.stage as string);
        stageStreamingRef.current = '';
        setStageStreamingText('');
        if (event.stage === 'paused') {
          setSseUrl(null);
          loadProject();
        }
        break;
      case 'stage_chunk':
        stageStreamingRef.current += event.text as string;
        setStageStreamingText(stageStreamingRef.current);
        break;
      case 'clarify_questions':
        setClarifyQuestions(event.questions as string[]);
        setStage('clarifying');
        setSseUrl(null);
        break;
      case 'review_ready':
        setStage(event.stage as string);
        setSseUrl(null);
        loadProject();
        break;
      case 'chunk':
        setStreamingChapter(event.chapterNumber as number);
        streamingRef.current += event.text as string;
        setStreamingText(streamingRef.current);
        break;
      case 'chapter_complete':
        streamingRef.current = '';
        setStreamingText('');
        loadProject();
        break;
      case 'complete':
        setSseUrl(null);
        loadProject();
        break;
      case 'usage':
        // 实时累加 usage 数据
        setUsageData((prev) => {
          const e = event as { stage: string; model: string; promptTokens: number; completionTokens: number; totalTokens: number };
          const stages = [...(prev?.stages ?? [])];
          const existing = stages.find((s) => s.stage === e.stage);
          if (existing) {
            existing.promptTokens += e.promptTokens;
            existing.completionTokens += e.completionTokens;
            existing.totalTokens += e.totalTokens;
            existing.calls += 1;
          } else {
            stages.push({ stage: e.stage, model: e.model, promptTokens: e.promptTokens, completionTokens: e.completionTokens, totalTokens: e.totalTokens, calls: 1 });
          }
          const total = {
            promptTokens: stages.reduce((s, r) => s + r.promptTokens, 0),
            completionTokens: stages.reduce((s, r) => s + r.completionTokens, 0),
            totalTokens: stages.reduce((s, r) => s + r.totalTokens, 0),
            calls: stages.reduce((s, r) => s + r.calls, 0),
          };
          return { stages, total };
        });
        break;
      case 'error':
        setSseUrl(null);
        setErrorMsg(`生成出错：${event.message}`);
        break;
    }
  }, [loadProject]);

  const { connected, retryExhausted, close: closeSSE } = useSSE(sseUrl, handleSSE);

  // 启动流水线
  const handleStart = () => {
    setSseUrl(`/api/projects/${id}/stream`);
  };

  // 审阅通过（可带编辑数据）
  const handleApprove = async (editedData?: unknown) => {
    if (!id) return;
    setActionLoading(true);
    setErrorMsg(null);
    try {
      closeSSE();
      const { nextStatus } = await approveStage(id, editedData);
      setStage(nextStatus);

      if (nextStatus === 'generating') {
        streamingRef.current = '';
        setStreamingText('');
        setSseUrl(`/api/projects/${id}/stream/generate`);
      } else {
        setSseUrl(`/api/projects/${id}/stream`);
      }
    } catch (err) {
      setErrorMsg(`操作失败：${(err as Error).message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // 驳回重新生成
  const handleReject = async () => {
    if (!id) return;
    setActionLoading(true);
    setErrorMsg(null);
    setConfirmReject(false);
    try {
      closeSSE();
      await rejectStage(id);
      setSseUrl(`/api/projects/${id}/stream`);
    } catch (err) {
      setErrorMsg(`驳回失败：${(err as Error).message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // 提交追问回答
  const handleClarify = async (answers: string[]) => {
    if (!id) return;
    setActionLoading(true);
    setErrorMsg(null);
    try {
      closeSSE();
      await submitClarification(id, answers);
      setSseUrl(`/api/projects/${id}/stream`);
    } catch (err) {
      setErrorMsg(`提交失败：${(err as Error).message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // 请求暂停
  const handlePause = async () => {
    if (!id) return;
    try {
      await pauseGeneration(id);
    } catch (err) {
      setErrorMsg(`暂停失败：${(err as Error).message}`);
    }
  };

  // 从暂停恢复
  const handleResume = () => {
    if (!id) return;
    streamingRef.current = '';
    setStreamingText('');
    setSseUrl(`/api/projects/${id}/stream/generate`);
  };

  if (!project) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">加载中...</div>;
  }

  const stageIndex = STAGES.indexOf(stage);
  const isProcessing = ['input', 'world_building', 'character_design', 'outline'].includes(stage) && sseUrl;
  const isReview = REVIEW_STAGES.has(stage);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-4 sm:px-6 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <Link to="/" className="text-gray-400 hover:text-gray-600 text-sm shrink-0">← 返回</Link>
          <h1 className="text-sm sm:text-lg font-semibold text-gray-900 truncate">{project.plotOutline?.premise ? project.plotOutline.premise.slice(0, 30) : '新项目'}</h1>
        </div>
        <div className="flex items-center gap-3">
          {connected && <span className="text-xs text-green-500">● 已连接</span>}
          {stage === 'complete' && (
            <a
              href={getExportUrl(id!)}
              className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded"
            >
              导出 Markdown
            </a>
          )}
        </div>
      </header>

      {/* 进度条 */}
      <div className="bg-white border-b px-6 py-3">
        <div className="hidden sm:flex items-center gap-1 max-w-3xl mx-auto">
          {STAGES.map((s, i) => (
            <div key={s} className="flex items-center flex-1">
              <div className={`
                h-2 flex-1 rounded-full transition-colors
                ${i < stageIndex ? 'bg-blue-500' : i === stageIndex ? 'bg-blue-400 animate-pulse' : 'bg-gray-200'}
              `} />
              {i < STAGES.length - 1 && <div className="w-1" />}
            </div>
          ))}
        </div>
        <div className="text-center text-xs text-gray-500 sm:mt-2">
          <span className="sm:hidden text-gray-400">{stageIndex + 1}/{STAGES.length} · </span>
          {STAGE_LABELS[stage] ?? stage}
        </div>
      </div>

      {/* 主体 */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {/* 错误提示 */}
        {errorMsg && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg flex items-center justify-between">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-red-600 ml-2 shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* SSE 连接断开提示 */}
        {retryExhausted && (
          <div className="mb-4 bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm px-4 py-3 rounded-lg flex items-center justify-between">
            <span>连接已断开，请刷新页面重试</span>
            <button
              onClick={() => window.location.reload()}
              className="text-yellow-700 font-medium hover:underline ml-2 shrink-0"
            >
              刷新
            </button>
          </div>
        )}

        {/* 待启动 */}
        {stage === 'input' && !sseUrl && (
          <div className="text-center py-20">
            <p className="text-gray-500 mb-4">准备好了吗？</p>
            <p className="text-sm text-gray-400 mb-6 max-w-md mx-auto">{project.userPrompt}</p>
            <button
              className="bg-blue-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-700"
              onClick={handleStart}
            >
              启动生成
            </button>
          </div>
        )}

        {/* 追问阶段 */}
        {stage === 'clarifying' && clarifyQuestions.length > 0 && (
          <ClarifyView
            questions={clarifyQuestions}
            onSubmit={handleClarify}
            loading={actionLoading}
          />
        )}

        {/* 处理中 */}
        {isProcessing && (
          <div className="py-10">
            <div className="text-center mb-6">
              <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-gray-600">{STAGE_LABELS[stage]}...</p>
            </div>
            {stageStreamingText && (
              <div className="bg-white rounded-lg border p-4 max-h-96 overflow-y-auto">
                <p className="text-xs text-gray-400 mb-2">实时生成预览</p>
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">{stageStreamingText}</pre>
              </div>
            )}
          </div>
        )}

        {/* 审阅阶段 */}
        {isReview && (
          <ReviewView
            project={project}
            stage={stage}
            onApprove={(editedData) => handleApprove(editedData)}
            onReject={handleReject}
            loading={actionLoading}
            feedbackData={feedbackData}
            onFeedback={async (targetType, rating) => {
              await submitFeedback(id!, targetType, '', rating);
              getFeedback(id!).then(setFeedbackData).catch(() => {});
            }}
          />
        )}

        {/* 生成中 */}
        {stage === 'generating' && (
          <GeneratingView
            project={project}
            streamingChapter={streamingChapter}
            streamingText={streamingText}
            onPause={handlePause}
          />
        )}

        {/* 暂停中 */}
        {stage === 'paused' && (
          <PausedView project={project} onResume={handleResume} />
        )}

        {/* 完成 */}
        {stage === 'complete' && (
          <CompleteView
            project={project}
            selectedChapter={selectedChapter}
            onSelectChapter={setSelectedChapter}
            feedbackData={feedbackData}
            onFeedback={async (targetType, targetId, rating) => {
              await submitFeedback(id!, targetType, targetId, rating);
              getFeedback(id!).then(setFeedbackData).catch(() => {});
            }}
          />
        )}

        {/* Token 用量 */}
        {usageData && usageData.total.calls > 0 && (
          <UsagePanel data={usageData} />
        )}
      </div>
    </div>
  );
}

function ReviewView({
  project,
  stage,
  onApprove,
  onReject,
  loading,
  feedbackData,
  onFeedback,
}: {
  project: ProjectDetail;
  stage: string;
  onApprove: (editedData?: unknown) => void;
  onReject: () => void;
  loading: boolean;
  feedbackData: FeedbackRecord[];
  onFeedback: (targetType: string, rating: 'satisfied' | 'unsatisfied') => void;
}) {
  const [editing, setEditing] = useState(false);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);

  const stageTitle: Record<string, string> = {
    review_world: '世界观',
    review_characters: '角色设计',
    review_outline: '章节大纲',
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-gray-800">请审阅{stageTitle[stage]}</h2>
        <p className="text-sm text-gray-500 mt-1">
          {editing ? '编辑完成后点击保存' : '确认后将继续下一步，也可以点击编辑进行修改'}
        </p>
      </div>

      {stage === 'review_world' && project.worldBuilding && (
        editing
          ? <WorldEditor data={project.worldBuilding} onSave={(data) => { onApprove(data); setEditing(false); }} onCancel={() => setEditing(false)} loading={loading} />
          : <WorldPreview data={project.worldBuilding} />
      )}

      {stage === 'review_characters' && project.characters.length > 0 && (
        editing
          ? <CharacterEditor data={project.characters} onSave={(data) => { onApprove(data); setEditing(false); }} onCancel={() => setEditing(false)} loading={loading} />
          : <CharacterPreview data={project.characters} />
      )}

      {stage === 'review_outline' && (
        <>
          {project.worldBuilding && (
            <section className="bg-gray-50 rounded-lg border p-4">
              <h3 className="text-sm font-semibold text-gray-500 mb-2">世界观</h3>
              <p className="text-xs text-gray-500">{project.worldBuilding.synopsis}</p>
            </section>
          )}
          {project.characters.length > 0 && (
            <section className="bg-gray-50 rounded-lg border p-4">
              <h3 className="text-sm font-semibold text-gray-500 mb-2">角色</h3>
              <div className="flex flex-wrap gap-2">
                {project.characters.map((c) => (
                  <span key={c.id} className="text-xs bg-white border px-2 py-1 rounded">{c.name} ({c.role})</span>
                ))}
              </div>
            </section>
          )}
          {project.plotOutline && (
            editing
              ? <OutlineEditor data={project.plotOutline} onSave={(data) => { onApprove(data); setEditing(false); }} onCancel={() => setEditing(false)} loading={loading} />
              : <OutlinePreview data={project.plotOutline} />
          )}
        </>
      )}

      {/* 反馈 */}
      {!editing && (
        <FeedbackButtons
          currentRating={feedbackData.find((f) => f.targetType === feedbackTargetMap[stage])?.rating}
          onRate={(rating) => onFeedback(feedbackTargetMap[stage], rating)}
        />
      )}

      {/* 操作按钮 */}
      {!editing && !showRejectConfirm && (
        <div className="flex flex-wrap items-center justify-center gap-3 py-4">
          <button
            className="text-gray-500 border border-gray-300 px-6 py-2.5 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
            onClick={() => setShowRejectConfirm(true)}
            disabled={loading}
          >
            驳回，重新生成
          </button>
          <button
            className="text-blue-600 border border-blue-300 px-6 py-2.5 rounded-lg text-sm hover:bg-blue-50 disabled:opacity-50"
            onClick={() => setEditing(true)}
            disabled={loading}
          >
            编辑
          </button>
          <button
            className="bg-green-600 text-white px-8 py-2.5 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
            onClick={() => onApprove()}
            disabled={loading}
          >
            {stage === 'review_outline' ? '确认，开始生成' : '确认，继续'}
          </button>
        </div>
      )}

      {/* 驳回确认 */}
      {!editing && showRejectConfirm && (
        <div className="py-4 text-center space-y-3">
          <p className="text-sm text-red-600">确认驳回并重新生成{stageTitle[stage]}？</p>
          <div className="flex items-center justify-center gap-3">
            <button
              className="text-sm text-gray-500 border border-gray-300 px-5 py-2 rounded-lg hover:bg-gray-50"
              onClick={() => setShowRejectConfirm(false)}
            >
              取消
            </button>
            <button
              className="text-sm text-white bg-red-500 font-medium px-5 py-2 rounded-lg hover:bg-red-600 disabled:opacity-50"
              onClick={onReject}
              disabled={loading}
            >
              {loading ? '处理中...' : '确认驳回'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 预览组件 ───

function WorldPreview({ data }: { data: NonNullable<ProjectDetail['worldBuilding']> }) {
  return (
    <section className="bg-white rounded-lg border p-5">
      <h3 className="font-semibold mb-3">世界观</h3>
      <p className="text-sm text-gray-600 mb-3">{data.synopsis}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div><span className="text-gray-400">时代:</span> {data.era}</div>
        <div><span className="text-gray-400">基调:</span> {data.tone}</div>
        <div><span className="text-gray-400">背景:</span> {data.setting}</div>
        <div className="sm:col-span-2"><span className="text-gray-400">主题:</span> {data.themes.join('、')}</div>
        {data.rules.length > 0 && (
          <div className="sm:col-span-2"><span className="text-gray-400">规则:</span> {data.rules.join('、')}</div>
        )}
      </div>
    </section>
  );
}

function CharacterPreview({ data }: { data: ProjectDetail['characters'] }) {
  return (
    <section className="bg-white rounded-lg border p-5">
      <h3 className="font-semibold mb-3">角色 ({data.length})</h3>
      <div className="space-y-3">
        {data.map((c) => (
          <div key={c.id} className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-medium">{c.name}</span>
              <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{c.role}</span>
            </div>
            <p className="text-xs text-gray-600 mb-1">{c.description}</p>
            <p className="text-xs text-gray-500"><span className="text-gray-400">动机:</span> {c.motivations.join('、')}</p>
            <p className="text-xs text-gray-500"><span className="text-gray-400">成长弧:</span> {c.arc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function OutlinePreview({ data }: { data: NonNullable<ProjectDetail['plotOutline']> }) {
  return (
    <section className="bg-white rounded-lg border p-5">
      <h3 className="font-semibold mb-1">章节大纲 ({data.totalChapters} 章)</h3>
      <p className="text-sm text-gray-500 mb-3">{data.premise}</p>
      <div className="space-y-2">
        {data.acts.flatMap((act) =>
          act.chapters.map((ch) => (
            <div key={ch.number} className="border-l-2 border-blue-200 pl-3 py-1">
              <div className="text-sm font-medium">第 {ch.number} 章：{ch.title}</div>
              <div className="text-xs text-gray-500 mt-0.5">{ch.summary.slice(0, 100)}...</div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

// ─── 编辑组件 ───

const inputClass = 'w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400';
const textareaClass = `${inputClass} resize-y`;
const labelClass = 'block text-xs text-gray-500 mb-1';

function WorldEditor({
  data,
  onSave,
  onCancel,
  loading,
}: {
  data: NonNullable<ProjectDetail['worldBuilding']>;
  onSave: (data: unknown) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState({ ...data, themes: [...data.themes], rules: [...data.rules] });
  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <section className="bg-white rounded-lg border p-5 space-y-3">
      <h3 className="font-semibold">编辑世界观</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>时代</label>
          <input className={inputClass} value={form.era} onChange={(e) => set('era', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>基调</label>
          <input className={inputClass} value={form.tone} onChange={(e) => set('tone', e.target.value)} />
        </div>
      </div>
      <div>
        <label className={labelClass}>背景</label>
        <textarea className={textareaClass} rows={2} value={form.setting} onChange={(e) => set('setting', e.target.value)} />
      </div>
      <div>
        <label className={labelClass}>主题（逗号分隔）</label>
        <input className={inputClass} value={form.themes.join('、')} onChange={(e) => setForm((f) => ({ ...f, themes: e.target.value.split(/[、,]/).map((s) => s.trim()).filter(Boolean) }))} />
      </div>
      <div>
        <label className={labelClass}>规则（逗号分隔）</label>
        <input className={inputClass} value={form.rules.join('、')} onChange={(e) => setForm((f) => ({ ...f, rules: e.target.value.split(/[、,]/).map((s) => s.trim()).filter(Boolean) }))} />
      </div>
      <div>
        <label className={labelClass}>概要</label>
        <textarea className={textareaClass} rows={4} value={form.synopsis} onChange={(e) => set('synopsis', e.target.value)} />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button className="text-gray-500 text-sm px-4 py-2 hover:bg-gray-50 rounded" onClick={onCancel}>取消</button>
        <button className="bg-green-600 text-white text-sm px-6 py-2 rounded hover:bg-green-700 disabled:opacity-50" onClick={() => onSave(form)} disabled={loading}>
          保存并继续
        </button>
      </div>
    </section>
  );
}

function CharacterEditor({
  data,
  onSave,
  onCancel,
  loading,
}: {
  data: ProjectDetail['characters'];
  onSave: (data: unknown) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [chars, setChars] = useState(data.map((c) => ({ ...c, motivations: [...c.motivations] })));
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const updateChar = (id: string, key: string, value: string | string[]) => {
    setChars((prev) => prev.map((c) => c.id === id ? { ...c, [key]: value } : c));
  };

  return (
    <section className="bg-white rounded-lg border p-5 space-y-3">
      <h3 className="font-semibold">编辑角色 ({chars.length})</h3>
      {chars.map((c) => (
        <div key={c.id} className="border rounded-lg p-3">
          <button
            className="w-full flex items-center justify-between text-left"
            onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
          >
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{c.name}</span>
              <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{c.role}</span>
            </div>
            <span className="text-gray-400 text-xs">{expandedId === c.id ? '收起' : '展开'}</span>
          </button>
          {expandedId === c.id && (
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>名字</label>
                  <input className={inputClass} value={c.name} onChange={(e) => updateChar(c.id, 'name', e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>角色</label>
                  <select className={inputClass} value={c.role} onChange={(e) => updateChar(c.id, 'role', e.target.value)}>
                    <option value="protagonist">protagonist</option>
                    <option value="antagonist">antagonist</option>
                    <option value="supporting">supporting</option>
                    <option value="minor">minor</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={labelClass}>描述</label>
                <textarea className={textareaClass} rows={2} value={c.description} onChange={(e) => updateChar(c.id, 'description', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>背景故事</label>
                <textarea className={textareaClass} rows={2} value={c.backstory} onChange={(e) => updateChar(c.id, 'backstory', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>动机（逗号分隔）</label>
                <input className={inputClass} value={c.motivations.join('、')} onChange={(e) => updateChar(c.id, 'motivations', e.target.value.split(/[、,]/).map((s) => s.trim()).filter(Boolean))} />
              </div>
              <div>
                <label className={labelClass}>语言风格</label>
                <input className={inputClass} value={c.voiceNotes} onChange={(e) => updateChar(c.id, 'voiceNotes', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>角色弧线</label>
                <textarea className={textareaClass} rows={2} value={c.arc} onChange={(e) => updateChar(c.id, 'arc', e.target.value)} />
              </div>
            </div>
          )}
        </div>
      ))}
      <div className="flex justify-end gap-3 pt-2">
        <button className="text-gray-500 text-sm px-4 py-2 hover:bg-gray-50 rounded" onClick={onCancel}>取消</button>
        <button className="bg-green-600 text-white text-sm px-6 py-2 rounded hover:bg-green-700 disabled:opacity-50" onClick={() => onSave(chars)} disabled={loading}>
          保存并继续
        </button>
      </div>
    </section>
  );
}

function OutlineEditor({
  data,
  onSave,
  onCancel,
  loading,
}: {
  data: NonNullable<ProjectDetail['plotOutline']>;
  onSave: (data: unknown) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [outline, setOutline] = useState(JSON.parse(JSON.stringify(data)));
  const [expandedCh, setExpandedCh] = useState<number | null>(null);

  const updateChapter = (actIdx: number, chIdx: number, key: string, value: string | string[]) => {
    setOutline((prev: typeof data) => {
      const next = JSON.parse(JSON.stringify(prev));
      next.acts[actIdx].chapters[chIdx][key] = value;
      return next;
    });
  };

  return (
    <section className="bg-white rounded-lg border p-5 space-y-3">
      <h3 className="font-semibold">编辑大纲</h3>
      <div>
        <label className={labelClass}>故事前提</label>
        <input className={inputClass} value={outline.premise} onChange={(e) => setOutline((p: typeof data) => ({ ...p, premise: e.target.value }))} />
      </div>
      {outline.acts.map((act: typeof data.acts[0], actIdx: number) => (
        <div key={act.number} className="border-l-2 border-gray-200 pl-3 space-y-2">
          <div className="text-sm font-medium text-gray-600">第 {act.number} 幕：{act.title}</div>
          {act.chapters.map((ch: typeof act.chapters[0], chIdx: number) => (
            <div key={ch.number} className="border rounded p-2">
              <button
                className="w-full flex items-center justify-between text-left text-sm"
                onClick={() => setExpandedCh(expandedCh === ch.number ? null : ch.number)}
              >
                <span>第 {ch.number} 章：{ch.title}</span>
                <span className="text-gray-400 text-xs">{expandedCh === ch.number ? '收起' : '展开'}</span>
              </button>
              {expandedCh === ch.number && (
                <div className="mt-2 space-y-2">
                  <div>
                    <label className={labelClass}>标题</label>
                    <input className={inputClass} value={ch.title} onChange={(e) => updateChapter(actIdx, chIdx, 'title', e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>摘要</label>
                    <textarea className={textareaClass} rows={3} value={ch.summary} onChange={(e) => updateChapter(actIdx, chIdx, 'summary', e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>关键事件（逗号分隔）</label>
                    <input className={inputClass} value={ch.keyEvents.join('、')} onChange={(e) => updateChapter(actIdx, chIdx, 'keyEvents', e.target.value.split(/[、,]/).map((s: string) => s.trim()).filter(Boolean))} />
                  </div>
                  <div>
                    <label className={labelClass}>章尾钩子</label>
                    <input className={inputClass} value={ch.endHook} onChange={(e) => updateChapter(actIdx, chIdx, 'endHook', e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
      <div className="flex justify-end gap-3 pt-2">
        <button className="text-gray-500 text-sm px-4 py-2 hover:bg-gray-50 rounded" onClick={onCancel}>取消</button>
        <button className="bg-green-600 text-white text-sm px-6 py-2 rounded hover:bg-green-700 disabled:opacity-50" onClick={() => onSave(outline)} disabled={loading}>
          保存并继续
        </button>
      </div>
    </section>
  );
}

function GeneratingView({
  project,
  streamingChapter,
  streamingText,
  onPause,
}: {
  project: ProjectDetail;
  streamingChapter: number;
  streamingText: string;
  onPause: () => void;
}) {
  const textRef = useRef<HTMLDivElement>(null);
  const [pauseRequested, setPauseRequested] = useState(false);

  useEffect(() => {
    if (textRef.current) {
      textRef.current.scrollTop = textRef.current.scrollHeight;
    }
  }, [streamingText]);

  const handlePause = () => {
    setPauseRequested(true);
    onPause();
  };

  return (
    <div>
      {/* 已完成的章节 */}
      {project.chapters.map((ch) => (
        <div key={ch.id} className="mb-4 text-sm text-gray-400">
          ✓ 第 {ch.number} 章：{ch.title} ({ch.charCount} 字)
        </div>
      ))}

      {/* 正在生成的章节 */}
      {streamingChapter > 0 && (
        <div className="bg-white rounded-lg border p-5">
          <h3 className="font-semibold mb-3">
            第 {streamingChapter} 章
            <span className="ml-2 inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          </h3>
          <div
            ref={textRef}
            className="prose prose-sm max-h-96 overflow-y-auto whitespace-pre-wrap text-gray-700"
          >
            {streamingText}
          </div>
        </div>
      )}

      {/* 暂停按钮 */}
      <div className="text-center mt-6">
        <button
          className="text-sm text-gray-500 border border-gray-300 px-5 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          onClick={handlePause}
          disabled={pauseRequested}
        >
          {pauseRequested ? '等待当前章节完成后暂停...' : '暂停（完成当前章后暂停）'}
        </button>
      </div>
    </div>
  );
}

function PausedView({
  project,
  onResume,
}: {
  project: ProjectDetail;
  onResume: () => void;
}) {
  const totalChapters = project.plotOutline?.totalChapters ?? 0;

  return (
    <div>
      <div className="text-center mb-6">
        <h2 className="text-lg font-semibold text-gray-800">生成已暂停</h2>
        <p className="text-sm text-gray-500 mt-1">
          已完成 {project.chapters.length} / {totalChapters} 章
        </p>
      </div>

      {/* 已完成的章节列表 */}
      <div className="bg-white rounded-lg border p-5 mb-6">
        {project.chapters.map((ch) => (
          <div key={ch.id} className="py-2 border-b last:border-b-0">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">第 {ch.number} 章：{ch.title}</span>
              <span className="text-xs text-gray-400">{ch.charCount} 字</span>
            </div>
          </div>
        ))}
      </div>

      <div className="text-center">
        <button
          className="bg-blue-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-700"
          onClick={onResume}
        >
          继续生成
        </button>
      </div>
    </div>
  );
}

function ClarifyView({
  questions,
  onSubmit,
  loading,
}: {
  questions: string[];
  onSubmit: (answers: string[]) => void;
  loading: boolean;
}) {
  const [answers, setAnswers] = useState<string[]>(questions.map(() => ''));

  const updateAnswer = (index: number, value: string) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const canSubmit = answers.some((a) => a.trim().length > 0);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-6">
        <h2 className="text-lg font-semibold text-gray-800">补充几个问题</h2>
        <p className="text-sm text-gray-500 mt-1">回答以下问题可以帮助 Agent 更好地理解你的创作意图（可以只回答部分）</p>
      </div>

      <div className="space-y-4">
        {questions.map((q, i) => (
          <div key={i} className="bg-white rounded-lg border p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">{q}</label>
            <textarea
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 resize-y"
              rows={2}
              placeholder="你的回答..."
              value={answers[i]}
              onChange={(e) => updateAnswer(i, e.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="text-center mt-6">
        <button
          className="bg-blue-600 text-white px-8 py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          onClick={() => onSubmit(answers)}
          disabled={!canSubmit || loading}
        >
          {loading ? '正在完善分析...' : '提交回答，继续'}
        </button>
      </div>
    </div>
  );
}

type SidebarTab = 'chapters' | 'world' | 'characters' | 'outline';

function CompleteView({
  project,
  selectedChapter,
  onSelectChapter,
  feedbackData,
  onFeedback,
}: {
  project: ProjectDetail;
  selectedChapter: number;
  onSelectChapter: (n: number) => void;
  feedbackData: FeedbackRecord[];
  onFeedback: (targetType: string, targetId: string, rating: 'satisfied' | 'unsatisfied') => void;
}) {
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('chapters');
  const chapter = project.chapters.find((c) => c.number === selectedChapter);

  const tabClass = (tab: SidebarTab) =>
    `text-xs px-2 py-1 rounded ${sidebarTab === tab ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-500 hover:bg-gray-100'}`;

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* 左侧导航面板 */}
      <nav className="w-full lg:w-56 shrink-0">
        <div className="bg-white rounded-lg border p-3 lg:sticky lg:top-6">
          {/* Tab 切换 */}
          <div className="flex gap-1 mb-3 pb-2 border-b">
            <button className={tabClass('chapters')} onClick={() => setSidebarTab('chapters')}>章节</button>
            <button className={tabClass('world')} onClick={() => setSidebarTab('world')}>世界观</button>
            <button className={tabClass('characters')} onClick={() => setSidebarTab('characters')}>角色</button>
            <button className={tabClass('outline')} onClick={() => setSidebarTab('outline')}>大纲</button>
          </div>

          {/* 章节列表 */}
          {sidebarTab === 'chapters' && (
            <>
              {project.chapters.map((ch) => (
                <button
                  key={ch.id}
                  className={`block w-full text-left text-sm px-2 py-1.5 rounded ${
                    ch.number === selectedChapter ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                  onClick={() => onSelectChapter(ch.number)}
                >
                  {ch.number}. {ch.title}
                </button>
              ))}
              <div className="text-xs text-gray-400 mt-3 pt-2 border-t">
                总字数: {project.chapters.reduce((s, c) => s + c.charCount, 0).toLocaleString()}
              </div>
            </>
          )}

          {/* 世界观 */}
          {sidebarTab === 'world' && project.worldBuilding && (
            <div className="text-xs space-y-2">
              <p className="text-gray-700">{project.worldBuilding.synopsis}</p>
              <div className="pt-2 border-t space-y-1">
                <div><span className="text-gray-400">时代:</span> {project.worldBuilding.era}</div>
                <div><span className="text-gray-400">基调:</span> {project.worldBuilding.tone}</div>
                <div><span className="text-gray-400">背景:</span> {project.worldBuilding.setting}</div>
                <div><span className="text-gray-400">主题:</span> {project.worldBuilding.themes.join('、')}</div>
                {project.worldBuilding.rules.length > 0 && (
                  <div><span className="text-gray-400">规则:</span> {project.worldBuilding.rules.join('；')}</div>
                )}
              </div>
            </div>
          )}

          {/* 角色卡 */}
          {sidebarTab === 'characters' && (
            <div className="space-y-2">
              {project.characters.map((c) => {
                const charMap = new Map(project.characters.map((ch) => [ch.id, ch.name]));
                return (
                  <div key={c.id} className="text-xs border rounded p-2">
                    <div className="flex items-center gap-1 mb-1">
                      <span className="font-medium text-gray-800">{c.name}</span>
                      <span className="text-[10px] bg-gray-100 px-1 rounded">{c.role}</span>
                    </div>
                    <p className="text-gray-500 mb-1">{c.description}</p>
                    <p className="text-gray-400"><span className="text-gray-400">背景:</span> {c.backstory}</p>
                    <p className="text-gray-400"><span className="text-gray-400">动机:</span> {c.motivations.join('、')}</p>
                    <p className="text-gray-400"><span className="text-gray-400">语言风格:</span> {c.voiceNotes}</p>
                    <p className="text-gray-400"><span className="text-gray-400">弧线:</span> {c.arc}</p>
                    {c.relationships?.length > 0 && (
                      <div className="mt-1 pt-1 border-t border-gray-100">
                        <span className="text-gray-400">关系:</span>
                        {c.relationships.map((r, i) => (
                          <p key={i} className="text-gray-400 pl-2">→ {charMap.get(r.targetCharacterId) ?? '?'} ({r.type}): {r.description}</p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 大纲 */}
          {sidebarTab === 'outline' && project.plotOutline && (
            <div className="text-xs space-y-1">
              <p className="text-gray-600 mb-2">{project.plotOutline.premise}</p>
              {project.plotOutline.acts.map((act) => (
                <div key={act.number} className="mb-3">
                  <div className="font-medium text-gray-500">第 {act.number} 幕：{act.title}</div>
                  <p className="text-gray-400 mb-1">{act.summary}</p>
                  {act.chapters.map((ch) => (
                    <div key={ch.number} className="pl-2 py-1.5 border-l-2 border-gray-200 mb-1">
                      <div className="text-gray-600">{ch.number}. {ch.title}</div>
                      <p className="text-gray-400">{ch.summary}</p>
                      {ch.keyEvents.length > 0 && (
                        <p className="text-gray-400"><span className="text-gray-400">关键事件:</span> {ch.keyEvents.join('；')}</p>
                      )}
                      {ch.charactersInvolved.length > 0 && (
                        <p className="text-gray-400"><span className="text-gray-400">出场角色:</span> {ch.charactersInvolved.join('、')}</p>
                      )}
                      <p className="text-gray-400"><span className="text-gray-400">章尾钩子:</span> {ch.endHook}</p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* 右侧阅读区 */}
      <main className="flex-1 bg-white rounded-lg border p-8 min-h-[60vh]">
        {chapter ? (
          <>
            <h2 className="text-xl font-bold mb-6">第 {chapter.number} 章：{chapter.title}</h2>
            <div className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-800 leading-relaxed">
              {chapter.content}
            </div>
            <div className="mt-6 pt-4 border-t">
              <FeedbackButtons
                currentRating={feedbackData.find((f) => f.targetType === 'chapter' && f.targetId === String(chapter.number))?.rating}
                onRate={(rating) => onFeedback('chapter', String(chapter.number), rating)}
              />
            </div>
          </>
        ) : (
          <p className="text-gray-400">选择一个章节开始阅读</p>
        )}
      </main>
    </div>
  );
}

// ─── 反馈按钮 ───

function FeedbackButtons({
  currentRating,
  onRate,
}: {
  currentRating?: string;
  onRate: (rating: 'satisfied' | 'unsatisfied') => void;
}) {
  return (
    <div className="flex items-center justify-center gap-3 py-2">
      <span className="text-xs text-gray-400">对这个结果满意吗？</span>
      <button
        className={`p-1.5 rounded-md transition-colors ${currentRating === 'satisfied' ? 'bg-green-100 text-green-600' : 'text-gray-300 hover:text-green-500 hover:bg-green-50'}`}
        onClick={() => onRate('satisfied')}
        title="满意"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
        </svg>
      </button>
      <button
        className={`p-1.5 rounded-md transition-colors ${currentRating === 'unsatisfied' ? 'bg-red-100 text-red-600' : 'text-gray-300 hover:text-red-500 hover:bg-red-50'}`}
        onClick={() => onRate('unsatisfied')}
        title="不满意"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
        </svg>
      </button>
    </div>
  );
}

// ─── Token 用量面板 ───

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

function UsagePanel({ data }: { data: UsageSummary }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-8 bg-white rounded-lg border">
      <button
        className="w-full px-5 py-3 flex items-center justify-between text-left"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Token 用量</span>
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
            {data.total.totalTokens.toLocaleString()} tokens / {data.total.calls} 次调用
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-5 pb-4 border-t">
          <table className="w-full text-xs mt-3">
            <thead>
              <tr className="text-gray-400 border-b">
                <th className="text-left py-2 font-medium">阶段</th>
                <th className="text-left py-2 font-medium">模型</th>
                <th className="text-right py-2 font-medium">Prompt</th>
                <th className="text-right py-2 font-medium">Completion</th>
                <th className="text-right py-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.stages.map((s) => (
                <tr key={s.stage} className="border-b border-gray-50">
                  <td className="py-2 text-gray-700">{formatStage(s.stage)}</td>
                  <td className="py-2 text-gray-400 font-mono">{s.model.split('/').pop()}</td>
                  <td className="py-2 text-right text-gray-600">{s.promptTokens.toLocaleString()}</td>
                  <td className="py-2 text-right text-gray-600">{s.completionTokens.toLocaleString()}</td>
                  <td className="py-2 text-right font-medium text-gray-800">{s.totalTokens.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-medium">
                <td className="py-2 text-gray-800" colSpan={2}>Total</td>
                <td className="py-2 text-right text-gray-800">{data.total.promptTokens.toLocaleString()}</td>
                <td className="py-2 text-right text-gray-800">{data.total.completionTokens.toLocaleString()}</td>
                <td className="py-2 text-right text-gray-900">{data.total.totalTokens.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
