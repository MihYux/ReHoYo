const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow, safeStorage } = require("electron");
const { AiSettingsStore } = require("../electron/ai-settings.cjs");
const { requestDeepSeekChat } = require("../electron/ai-client.cjs");
const { reviewCharacterOutput } = require("../electron/content-safety.cjs");
const promptConfig = require("../shared/march7th-prompt.json");

const repositoryRoot = path.resolve(__dirname, "..", "..");
const outputDir = path.join(repositoryRoot, "assests");
const petImagePath = path.join(__dirname, "..", "public", "assets", "march7th-pet.png");

const conversations = [
  {
    fileName: "readme-chat-penacony.png",
    user: "如果我们真的到了匹诺康尼，你最想先带我去看什么？",
  },
  {
    fileName: "readme-chat-black-swan.png",
    user: "你第一次见到黑天鹅时，最先注意到什么？",
  },
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function chatHtml({ user, assistant, model, petDataUrl }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 100%; height: 100%; }
    body {
      font-family: "Microsoft YaHei UI", "Noto Sans SC", sans-serif;
      color: #263247;
      background:
        radial-gradient(circle at 12% 8%, rgba(255, 213, 238, .82), transparent 32%),
        radial-gradient(circle at 92% 88%, rgba(195, 207, 255, .74), transparent 34%),
        linear-gradient(145deg, #fffafd 0%, #f5f6ff 100%);
      padding: 42px;
    }
    .frame {
      height: 100%;
      display: grid;
      grid-template-columns: 210px 1fr;
      overflow: hidden;
      border: 1px solid rgba(122, 109, 162, .2);
      border-radius: 28px;
      background: rgba(255, 255, 255, .9);
      box-shadow: 0 24px 70px rgba(70, 56, 104, .18);
    }
    aside {
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 28px 20px 22px;
      background: linear-gradient(180deg, #fff1f7 0%, #edeaff 100%);
      border-right: 1px solid rgba(139, 119, 172, .15);
    }
    .brand { font-size: 13px; font-weight: 800; letter-spacing: .12em; color: #8c5b7b; }
    .pet { width: 190px; margin: 0 0 -18px -10px; filter: drop-shadow(0 16px 18px rgba(83, 57, 110, .18)); }
    .status { font-size: 12px; color: #756c82; }
    main { padding: 28px 34px; display: flex; flex-direction: column; min-width: 0; }
    header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 20px; border-bottom: 1px solid #eee8f1; }
    h1 { margin: 0; font-size: 23px; }
    .model { padding: 7px 11px; border-radius: 99px; background: #f2edf7; color: #786987; font: 12px Consolas, monospace; }
    .chat { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 20px; padding: 22px 0; }
    .row { display: flex; }
    .row.user { justify-content: flex-end; }
    .bubble { max-width: 78%; padding: 16px 19px; border-radius: 20px; font-size: 17px; line-height: 1.7; }
    .assistant .bubble { background: #fff; border: 1px solid #eadde8; border-bottom-left-radius: 6px; box-shadow: 0 8px 24px rgba(96, 70, 103, .08); }
    .user .bubble { color: #fff; background: linear-gradient(135deg, #d77cad, #8b78c7); border-bottom-right-radius: 6px; box-shadow: 0 8px 22px rgba(143, 94, 155, .18); }
    footer { display: flex; align-items: center; gap: 9px; color: #7f7788; font-size: 12px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #4dbf8f; box-shadow: 0 0 0 4px rgba(77, 191, 143, .12); }
  </style>
</head>
<body>
  <section class="frame">
    <aside>
      <div class="brand">REHOYO · MARCH 7TH</div>
      <img class="pet" src="${petDataUrl}" alt="三月七" />
      <div class="status">共生式角色陪伴</div>
    </aside>
    <main>
      <header>
        <h1>和三月七聊天</h1>
        <span class="model">${escapeHtml(model)}</span>
      </header>
      <div class="chat">
        <div class="row user"><div class="bubble">${escapeHtml(user)}</div></div>
        <div class="row assistant"><div class="bubble">${escapeHtml(assistant)}</div></div>
      </div>
      <footer><span class="dot"></span>由 DeepSeek 实时生成 · 已通过本地输出检查</footer>
    </main>
  </section>
</body>
</html>`;
}

async function captureConversation(conversation, settingsStore, petDataUrl) {
  const settings = settingsStore.getPublicSettings();
  const result = await requestDeepSeekChat({
    apiKey: settingsStore.getApiKey(),
    model: settings.model,
    thinking: settings.thinking,
    messages: [{ role: "user", content: conversation.user }],
    systemPrompt: promptConfig.systemPrompt,
    timeoutMs: 45_000,
  });
  const reviewed = reviewCharacterOutput(result.content);
  const window = new BrowserWindow({
    width: 1000,
    height: 620,
    show: false,
    backgroundColor: "#fffafd",
    webPreferences: { offscreen: true },
  });
  const html = chatHtml({
    user: conversation.user,
    assistant: reviewed.safeText,
    model: result.model,
    petDataUrl,
  });
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await window.webContents.executeJavaScript(`new Promise((resolve) => {
    const finish = () => requestAnimationFrame(() => requestAnimationFrame(resolve));
    if (document.readyState === "complete" && [...document.images].every((image) => image.complete)) finish();
    else window.addEventListener("load", finish, { once: true });
  })`);
  window.webContents.invalidate();
  await new Promise((resolve) => setTimeout(resolve, 250));
  const image = await window.webContents.capturePage();
  fs.writeFileSync(path.join(outputDir, conversation.fileName), image.toPNG());
  window.destroy();
}

app.setName("desktop-march-7th");
app.on("window-all-closed", () => {
  // Keep the capture process alive until every requested conversation is rendered.
});
app.whenReady().then(async () => {
  try {
    fs.mkdirSync(outputDir, { recursive: true });
    const userDataDir = path.join(app.getPath("appData"), "desktop-march-7th");
    const settingsStore = new AiSettingsStore({
      filePath: path.join(userDataDir, "ai-settings.json"),
      safeStorage,
    });
    if (!settingsStore.getPublicSettings().hasApiKey) {
      throw new Error("No existing DeepSeek API key is available.");
    }
    const petDataUrl = `data:image/png;base64,${fs.readFileSync(petImagePath).toString("base64")}`;
    for (const conversation of conversations) {
      await captureConversation(conversation, settingsStore, petDataUrl);
    }
    process.stdout.write(`Created ${conversations.length} README chat screenshots.\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});
