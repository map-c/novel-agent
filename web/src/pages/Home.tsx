import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { listProjects, createProject, deleteProject, type ProjectSummary } from '../api';

const STATUS_LABELS: Record<string, string> = {
  input: '待启动',
  world_building: '构建世界观',
  character_design: '设计角色',
  outline: '生成大纲',
  review: '待审阅',
  generating: '生成中',
  complete: '已完成',
};

export default function Home() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [prompt, setPrompt] = useState('');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const load = () => listProjects().then(setProjects);

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!prompt.trim()) return;
    setCreating(true);
    const { id } = await createProject(prompt.trim());
    setPrompt('');
    setCreating(false);
    navigate(`/project/${id}`);
  };

  const handleDelete = async (id: string) => {
    await deleteProject(id);
    load();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Novel Agent</h1>
        <p className="text-gray-500 mb-8">AI 小说生成工作台</p>

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
          <div className="flex justify-between items-center mt-3">
            <span className="text-xs text-gray-400">⌘+Enter 快速创建</span>
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
                  className="bg-white rounded-lg border p-4 flex items-center justify-between hover:shadow-sm cursor-pointer"
                  onClick={() => navigate(`/project/${p.id}`)}
                >
                  <div>
                    <div className="font-medium text-gray-900">{p.title}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {STATUS_LABELS[p.status] ?? p.status}
                      {' · '}
                      {new Date(p.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    className="text-gray-400 hover:text-red-500 text-sm px-2"
                    onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
