const assert = require("node:assert/strict");
const test = require("node:test");
const { directRevealTerms, generateReleaseOpening, isNearDuplicate, playerExplicitlyRequestsReveal, prematurelyRevealsSubject, proactiveOpeningWithinLength, safeFallback, variationStyle } = require("./release-dialogue.cjs");

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
    recentOpenings: ["开拓者，之前咱和你聊过黑天鹅。"],
    variationKey: "player-a:delivery-1",
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
  assert.match(request.systemPrompt, /两到三句自然短句/);
  assert.match(request.messages[0].content, /玩家喜欢慢慢探索剧情/);
  assert.match(request.messages[0].content, /之前咱和你聊过黑天鹅/);
  assert.match(request.messages[0].content, /creativeDirection/);
  assert.doesNotMatch(request.messages[0].content, /player-a/);
  assert.equal(result.source, "model");
  assert.equal(result.degraded, false);
});

test("regenerates when the model repeats a recent release opening", async () => {
  const repeated = "开拓者，想不想和咱一起看看匹诺康尼的新旅程？不急，等你有空再说。";
  let attempts = 0;
  const result = await generateReleaseOpening({
    policy: policy(), memories: [], recentOpenings: [repeated], variationKey: "player-b:delivery-2",
    apiKey: "sk-test", model: "deepseek-v4-flash", basePrompt: "你是三月七。", skillPrompt: "保持低压力。",
    requestChat: async () => {
      attempts += 1;
      return { content: attempts === 1 ? repeated : "下一段旅途好像藏着不少谜题。开拓者想先猜猜看吗？", model: "deepseek-v4-flash" };
    },
  });
  assert.equal(attempts, 2);
  assert.equal(result.source, "model");
  assert.doesNotMatch(result.text, /黑天鹅/);
});

test("regenerates a first opening that directly names the reveal character", async () => {
  let attempts = 0;
  const result = await generateReleaseOpening({
    policy: policy(), memories: [], recentOpenings: [], variationKey: "player-c:delivery-3",
    apiKey: "sk-test", model: "deepseek-v4-flash", basePrompt: "你是三月七。", skillPrompt: "首次只留线索。",
    requestChat: async () => {
      attempts += 1;
      return { content: attempts === 1 ? "咱想带你认识黑天鹅。" : "咱发现旅途中多了一点神秘感。想听时再来找咱吧。", model: "deepseek-v4-flash" };
    },
  });
  assert.equal(attempts, 2);
  assert.doesNotMatch(result.text, /黑天鹅/);
});

test("extracts the reveal name without swallowing announcement wording", () => {
  const revealPlan = {
    theme: "自然邀请玩家了解黑天鹅",
    facts: [{ value: "新角色黑天鹅即将登场" }],
  };
  assert.ok(directRevealTerms(revealPlan).includes("黑天鹅"));
  assert.equal(prematurelyRevealsSubject("咱就从黑天鹅说起吧。", revealPlan), true);
  assert.equal(playerExplicitlyRequestsReveal("黑天鹅是谁？", revealPlan), true);
  assert.equal(playerExplicitlyRequestsReveal("为什么为什么？", revealPlan), false);
});

test("detects near-duplicate openings and varies local fallback by player key", () => {
  assert.equal(isNearDuplicate("开拓者，想一起看看匹诺康尼吗？", ["开拓者，想一起看看匹诺康尼吗！"]), true);
  assert.notEqual(variationStyle("player-a"), undefined);
  const first = safeFallback(policy().plan, { variationKey: "player-a" });
  let second = first;
  for (let index = 0; index < 20 && second === first; index += 1) {
    second = safeFallback(policy().plan, { variationKey: `player-b-${index}` });
  }
  assert.notEqual(first, second);
  assert.equal(proactiveOpeningWithinLength(first), true);
});

test("regenerates an overlong or single-sentence proactive opening", async () => {
  let attempts = 0;
  const result = await generateReleaseOpening({
    policy: policy(), memories: [], recentOpenings: [], variationKey: "player-length",
    apiKey: "sk-test", model: "deepseek-v4-flash", basePrompt: "你是三月七。", skillPrompt: "保持简短。",
    requestChat: async () => {
      attempts += 1;
      return {
        content: attempts === 1
          ? "开拓者，咱今天想和你说好多好多关于下一段旅途的事情，不过这些事情全都挤在同一个特别特别长的句子里所以听起来会没完没了。"
          : "下一段旅途好像藏着一点秘密。想听时再来找咱吧。",
        model: "deepseek-v4-flash",
      };
    },
  });
  assert.equal(attempts, 2);
  assert.equal(proactiveOpeningWithinLength(result.text), true);
});

test("retries one transient model failure before succeeding", async () => {
  let attempts = 0;
  const result = await generateReleaseOpening({
    policy: policy(), memories: [], apiKey: "sk-test", model: "deepseek-v4-flash",
    basePrompt: "你是三月七。", skillPrompt: "保持低压力。", sleep: async () => {},
    requestChat: async () => {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error("busy"), { code: "RATE_LIMITED" });
      return { content: "开拓者，咱有段新旅程想和你聊聊。有空再来听吧。", model: "deepseek-v4-flash" };
    },
  });
  assert.equal(attempts, 2);
  assert.equal(result.source, "model");
});

test("uses a spoiler-free teaser fallback when no model key is available", async () => {
  const result = await generateReleaseOpening({
    policy: policy(), memories: [], apiKey: "", model: "deepseek-v4-flash",
    basePrompt: "你是三月七。", skillPrompt: "保持低压力。", requestChat: async () => assert.fail("model should not run"),
  });
  assert.equal(result.source, "fallback");
  assert.equal(result.reasonCode, "api_key_missing");
  assert.match(result.text, /神秘感|悬念|意外的故事|没写名字/);
  assert.doesNotMatch(result.text, /黑天鹅/);
});
