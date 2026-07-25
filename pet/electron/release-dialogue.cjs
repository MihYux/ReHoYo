const crypto = require("node:crypto");

const RETRIABLE_CODES = new Set(["RATE_LIMITED", "PROVIDER_UNAVAILABLE", "REQUEST_TIMEOUT", "NETWORK_ERROR"]);
const VARIATION_STYLES = [
  "从一个具体角色印象自然开场，由你决定最适合的措辞和节奏",
  "从旅途中的场景或氛围自然开场，不要使用公告式表达",
  "先提出一个轻松、有内容的问题，再自然带出本次版本信息",
  "像熟悉的同行者分享新发现一样开场，避免推销腔",
  "结合玩家已授权的兴趣点开场；没有合适记忆时不要假装了解玩家",
  "先说一个具体且可验证的新鲜点，再给玩家自由选择是否继续聊",
];

function normalizeForComparison(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function bigrams(value) {
  const normalized = normalizeForComparison(value);
  const result = new Set();
  for (let index = 0; index < normalized.length - 1; index += 1) result.add(normalized.slice(index, index + 2));
  return result;
}

function isNearDuplicate(candidate, previous = []) {
  const normalized = normalizeForComparison(candidate);
  if (!normalized) return true;
  const candidatePairs = bigrams(normalized);
  return previous.some((item) => {
    const prior = normalizeForComparison(item);
    if (!prior) return false;
    if (normalized === prior) return true;
    if (Math.min(normalized.length, prior.length) >= 18 && (normalized.includes(prior) || prior.includes(normalized))) return true;
    const priorPairs = bigrams(prior);
    if (!candidatePairs.size || !priorPairs.size) return false;
    let intersection = 0;
    for (const pair of candidatePairs) if (priorPairs.has(pair)) intersection += 1;
    const union = new Set([...candidatePairs, ...priorPairs]).size;
    return union > 0 && intersection / union >= 0.78;
  });
}

function variationStyle(variationKey = "") {
  const digest = crypto.createHash("sha256").update(String(variationKey)).digest();
  return VARIATION_STYLES[digest[0] % VARIATION_STYLES.length];
}

function directRevealTerms(plan = {}) {
  const source = [
    plan?.theme,
    plan?.narrative,
    ...(Array.isArray(plan?.facts) ? plan.facts.map((fact) => fact?.value) : []),
  ].filter(Boolean).join("。 ");
  const terms = new Set();
  for (const pattern of [
    /(?:介绍|认识|了解|聊聊)(?:一下|关于)?[“"]?([\p{L}·・]{2,12}?)(?=即将|将会|将在|会在|登场|上线|加入|[，。；：、“”"]|$)/gu,
    /(?:新角色|神秘人物|同行者)(?:名为|叫|是|：|:)?[“"]?([\p{L}·・]{2,12}?)(?=即将|将会|将在|会在|登场|上线|加入|[，。；：、“”"]|$)/gu,
  ]) {
    for (const match of source.matchAll(pattern)) {
      const term = String(match[1] || "").trim().replace(/[“”"']/gu, "");
      if (term && !/(?:新旅程|新版本|新世界|匹诺康尼)/u.test(term)) terms.add(term);
    }
  }
  return [...terms];
}

function prematurelyRevealsSubject(text, plan) {
  const value = String(text || "");
  return directRevealTerms(plan).some((term) => value.includes(term));
}

function playerExplicitlyRequestsReveal(text, plan) {
  const value = String(text || "");
  if (directRevealTerms(plan).some((term) => value.includes(term))) {
    return true;
  }
  return /(?:新角色|神秘人物|那个人|她|他).{0,12}(?:是谁|叫什么|名字|具体|揭晓)|(?:是谁|叫什么|名字|具体说说|揭晓).{0,12}(?:新角色|神秘人物|那个人|她|他)/u.test(value);
}

function proactiveOpeningWithinLength(text) {
  const value = String(text || "").trim();
  if (!value || value.length > 140) return false;
  const sentences = value
    .split(/[。！？!?]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
  return sentences.length >= 2 && sentences.length <= 3;
}

function safeFallback(plan, { variationKey = "", recentOpenings = [] } = {}) {
  const candidates = [
    "开拓者，最近的旅途好像多了一点说不清的神秘感。等你有心情时，咱再把发现慢慢讲给你听？",
    "对了开拓者，咱在路上碰见一件很适合留点悬念的事。先不揭晓，你想听的时候再叫咱就好。",
    "开拓者，今天望着车窗外时，咱总觉得下一段旅途会有意外的故事。你哪天好奇了，咱们再一起猜猜看。",
    "咱给下一段旅途留了一张没写名字的照片，开拓者。不用急着问答案，想听故事时咱就在这儿。",
  ];
  const digest = crypto.createHash("sha256").update(String(variationKey)).digest();
  const start = digest[1] % candidates.length;
  for (let offset = 0; offset < candidates.length; offset += 1) {
    const candidate = candidates[(start + offset) % candidates.length];
    if (!isNearDuplicate(candidate, recentOpenings)) return candidate;
  }
  return candidates[start];
}

function releaseGenerationPrompt({ basePrompt, policyPrompt, skillPrompt }) {
  return `${basePrompt}\n\n【当前已激活的区域发行策略】\n${policyPrompt || "只使用输入中的已审核事实，以自然、低压力的方式与玩家交流。"}\n\n【发行行为 Skill】\n${skillPrompt}\n\n你正在生成一次由用户授权的主动发行对话开场。先在内部判断此刻最自然、最有价值的说法，再只输出三月七对玩家说的一段自然语言。首次开场严格写成两到三句自然短句、只表达一个核心意思，整体不超过 140 个字符；不要把多个信息挤成长串。首次开场只留下旅途、氛围或故事线索，禁止直接点名方案中的新角色、神秘人物或核心揭晓对象；等玩家追问或明确感兴趣后才逐步说出名字。不要套固定公式，不要照抄“主题”、目标或整句事实，也不要说“和某个发行目标有关”。不得展示推理、策略、任务、灰度、指标、记忆系统或任何后台字段。只能引用提供的已审核事实；语气自然、低压力、容易拒绝，最多一次温和邀请。避免与输入中的近期发行开场重复，包括相同首句、句式和结尾。`;
}

async function generateReleaseOpening({
  policy,
  memories = [],
  recentOpenings = [],
  variationKey = "",
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
  const fallback = () => ({
    text: safeFallback(policy?.plan, { variationKey, recentOpenings }),
    source: "fallback",
    model: "local-rules",
    degraded: true,
  });
  if (!apiKey || typeof requestChat !== "function") return { ...fallback(), reasonCode: "api_key_missing" };
  const payload = {
    instruction: "请自行决定这一次最适合对该玩家说什么。生成自然、具体、有三月七人格的主动发行开场，只输出玩家可见文本；不得照抄发行主题或复用近期话术。",
    region: policy.region,
    plan: policy.plan,
    authorizedMemories: memories.map((memory) => ({ summary: memory.summary, tags: memory.tags || [] })),
    recentReleaseOpenings: recentOpenings.slice(-6),
    creativeDirection: variationStyle(variationKey),
    localTime: new Date().toLocaleString("zh-CN", { timeZone: policy.region?.timeZone || "UTC", hour12: false }),
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const serialized = JSON.stringify({
      ...payload,
      attempt: attempt + 1,
      ...(attempt > 0 ? { additionalInstruction: "上一版过于重复或调用失败，请换一个明显不同的切入点、首句和句式重新创作。" } : {}),
    });
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
      const text = String(result.content || "").trim();
      if (isNearDuplicate(text, recentOpenings) || prematurelyRevealsSubject(text, policy?.plan) || !proactiveOpeningWithinLength(text)) {
        recordFailure(
          isNearDuplicate(text, recentOpenings)
            ? "DUPLICATE_RELEASE_OPENING"
            : prematurelyRevealsSubject(text, policy?.plan)
              ? "PREMATURE_DIRECT_REVEAL"
              : "PROACTIVE_OPENING_TOO_LONG",
        );
        continue;
      }
      recordSuccess();
      return { text, source: "model", model: result.model || model, degraded: false };
    } catch (error) {
      recordFailure(error?.code);
      if (attempt < 2 && RETRIABLE_CODES.has(error?.code)) {
        await sleep(350);
        continue;
      }
      return { ...fallback(), reasonCode: error?.code || "generation_failed" };
    }
  }
  return { ...fallback(), reasonCode: "duplicate_generation" };
}

module.exports = {
  directRevealTerms,
  generateReleaseOpening,
  isNearDuplicate,
  playerExplicitlyRequestsReveal,
  prematurelyRevealsSubject,
  proactiveOpeningWithinLength,
  releaseGenerationPrompt,
  safeFallback,
  variationStyle,
};
