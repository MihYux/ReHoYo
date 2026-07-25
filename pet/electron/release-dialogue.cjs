const RETRIABLE_CODES = new Set(["RATE_LIMITED", "PROVIDER_UNAVAILABLE", "REQUEST_TIMEOUT", "NETWORK_ERROR"]);

function safeFallback(plan) {
  const fact = (Array.isArray(plan?.facts) ? plan.facts : [])
    .map((item) => String(item?.value || "").trim())
    .find(Boolean);
  if (!fact) return "开拓者，咱发现了一段值得期待的新旅程。你有空的时候，想不想和咱慢慢聊聊？现在忙也没关系。";
  const concise = fact.length <= 72 ? fact : `${fact.slice(0, 69)}……`;
  return `开拓者，咱最近发现了一件想和你分享的新鲜事：${concise}你有空时想听咱聊聊吗？现在忙也没关系。`;
}

function releaseGenerationPrompt({ basePrompt, policyPrompt, skillPrompt }) {
  return `${basePrompt}\n\n【当前已激活的区域发行策略】\n${policyPrompt}\n\n【发行行为 Skill】\n${skillPrompt}\n\n你正在生成一次由用户授权的主动发行对话开场。请在内部完成思考，只输出三月七对玩家说的一段自然语言，不得展示推理、策略、任务、灰度、指标、记忆系统或任何后台字段。只能引用提供的已审核事实；语气自然、低压力、容易拒绝，最多一次温和邀请。`;
}

async function generateReleaseOpening({
  policy,
  memories = [],
  apiKey,
  model,
  basePrompt,
  skillPrompt,
  requestChat,
  authorize = () => {},
  recordSuccess = () => {},
  recordFailure = () => {},
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  const fallback = () => ({ text: safeFallback(policy?.plan), source: "fallback", model: "local-rules", degraded: true });
  if (!apiKey || typeof requestChat !== "function") return { ...fallback(), reasonCode: "api_key_missing" };
  const payload = {
    instruction: "根据区域发行策略、已审核事实和允许复用的玩家记忆，生成一句自然的三月七主动发行开场。只输出玩家可见文本。",
    region: policy.region,
    plan: policy.plan,
    authorizedMemories: memories.map((memory) => ({ summary: memory.summary, tags: memory.tags || [] })),
    localTime: new Date().toLocaleString("zh-CN", { timeZone: policy.region?.timeZone || "UTC", hour12: false }),
  };
  const serialized = JSON.stringify(payload);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      authorize(serialized.length);
      const result = await requestChat({
        apiKey,
        model,
        thinking: true,
        messages: [{ role: "user", content: serialized }],
        systemPrompt: releaseGenerationPrompt({ basePrompt, policyPrompt: policy.systemPrompt, skillPrompt }),
        timeoutMs: 12_000,
      });
      recordSuccess();
      return { text: result.content, source: "model", model: result.model || model, degraded: false };
    } catch (error) {
      recordFailure(error?.code);
      if (attempt === 0 && RETRIABLE_CODES.has(error?.code)) {
        await sleep(350);
        continue;
      }
      return { ...fallback(), reasonCode: error?.code || "generation_failed" };
    }
  }
  return { ...fallback(), reasonCode: "generation_failed" };
}

module.exports = { generateReleaseOpening, releaseGenerationPrompt, safeFallback };
