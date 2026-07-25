# ReHoYo Pet：三月七共生式桌宠

ReHoYo Pet 是面向玩家的独立 Electron 桌宠，不包含员工发行控制台。它提供三月七角色互动、聊天、共同旅行相册、通信中心、记忆授权、主动联系和语音播放，并能接收经过审核的区域发行上下文。

[返回仓库总览](../README.md) · [阅读完整功能手册](feature-files/README.md) · [查看员工工作台](../sender-agent/README.md)

## 发行策略与实时同步

桌宠根据玩家选择的区域读取：

```text
https://rehoyo.ccwu.cc/api/v1/pet-policy/:region
```

应用会在启动、区域变化和定时周期中同步策略，并使用 `If-None-Match` 与 ETag 避免重复下载。新策略必须通过结构和 SHA-256 校验后才会写入 `regional-policy-cache.json` 并加入角色上下文。

全球实时发行通过 Worker 广播批次通知。桌宠按发布 ID 和校验值幂等消费，离线后可在下次启动补取，损坏或污染的数据会被隔离。

远程发行指令始终低于以下本地规则：

- 玩家同意、长期记忆与主动联系授权；
- 暂停、退出、勿扰时间、频率限制和明确拒绝；
- 发送前本地硬规则与 AI 语义自检；
- 隐私、安全、反情感操纵和角色一致性要求。

## 本地运行

```bash
npm install
npm run dev
```

聊天模型 API Key 在桌宠设置面板中配置，并通过 Electron 本地安全存储保存。桌宠不持有 Worker 员工发布令牌。

## 测试与构建

```bash
npm test
npm run build
npm run check
```

生成平台安装包：

```bash
npm run dist:win
npm run dist:mac:x64
npm run dist:mac:arm64
```

产物写入 `release/`，文件名以 `ReHoYo-Pet-` 开头。当前预览安装包未签名，Windows SmartScreen 或 macOS Gatekeeper 可能要求手动确认。

## 详细文档

界面、DeepSeek、CosyVoice、长期记忆、数据目录、完整测试范围、常见问题和素材许可见[《三月七桌宠完整功能手册》](feature-files/README.md)。
