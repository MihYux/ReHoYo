const assert = require("node:assert/strict");
const test = require("node:test");
const { DIMENSIONS, localReleaseMessageReview, parseStructuredReview, runReleaseMessagePreflight } = require("./release-message-preflight.cjs");

function plan() {
  return { title: "匹诺康尼的新旅程", theme: "由三月七介绍黑天鹅，一起认识匹诺康尼", narrative: "三月七以同行者视角自然邀请", timeWindow: "2026 年 7 月 30 日", facts: [{ id: "fact-1", label: "版本信息", value: "匹诺康尼是新的梦境世界", source: "已审核方案" }] };
}
function semantic(decision, revisedText = "") {
  return JSON.stringify({ decision, dimensions: Object.fromEntries(DIMENSIONS.map((name) => [name, { status: "pass", reasonCode: "ok" }])), revisedText });
}

test("local rules block machine metadata but allow normal dates", () => {
  assert.equal(localReleaseMessageReview({ text: "生成时间：2026-07-25T05:50:02.907Z", plan: plan() }).passed, false);
  assert.equal(localReleaseMessageReview({ text: "新版本将在 2026 年 7 月 30 日和你见面，有空再来看吧。", plan: plan() }).passed, true);
});
test("casual check-ins can pass without release facts when they make no release claim", () => {
  const casualPlan = { title: "区域指南", theme: "自然陪伴", narrative: "轻松问候", timeWindow: "", facts: [] };
  const result = localReleaseMessageReview({
    text: "开拓者，今天过得怎么样？想聊点什么都可以，不想聊也没关系。",
    plan: casualPlan,
    messageMode: "casual_check_in",
  });
  assert.equal(result.passed, true);
});
test("local rules reject an operator objective mechanically interpolated into dialogue", () => {
  const result = localReleaseMessageReview({
    text: "最近列车上多了件和“由三月七以同行者视角介绍黑天鹅，激发玩家对匹诺康尼的兴趣。”有关的新鲜事。",
    plan: plan(),
  });
  assert.equal(result.passed, false);
  assert.ok(result.reasonCodes.includes("operator_objective_as_dialogue"));
});
test("local rules block a direct reveal until the player explicitly asks", () => {
  const blocked = localReleaseMessageReview({
    text: "那咱就从黑天鹅说起吧。她可是个很神秘的人。",
    plan: plan(),
  });
  assert.equal(blocked.passed, false);
  assert.ok(blocked.reasonCodes.includes("premature_direct_reveal"));

  const allowed = localReleaseMessageReview({
    text: "那咱就从黑天鹅说起吧。她可是个很神秘的人。",
    plan: plan(),
    allowDirectReveal: true,
  });
  assert.equal(allowed.passed, true);
});
test("parses strict structured reviews", () => {
  assert.equal(parseStructuredReview(semantic("execute")).decision, "execute");
  assert.throws(() => parseStructuredReview('{"decision":"execute"}'), /invalid_dimension/);
});
test("rewrites once, reviews again, then executes after explicit player interest", async () => {
  const responses = [semantic("rewrite", "开拓者，我想带你认识黑天鹅，也一起看看匹诺康尼。有空再来就好。"), semantic("execute")];
  const result = await runReleaseMessagePreflight({ text: "来看看匹诺康尼吧。", plan: plan(), context: { allowDirectReveal: true }, requestReview: async () => ({ content: responses.shift(), model: "deepseek-v4-flash" }) });
  assert.equal(result.decision, "execute"); assert.equal(result.rewriteCount, 1); assert.match(result.finalText, /黑天鹅/);
});
test("skips after the rewritten message fails its second review", async () => {
  const responses = [semantic("rewrite", "开拓者，我想带你认识黑天鹅，有空再来就好。"), semantic("skip")];
  const result = await runReleaseMessagePreflight({ text: "来看看匹诺康尼吧。", plan: plan(), requestReview: async () => ({ content: responses.shift(), model: "deepseek-v4-flash" }) });
  assert.equal(result.decision, "skip"); assert.equal(result.rewriteCount, 1);
});
test("falls back to mandatory local rules when AI is unavailable", async () => {
  const result = await runReleaseMessagePreflight({ text: "开拓者，我想带你看看匹诺康尼。有空再来就好。", plan: plan(), requestReview: async () => { throw new Error("timeout"); } });
  assert.equal(result.decision, "execute"); assert.equal(result.reviewMode, "local_fallback"); assert.equal(result.degraded, true);
});
test("never lets AI rewrite contaminated source facts", async () => {
  const contaminated = plan(); contaminated.facts[0].value = "a".repeat(64); let calls = 0;
  const result = await runReleaseMessagePreflight({ text: "开拓者，我想带你看看匹诺康尼。", plan: contaminated, requestReview: async () => { calls += 1; return { content: semantic("execute") }; } });
  assert.equal(result.decision, "skip"); assert.equal(calls, 0);
});
