# 部署指南

## 平台评估

### Cloudflare Workers — 不适合

经评估，当前应用不适合直接部署到 Cloudflare Workers，存在以下问题：

| 问题 | 原因 |
|------|------|
| 本地 SQLite 文件 | Workers 无文件系统，`file:novel-agent.db` 无法运行 |
| Node.js 服务器 | `@hono/node-server` + `dotenv` 是 Node 专属模块 |
| **30 秒执行时间限制** | 流水线通过 SSE 长连接运行，单次连接可能持续数分钟，会被强制断开 |

前两个问题改动量小（`@libsql/client` 和 `drizzle-orm` 都原生支持 Workers），但 30 秒超时是架构层面的冲突，需要重写流水线调度逻辑（拆成短请求、使用 Durable Objects 或 Queues），代价过高。

**折中方案**：前端部署到 Cloudflare Pages（零改动），后端部署到支持长连接的平台。

### 推荐平台

当前应用的部署需求：Node.js 运行时 + 持久化存储（SQLite 文件）+ SSE 长连接支持。

#### 一键部署平台（零/低改动）

| 平台 | 免费额度 | 特点 | 适合场景 |
|------|---------|------|---------|
| Railway | $5/月额度 | 一键从 GitHub 部署，支持 SQLite 持久化卷，零配置 | 最省心，推荐首选 |
| Fly.io | 3 台小实例免费 | 支持持久化卷（SQLite 友好），全球边缘部署 | 需要低延迟 |
| Render | 750 小时/月免费 | 类似 Railway，自动从 Git 部署 | 免费额度较多 |
| Zeabur | 有免费额度 | 国内团队，中文文档，部署体验类似 Railway | 国内用户友好 |

#### VPS 平台（面向欧美用户）

| 平台 | 最低价格 | 机房位置 | 特点 |
|------|---------|---------|------|
| **Hetzner** | €3.29/月 | 德国、芬兰、美国 | 性价比最高，2vCPU/2GB 只要 €4.5，欧洲延迟极低 |
| DigitalOcean | $4/月 | 美国、欧洲、新加坡等 | 文档优秀，社区活跃，适合入门 |
| Vultr | $2.5/月 | 全球 32 个机房 | 按小时计费，机房选择最多 |
| Linode (Akamai) | $5/月 | 美国、欧洲、亚太 | 稳定老牌，网络质量好 |
| AWS Lightsail | $3.5/月 | 全球 | AWS 简化版，适合未来扩展到 AWS 生态 |

**面向欧美用户首选**：Hetzner，同配置价格通常是其他平台的一半，欧美覆盖好。

## 部署配置参考

### 环境要求

- Node.js >= 18
- pnpm >= 9
- 配置环境变量：`OPENROUTER_API_KEY`（必须）、`PORT`（可选，默认 3000）

### 基本部署步骤（VPS）

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填入 OPENROUTER_API_KEY

# 3. 构建
pnpm build
pnpm build:web

# 4. 启动（生产环境建议使用 pm2）
pm2 start dist/server/index.js --name novel-agent
```

### 前后端分离部署

如果前端和后端分开部署：

- **前端**：`pnpm build:web` 后将 `web/dist/` 目录部署到任意静态托管（Cloudflare Pages、Vercel、Netlify）
- **后端**：部署到支持长连接的 Node.js 平台，前端通过环境变量或反向代理指向后端 API 地址
