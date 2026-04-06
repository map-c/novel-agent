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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold text-gray-900">Novel Agent</h1>
          <button
            onClick={() => navigate('/settings')}
            className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100"
            title="Settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
        <p className="text-gray-500 mb-8">AI 小说生成工作台</p>

        {/* 全局错误提示 */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* 新建项目 */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-8">
          <h2 className="text-lg font-semibold mb-3">新建小说</h2>
          <textarea
            className="w-full border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3}
            placeholder="描述你想创作的小说，比如：一个少年在末日废土中寻找传说中的净土城市..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) handleCreate(); }}
          />
          {/* 灵感区域 */}
          {inspirations.length > 0 && (
            <div className="mt-3 space-y-2">
              {inspirations.map((idea, i) => (
                <button
                  key={i}
                  className="w-full text-left text-sm text-gray-600 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg px-3 py-2.5 transition-colors"
                  onClick={() => { setPrompt(idea); setInspirations([]); }}
                >
                  <span className="text-amber-500 font-medium mr-1.5">{i + 1}.</span>
                  {idea}
                </button>
              ))}
            </div>
          )}

          <div className="flex justify-between items-center mt-3">
            <button
              className="text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 px-2 py-1 rounded transition-colors disabled:opacity-50 flex items-center gap-1"
              onClick={handleInspiration}
              disabled={loadingIdeas}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              {loadingIdeas ? '生成灵感中...' : '帮我想想'}
            </button>
            <button
              className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              onClick={handleCreate}
              disabled={creating || !prompt.trim()}
            >
              {creating ? '创建中...' : '开始创作'}
            </button>
          </div>
        </div>

        {/* 项目列表 */}
        {projects.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-3">我的项目</h2>
            <div className="space-y-2">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className="bg-white rounded-lg border p-4 hover:shadow-sm cursor-pointer"
                  onClick={() => confirmDelete !== p.id && navigate(`/project/${p.id}`)}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate">{p.title}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        {STATUS_LABELS[p.status] ?? p.status}
                        {' · '}
                        {new Date(p.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    {confirmDelete !== p.id && (
                      <button
                        className="text-gray-400 hover:text-red-500 text-sm px-2 shrink-0"
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(p.id); }}
                      >
                        删除
                      </button>
                    )}
                  </div>
                  {confirmDelete === p.id && (
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t" onClick={(e) => e.stopPropagation()}>
                      <span className="text-xs text-red-500">确认删除该项目？</span>
                      <div className="flex-1" />
                      <button
                        className="text-xs text-gray-500 px-3 py-1.5 hover:bg-gray-100 rounded"
                        onClick={() => setConfirmDelete(null)}
                      >
                        取消
                      </button>
                      <button
                        className="text-xs text-white bg-red-500 font-medium px-3 py-1.5 rounded hover:bg-red-600 disabled:opacity-50"
                        onClick={() => handleDelete(p.id)}
                        disabled={deleting === p.id}
                      >
                        {deleting === p.id ? '删除中...' : '删除'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
