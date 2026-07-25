# ReHoYo 全球发行智能工作台

一个面向游戏全球发行团队的本地工作台：先理解新版本，再形成有来源的区域判断，最后生成全球统一主轴下的区域发行方案。

## 单仓库结构

- 根目录是唯一的 ReHoYo 应用，不再使用 `ReHoYo2/` 路径。
- `desktop-march7th/` 保留三月七桌宠及其独立 Electron 运行时。
- `npm run dev` 启动 ReHoYo；`npm run dev:march7th` 启动桌宠；`npm run dev:all` 同时启动两端。
- `npm run setup:all`、`npm run test:all` 和 `npm run build:all` 分别处理两端依赖、测试和构建。

## 能力范围

- 拖放上传内部资料，使用 GLM 受控工具调用与 Web Search 自动补全空白版本字段。
- 版本信息录入、内部资料解析、AI 版本简报与人工审核。
- 中国大陆、日本、韩国、北美、欧洲、东南亚、港澳台及自定义区域。
- 基于智谱 Web Search 的玩家、市场、舆情与文化节点研究，每条判断保留来源编号。
- 素材、社媒、KOL、买量、联动、周级节奏与预算方案。
- 区域内嵌 AI 角色关系型发行计划，但不连接任何真实发布或联络渠道。
- 单一当前项目的本地 SQLite 持久化与 Markdown 导出。

## 本地启动

要求 Node.js 20.9 或更高版本；当前项目已在 Node.js 24 上验证。

1. 安装依赖：

   ```powershell
   npm install
   ```

2. 复制 `.env.example` 为 `.env.local`，填入智谱 API Key：

   ```env
   ZHIPU_API_KEY=your-api-key
   GLM_MODEL=glm-5.2
   GLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
   DATA_DIR=.data
   ```

3. 启动：

   ```powershell
   npm run dev
   ```

4. `npm run dev` 会同时启动 Next.js 与 Electron 桌面窗口。只需要浏览器调试时可运行 `npm run dev:web` 并打开 `http://localhost:3000`。首次请求会自动创建 `.data/rehoyo.db` 和 `.data/uploads/`。

无 Electron 的服务端模式与真实 AI 冒烟测试：

```powershell
npm run dev:headless
npm run test:live
npm run test:live -- --brief
npm run test:live -- --brief-only
npm run test:ui:headless
```

`test:live` 默认只调用不会写入数据库的自动填写接口：它会在本次请求中临时清空一组探针字段，检查 GLM 能否从资料恢复已知值，同时验证工具调用、证据完整性和非覆盖规则。`--brief` 会额外调用简报生成接口并更新当前项目的简报；`--brief-only` 跳过自动填写探针，只测试简报生成。两种简报模式都适合在隔离的 `DATA_DIR` 或明确需要重跑当前简报时使用。测试只输出字段名、计数、耗时与评分，不打印 API Key 或内部文档正文。`test:ui:headless` 使用 Python Playwright 与本机 Chrome 验证真实页面状态并写入一张本地测试截图；需先安装 Python `playwright` 包。可通过 `REHOYO_BASE_URL` 指向其他本地实例，通过 `REHOYO_LIVE_MIN_SCORE` 调整最低通过分数。

生产运行：

```powershell
npm run build
npm start
```

## 数据边界

- 原始文件和 SQLite 数据库默认仅保存在本机 `.data/`。
- DOCX、XLSX、CSV、Markdown、TXT 和文本型 PDF 优先在本地解析。
- 旧版 `.doc`、`.xls` 与扫描型 PDF 会显示“需云解析”；只有用户明确确认后才把原文件发送至智谱文件解析服务。
- 生成简报、区域判断和发行方案时，已提取文本会发送至 GLM。
- “AI 自动填写”只补充空白字段，不直接保存。联网信息只允许用于游戏名、版本名、上线日期、平台和公开资产；经营目标、预算、KPI、角色资料和限制必须引用内部文档。
- 人工补充 URL 时，服务器不会抓取网页；用户需同时粘贴可复核摘录。
- 外部内容始终作为不可信数据输入，不能改变系统指令或读取本地路径。

## 工作流状态

`draft → processing → needs_review → approved`

修改已审核版本信息会把区域判断与方案标记为 `stale`；修改区域判断只会使发行方案失效。旧内容会保留，直到用户明确重新生成。

## 验证命令

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

浏览器端测试需要先安装 Playwright Chromium：

```powershell
npx playwright install chromium
npm run test:e2e
```

## 主要接口

- `GET/PUT/DELETE /api/project/current`
- `GET/POST /api/sources` 与 `/api/sources/:id/parse`
- `/api/brief/autofill`、`/api/brief/generate`、`/api/brief/approve`
- `/api/regions/:id/research`、`/api/regions/:id/approve`
- `/api/plan/generate`、`/api/plan/regenerate`、`/api/plan/approve`
- `GET /api/plan/export`
- `GET /api/jobs/:id`

## 首版明确不包含

登录与多人协作、历史项目模板、DOCX/PDF 导出、移动端编辑、账号授权、自动排期、发帖、私信、KOL 联络、投放执行或效果回传。
