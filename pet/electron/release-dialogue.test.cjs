const assert = require("node:assert/strict");
const test = require("node:test");
const { generateReleaseOpening } = require("./release-dialogue.cjs");

function policy() {
  return {
    region: { code: "JP", name: "日本", timeZone: "Asia/Tokyo" },
    plan: {
      title: "匹诺康尼新旅程",
      theme: "自然邀请玩家了解黑天鹅",
      facts: [{ value: "匹诺康尼的新旅程已经开启。" }],
    },
    systemPrompt: "使用符合日本区域习惯的自然表达。",
  };
}

test("uses DeepSeek thinking with policy and campaign-authorized memory", async () => {
  let request;
  const result = await generateReleaseOpening({
    policy: policy(),
    memories: [{ summary: "玩家喜欢慢慢探索剧情", tags: ["剧情"] }],
    apiKey: "sk-test",
    model: "deepseek-v4-flash",
    basePrompt: "你是三月七。",
    skillPrompt: "保持低压力并只引用事实。",
    requestChat: async (input) => {
      request = input;
      return { content: "开拓者，想不想和咱一起看看匹诺康尼的新旅程？不急，等你有空再说。", model: input.model };
    },
  });
  assert.equal(request.thinking, true);
  assert.match(request.systemPrompt, /当前已激活的区域发行策略/);
  assert.match(request.messages[0].content, /玩家喜欢慢慢探索剧情/);
  assert.equal(result.source, "model");
  assert.equal(result.degraded, false);
});

test("retries one transient model failure before succeeding", async () => {
  let attempts = 0;
  const result = await generateReleaseOpening({
    policy: policy(), memories: [], apiKey: "sk-test", model: "deepseek-v4-flash",
    basePrompt: "你是三月七。", skillPrompt: "保持低压力。", sleep: async () => {},
    requestChat: async () => {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error("busy"), { code: "RATE_LIMITED" });
      return { content: "开拓者，咱有段新旅程想和你聊聊，有空再来听吧。", model: "deepseek-v4-flash" };
    },
  });
  assert.equal(attempts, 2);
  assert.equal(result.source, "model");
});

test("uses a verified-fact fallback when no model key is available", async () => {
  const result = await generateReleaseOpening({
    policy: policy(), memories: [], apiKey: "", model: "deepseek-v4-flash",
    basePrompt: "你是三月七。", skillPrompt: "保持低压力。", requestChat: async () => assert.fail("model should not run"),
  });
  assert.equal(result.source, "fallback");
  assert.equal(result.reasonCode, "api_key_missing");
  assert.match(result.text, /匹诺康尼的新旅程已经开启/);
});
