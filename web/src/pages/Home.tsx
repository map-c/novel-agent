import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { listProjects, createProject, deleteProject, getInspiration, type ProjectSummary } from '../api';

const STATUS_LABELS: Record<string, string> = {
  input: '待启动',
  clarifying: '补充信息',
  world_building: '构建世界观',
  character_design: '设计角色',
  outline: '生成大纲',
  review_world: '确认世界观',
  review_characters: '确认角色',
  review_outline: '确认大纲',
  review: '待审阅',
  generating: '生成中',
  paused: '已暂停',
  complete: '已完成',
};

const STATUS_COLORS: Record<string, string> = {
  complete: 'bg-primary-50 text-primary-700',
  generating: 'bg-amber-50 text-amber-700',
  paused: 'bg-gray-100 text-gray-600',
};

export default function Home() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [prompt, setPrompt] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [inspirations, setInspirations] = useState<string[]>([]);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const navigate = useNavigate();

  const load = () => listProjects().then(setProjects).catch(() => {});

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!prompt.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const { id } = await createProject(prompt.trim());
      setPrompt('');
      navigate(`/project/${id}`);
    } catch (err) {
      setError((err as Error).message || '创建失败，请重试');
    } finally {
      setCreating(false);
    }
  };

  const handleInspiration = async () => {
    setLoadingIdeas(true);
    setError(null);
    try {
      const { ideas } = await getInspiration();
      setInspirations(ideas);
    } catch (err) {
      setError((err as Error).message || '灵感生成失败，请重试');
    } finally {
      setLoadingIdeas(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await deleteProject(id);
      setConfirmDelete(null);
      load();
    } catch {
      setError('删除失败，请重试');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="min-h-screen bg-warm-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-3xl font-serif font-bold text-gray-900 tracking-tight">Novel Agent</h1>
          <button
            onClick={() => navigate('/settings')}
            className="text-gray-400 hover:text-primary-600 p-2 rounded-lg hover:bg-primary-50 cursor-pointer"
            title="Settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
        <p className="text-gray-400 mb-10 font-serif italic">AI 驱动的小说创作工作台</p>

        {/* Error */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex items-center justify-between animate-slide-up">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-2 cursor-pointer">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* New Project */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 mb-10">
          <h2 className="text-lg font-serif font-semibold text-gray-800 mb-4">开始新故事</h2>
          <textarea
            className="w-full border border-gray-200 rounded-xl p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent placeholder:text-gray-300"
            rows={3}
            placeholder="描述你想创作的小说，比如：一个少年在末日废土中寻找传说中的净土城市..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) handleCreate(); }}
          />

          {/* Inspirations */}
          {inspirations.length > 0 && (
            <div className="mt-4 space-y-2">
              {inspirations.map((idea, i) => (
                <button
                  key={i}
                  className="w-full text-left text-sm text-gray-600 bg-amber-50/60 hover:bg-amber-50 border border-amber-200/60 rounded-xl px-4 py-3 cursor-pointer animate-slide-up"
                  style={{ animationDelay: `${i * 80}ms` }}
                  onClick={() => { setPrompt(idea); setInspirations([]); }}
                >
                  <span className="text-amber-500 font-medium mr-2">{i + 1}.</span>
                  {idea}
                </button>
              ))}
            </div>
          )}

          <div className="flex justify-between items-center mt-4">
            <button
              className="text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 px-3 py-1.5 rounded-lg disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              onClick={handleInspiration}
              disabled={loadingIdeas}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              {loadingIdeas ? '生成灵感中...' : '帮我想想'}
            </button>
            <button
              className="bg-primary-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-primary-700 disabled:opacity-50 cursor-pointer shadow-sm shadow-primary-200"
              onClick={handleCreate}
              disabled={creating || !prompt.trim()}
            >
              {creating ? '创建中...' : '开始创作'}
            </button>
          </div>
        </div>

        {/* Project List */}
        {projects.length > 0 && (
          <div>
            <h2 className="text-lg font-serif font-semibold text-gray-800 mb-4">我的作品</h2>
            <div className="space-y-3">
              {projects.map((p) => {
                const statusColor = STATUS_COLORS[p.status] ?? 'bg-gray-100 text-gray-500';
                return (
                  <div
                    key={p.id}
                    className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5 hover:shadow-md hover:border-gray-200 cursor-pointer group"
                    onClick={() => confirmDelete !== p.id && navigate(`/project/${p.id}`)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-gray-900 truncate group-hover:text-primary-700">{p.title}</div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${statusColor}`}>
                            {STATUS_LABELS[p.status] ?? p.status}
                          </span>
                          <span className="text-xs text-gray-300">
                            {new Date(p.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      {confirmDelete !== p.id && (
                        <button
                          className="text-gray-300 hover:text-red-500 text-xs px-2 py-1 shrink-0 opacity-0 group-hover:opacity-100 cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); setConfirmDelete(p.id); }}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                    {confirmDelete === p.id && (
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs text-red-500">确认删除该项目？</span>
                        <div className="flex-1" />
                        <button
                          className="text-xs text-gray-500 px-3 py-1.5 hover:bg-gray-100 rounded-lg cursor-pointer"
                          onClick={() => setConfirmDelete(null)}
                        >
                          取消
                        </button>
                        <button
                          className="text-xs text-white bg-red-500 font-medium px-3 py-1.5 rounded-lg hover:bg-red-600 disabled:opacity-50 cursor-pointer"
                          onClick={() => handleDelete(p.id)}
                          disabled={deleting === p.id}
                        >
                          {deleting === p.id ? '删除中...' : '删除'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {projects.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-300 font-serif italic text-lg">还没有作品，开始创作第一个故事吧</p>
          </div>
        )}
      </div>
    </div>
  );
}
