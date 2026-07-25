# ReHoYo 网站与 Cloudflare Worker

该模块使用 React、Vite、Cloudflare Workers、KV 和 Durable Objects 提供公开展示网站、区域桌宠策略 API、全局命令与实时发行广播。

[返回仓库总览](../README.md) · [查看员工工作台](../sender-agent/README.md) · [查看三月七桌宠](../pet/README.md)

## 本地命令

```bash
npm install
npm test
npm run test:e2e
npm run build
npx wrangler dev
```

配置发布令牌并部署：

```bash
npx wrangler login
npx wrangler secret put PUBLISH_TOKEN
npm run deploy
```

`wrangler.jsonc` 绑定 `PET_POLICIES` KV，并为 `rehoyo.ccwu.cc/*` 配置 Worker Route。展示网站从 `showcase/` 构建到忽略提交的 `showcase/dist/`。

## 主要接口

- `GET /api/health`：服务健康检查。
- `GET|HEAD /api/v1/pet-policy/:region`：读取最新区域安全策略。
- `PUT /api/v1/pet-policy/:region`：使用员工发布令牌更新区域策略。
- `GET|PUT /api/v1/pet-command/global`：读取或发布全局桌宠命令。
- `GET|PUT /api/v2/release-batches/current`：读取或发布当前实时发行批次。
- `GET /api/v2/release-batches/:batchId/status`：查询批次送达状态。
- `GET /api/v2/pet-stream`：桌宠实时 WebSocket 通知入口。

读取客户端应保存 ETag 并发送 `If-None-Match`；内容未变化时返回不带正文的 `304`。写入接口必须携带 `Authorization: Bearer <PUBLISH_TOKEN>`。

## 安全要求

- `PUBLISH_TOKEN` 只能保存为 Cloudflare Secret。
- Worker 只保存玩家安全的有限字段，不接收原始研究资料、预算或 API Key。
- 实时批次使用 schema 版本、校验值、发布 ID 和回执状态保证验证与幂等。
- 不得将 `.dev.vars`、令牌、账户密钥或生产数据提交到 Git。
