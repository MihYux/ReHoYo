# ReHoYo Sender Agent：员工发行工作台

Sender Agent 是员工侧桌面应用，用于版本资料整理、区域研究、全球发行方案、三月七角色共生发行和安全发布。它与玩家侧桌宠独立运行，不包含玩家聊天界面。

[返回仓库总览](../README.md) · [查看三月七桌宠](../pet/README.md) · [查看 Worker](../website-worker/README.md)

## 核心能力

- 上传 PDF、Word、Excel、CSV、Markdown 或 TXT，并提取内部版本事实。
- AI 自动填写版本信息，生成只读版本简报。
- 对中国大陆、日本、韩国、北美、欧洲、东南亚和港澳台进行区域研究与证据核验。
- 生成可编辑的全球发行方案、分区域方案和三月七角色共生方案。
- 人工确认最终方案后导出 Markdown/ZIP，或逐区域导入角色发行控制台。
- 支持任务版本、灰度发布、紧急暂停、审计、全球实时发行和桌宠回执状态。

## 内置固定演示

上传以下文件时，应用会识别文件名和关键内容特征：

```text
【内部模拟】崩坏星穹铁道2.0版本发行执行层输入材料.md
```

命中后，自动填写、版本简报、七区域研究和初次发行方案使用随应用打包的固定首版结果，不调用 GLM、联网搜索或历史数据库。每个生成步骤会先显示约 5.5 秒正常进度。页面 3 的自由文本方案 Agent 修改仍使用实时模型。

## 本地运行

```bash
npm install
npm run dev
```

在应用“连接设置”中填写：

- GLM API Key、模型和 API 地址；
- Cloudflare Worker 员工发布令牌。

开发环境凭据保存在 `.data/operator-settings.json`，打包应用保存在本地应用数据目录。接口不会返回明文凭据，生产研究和发布逻辑也不会从 `.env` 读取这些凭据。

## 测试与构建

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

生成安装包：

```bash
npm run dist:win
npm run dist:mac:x64
npm run dist:mac:arm64
```

产物写入 `release/`，文件名以 `ReHoYo-Sender-Agent-` 开头。打包后可执行：

```bash
npm run smoke:packaged-server
npm run smoke:packaged-app
```

## 发布安全

只有人工确认且通过结构校验的玩家安全内容可以发布。内部研究证据、预算、经营目标、源文档、凭据和员工审计元数据不会发送到公开 Worker 或桌宠。
