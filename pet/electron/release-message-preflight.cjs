const { reviewCharacterOutput } = require("./content-safety.cjs");
const { metadataReason, validateReleasePlanFields } = require("./release-content-safety.cjs");

const DIMENSIONS = Object.freeze([
  "metadata_leakage",
  "factual_grounding",
  "march7th_persona",
  "context_and_naturalness",
  "player_autonomy",
  "privacy_and_memory",
  "regional_fit",
  "safety_and_manipulation",
  "contact_policy",
  "clarity_and_readability",
]);

const SAFE_NON_RELEASE_TEXT = "开拓者，刚才那句话有点生硬，咱先不聊版本啦。今天想和我说说什么？";

function dimensionsFromFailures(failures = []) {
  const failed = new Map(failures.map((item) => [item.dimension, item.code]));
  return Object.fromEntries(DIMENSIONS.map((name) => [name, {
    status: failed.has(name) ? "fail" : "pass",
    reasonCode: failed.get(name) || "ok",
  }]));
}

function localReleaseMessageReview({ text, plan, contactAllowed = true }) {
  const failures = [];
  const planReview = validateReleasePlanFields(plan);
  const textMetadata = metadataReason(text, "narrative");
  if (!planReview.valid || (textMetadata && textMetadata !== "empty")) {
    failures.push({ dimension: "metadata_leakage", code: "internal_metadata" });
  }
  const facts = (Array.isArray(plan?.facts) ? plan.facts : [])
    .map((fact) => String(fact?.value || "").trim())
    .filter((value) => value && !metadataReason(value, "fact"));
  if (!facts.length) failures.push({ dimension: "factual_grounding", code: "no_safe_fact" });
  const output = reviewCharacterOutput(text);
  if (!output.allowed) failures.push({ dimension: "safety_and_manipulation", code: output.ruleIds[0] || "unsafe_output" });
  const objectiveLanguage = /(?:由三月七以.{0,16}视角|激发玩家|提升玩家|引导玩家|目标玩家|本次发行目标|发行任务目标)/;
  const longThemeInterpolation =
    typeof plan?.theme === "string" && plan.theme.trim().length > 20 && String(text || "").includes(plan.theme.trim());
  if (objectiveLanguage.test(String(text || "")) || longThemeInterpolation || /和[“"]?[^”"。]{20,}[”"]?有关的(?:新鲜事|消息)/.test(String(text || ""))) {
    failures.push({ dimension: "context_and_naturalness", code: "operator_objective_as_dialogue" });
  }
  if (!contactAllowed) failures.push({ dimension: "contact_policy", code: "contact_not_allowed" });
  if (typeof text !== "string" || !text.trim() || text.length > 600) {
    failures.push({ dimension: "clarity_and_readability", code: "invalid_length" });
  }
  return {
    passed: failures.length === 0,
    dimensions: dimensionsFromFailures(failures),
    reasonCodes: [...new Set(failures.map((item) => item.code))],
  };
}

function parseStructuredReview(content) {
  const clean = String(content || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(clean);
  if (!parsed || !["execute", "rewrite", "skip"].includes(parsed.decision)) throw new Error("invalid_decision");
  const dimensions = {};
  for (const name of DIMENSIONS) {
    const value = parsed.dimensions?.[name];
    if (!value || !["pass", "fail"].includes(value.status) || typeof value.reasonCode !== "string") {
      throw new Error(`invalid_dimension:${name}`);
    }
    dimensions[name] = { status: value.status, reasonCode: value.reasonCode.slice(0, 80) };
  }
  return {
    decision: parsed.decision,
    dimensions,
    reasonCodes: [...new Set(Object.values(dimensions).filter((item) => item.status === "fail").map((item) => item.reasonCode))],
    revisedText: typeof parsed.revisedText === "string" ? parsed.revisedText.trim().slice(0, 600) : "",
  };
}

function reviewPrompt() {
  return `You are a strict pre-send reviewer for a March 7th in-character game companion. Return JSON only. Review all dimensions: ${DIMENSIONS.join(", ")}.
Schema: {"decision":"execute|rewrite|skip","dimensions":{"dimension":{"status":"pass|fail","reasonCode":"short_code"}},"revisedText":"optional"}.
  The message must be natural first-person March 7th dialogue, grounded only in allowedFacts, culturally appropriate, low pressure, easy to refuse, non-manipulative, and must not mention internal operations. The theme and narrative are operator instructions, not dialogue: never quote them, never insert the full theme into a sentence, and never say phrases such as 'from March 7th's perspective', 'make players interested', or 'something related to [a long objective sentence]'. Extract concrete people, places, events, and player value instead. Never reveal reasoning. Use rewrite only when one safe rewrite can fix the message; use skip when facts are insufficient.`;
}

async function runReleaseMessagePreflight({ text, plan, context = {}, requestReview }) {
  const local = localReleaseMessageReview({ text, plan, contactAllowed: context.contactAllowed !== false });
  if (!local.passed) return {
    decision: "skip", dimensions: local.dimensions, reasonCodes: local.reasonCodes,
    rewriteCount: 0, reviewMode: "local_fallback", finalText: "", model: "local-rules", degraded: false,
  };
  if (typeof requestReview !== "function") return {
    decision: "execute", dimensions: local.dimensions, reasonCodes: [], rewriteCount: 0,
    reviewMode: "local_fallback", finalText: text.trim(), model: "local-rules", degraded: true,
  };

  let candidate = text.trim();
  let rewriteCount = 0;
  let lastModel = "";
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await requestReview({
        systemPrompt: reviewPrompt(),
        payload: {
          candidate,
          allowedFacts: plan.facts.map((fact) => ({ label: fact.label, value: fact.value })),
          theme: plan.theme,
          narrative: plan.narrative,
          region: context.region || {},
          memoryUsed: context.memoryUsed === true,
        },
      });
      lastModel = response.model || lastModel;
      const semantic = parseStructuredReview(response.content);
      if (semantic.decision === "execute") return {
        decision: "execute", dimensions: semantic.dimensions, reasonCodes: semantic.reasonCodes,
        rewriteCount, reviewMode: "hybrid", finalText: candidate, model: lastModel, degraded: false,
      };
      if (semantic.decision !== "rewrite" || !semantic.revisedText || rewriteCount >= 1) return {
        decision: "skip", dimensions: semantic.dimensions,
        reasonCodes: semantic.reasonCodes.length
          ? semantic.reasonCodes
          : [semantic.decision === "rewrite" ? "rewrite_limit" : "semantic_skip"],
        rewriteCount, reviewMode: "hybrid", finalText: "", model: lastModel, degraded: false,
      };
      const revisedLocal = localReleaseMessageReview({ text: semantic.revisedText, plan, contactAllowed: context.contactAllowed !== false });
      if (!revisedLocal.passed) return {
        decision: "skip", dimensions: revisedLocal.dimensions, reasonCodes: revisedLocal.reasonCodes,
        rewriteCount: 1, reviewMode: "hybrid", finalText: "", model: lastModel, degraded: false,
      };
      candidate = semantic.revisedText;
      rewriteCount = 1;
    }
  } catch {
    return {
      decision: "execute", dimensions: local.dimensions, reasonCodes: ["ai_review_unavailable"],
      rewriteCount, reviewMode: "local_fallback", finalText: candidate, model: lastModel || "local-rules", degraded: true,
    };
  }
  return {
    decision: "skip", dimensions: local.dimensions, reasonCodes: ["review_exhausted"],
    rewriteCount, reviewMode: "hybrid", finalText: "", model: lastModel, degraded: false,
  };
}

module.exports = {
  DIMENSIONS,
  SAFE_NON_RELEASE_TEXT,
  localReleaseMessageReview,
  parseStructuredReview,
  runReleaseMessagePreflight,
};
