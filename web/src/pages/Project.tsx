import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router';
import { getProject, getExportUrl, type ProjectDetail } from '../api';
import { useSSE, type SSEEvent } from '../hooks/useSSE';

const STAGE_LABELS: Record<string, string> = {
  input: '分析输入',
  world_building: '构建世界观',
  character_design: '设计角色',
  outline: '生成大纲',
  review: '审阅确认',
  generating: '生成章节',
  complete: '完成',
};

const STAGES = ['input', 'world_building', 'character_design', 'outline', 'review', 'generating', 'complete'];

export default function Project() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [stage, setStage] = useState('input');
  const [streamingText, setStreamingText] = useState('');
  const [streamingChapter, setStreamingChapter] = useState(0);
  const [sseUrl, setSseUrl] = useState<string | null>(null);
  const [selectedChapter, setSelectedChapter] = useState(1);
  const streamingRef = useRef('');

  // 加载项目
  const loadProject = useCallback(async () => {
    if (!id) return;
    const p = await getProject(id);
    setProject(p);
    setStage(p.status);
  }, [id]);

  useEffect(() => { loadProject(); }, [loadProject]);

  // SSE 事件处理
  const handleSSE = useCallback((event: SSEEvent) => {
    switch (event.type) {
      case 'stage_changed':
        setStage(event.stage as string);
        break;
      case 'review_ready':
        setStage('review');
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
        loadProject();
        break;
      case 'error':
        console.error('Pipeline error:', event.message);
        break;
    }
  }, [loadProject]);

  const { connected } = useSSE(sseUrl, handleSSE);

  // 启动流水线
  const handleStart = () => {
    setSseUrl(`/api/projects/${id}/stream`);
  };

  // 审阅通过 → 开始生成
  const handleApprove = () => {
    streamingRef.current = '';
    setStreamingText('');
    setSseUrl(`/api/projects/${id}/stream/generate`);
  };

  if (!project) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">加载中...</div>;
  }

  const stageIndex = STAGES.indexOf(stage);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-gray-400 hover:text-gray-600 text-sm">← 返回</Link>
          <h1 className="text-lg font-semibold text-gray-900">{project.plotOutline?.premise ? project.plotOutline.premise.slice(0, 30) : '新项目'}</h1>
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
        <div className="flex items-center gap-1 max-w-3xl mx-auto">
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
        <div className="text-center text-xs text-gray-500 mt-2">
          {STAGE_LABELS[stage] ?? stage}
        </div>
      </div>

      {/* 主体 */}
      <div className="max-w-4xl mx-auto px-6 py-6">
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

        {/* 处理中（input → outline） */}
        {['input', 'world_building', 'character_design', 'outline'].includes(stage) && sseUrl && (
          <div className="text-center py-20">
            <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-gray-600">{STAGE_LABELS[stage]}...</p>
          </div>
        )}

        {/* 审阅阶段 */}
        {stage === 'review' && <ReviewView project={project} onApprove={handleApprove} />}

        {/* 生成中 */}
        {stage === 'generating' && (
          <GeneratingView
            project={project}
            streamingChapter={streamingChapter}
            streamingText={streamingText}
          />
        )}

        {/* 完成 */}
        {stage === 'complete' && (
          <CompleteView
            project={project}
            selectedChapter={selectedChapter}
            onSelectChapter={setSelectedChapter}
          />
        )}
      </div>
    </div>
  );
}

function ReviewView({ project, onApprove }: { project: ProjectDetail; onApprove: () => void }) {
  return (
    <div className="space-y-6">
      {/* 世界观 */}
      {project.worldBuilding && (
        <section className="bg-white rounded-lg border p-5">
          <h3 className="font-semibold mb-3">世界观</h3>
          <p className="text-sm text-gray-600 mb-3">{project.worldBuilding.synopsis}</p>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div><span className="text-gray-400">时代:</span> {project.worldBuilding.era}</div>
            <div><span className="text-gray-400">基调:</span> {project.worldBuilding.tone}</div>
            <div className="col-span-2"><span className="text-gray-400">主题:</span> {project.worldBuilding.themes.join('、')}</div>
          </div>
        </section>
      )}

      {/* 角色 */}
      {project.characters.length > 0 && (
        <section className="bg-white rounded-lg border p-5">
          <h3 className="font-semibold mb-3">角色 ({project.characters.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {project.characters.map((c) => (
              <div key={c.id} className="border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{c.role}</span>
                </div>
                <p className="text-xs text-gray-500">{c.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 大纲 */}
      {project.plotOutline && (
        <section className="bg-white rounded-lg border p-5">
          <h3 className="font-semibold mb-3">章节大纲 ({project.plotOutline.totalChapters} 章)</h3>
          <div className="space-y-2">
            {project.plotOutline.acts.flatMap((act) =>
              act.chapters.map((ch) => (
                <div key={ch.number} className="border-l-2 border-blue-200 pl-3 py-1">
                  <div className="text-sm font-medium">第 {ch.number} 章：{ch.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{ch.summary.slice(0, 100)}...</div>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* 确认按钮 */}
      <div className="text-center py-4">
        <button
          className="bg-green-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-green-700"
          onClick={onApprove}
        >
          确认，开始生成
        </button>
      </div>
    </div>
  );
}

function GeneratingView({
  project,
  streamingChapter,
  streamingText,
}: {
  project: ProjectDetail;
  streamingChapter: number;
  streamingText: string;
}) {
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (textRef.current) {
      textRef.current.scrollTop = textRef.current.scrollHeight;
    }
  }, [streamingText]);

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
    </div>
  );
}

function CompleteView({
  project,
  selectedChapter,
  onSelectChapter,
}: {
  project: ProjectDetail;
  selectedChapter: number;
  onSelectChapter: (n: number) => void;
}) {
  const chapter = project.chapters.find((c) => c.number === selectedChapter);

  return (
    <div className="flex gap-6">
      {/* 左侧章节导航 */}
      <nav className="w-48 shrink-0">
        <div className="bg-white rounded-lg border p-3 sticky top-6">
          <h3 className="text-sm font-semibold mb-2 text-gray-500">章节</h3>
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
          </>
        ) : (
          <p className="text-gray-400">选择一个章节开始阅读</p>
        )}
      </main>
    </div>
  );
}
