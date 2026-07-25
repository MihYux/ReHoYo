#!/usr/bin/env node

const args = new Set(process.argv.slice(2));
const baseUrl = process.env.REHOYO_BASE_URL || "http://127.0.0.1:3000";
const briefOnly = args.has("--brief-only");
const testBrief = args.has("--brief") || briefOnly;
const minimumScore = Number(process.env.REHOYO_LIVE_MIN_SCORE || 80);
const PROBE_FIELDS = ["gameName", "versionName", "launchDate", "platforms", "objective", "sellingPoints", "contentAssets"];
const PUBLIC_PROBE_FIELDS = new Set(["gameName", "versionName", "launchDate", "platforms", "contentAssets"]);

const INPUT_KEYS = [
  "gameName", "versionName", "launchDate", "platforms", "campaignStartWeek", "campaignEndWeek",
  "objective", "sellingPoints", "contentAssets", "businessGoal", "totalBudget", "kpis",
  "characterProfiles", "constraints",
];
const INTERNAL_ONLY_FIELDS = new Set([
  "objective", "sellingPoints", "businessGoal", "totalBudget", "kpis", "characterProfiles", "constraints",
]);

function projectInput(project) {
  return Object.fromEntries(INPUT_KEYS.map((key) => [key, project[key]]));
}

function isBlank(value) {
  return Array.isArray(value) ? value.length === 0 : typeof value === "string" ? value.trim() === "" : false;
}

async function request(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path} failed (${response.status}): ${payload.error || response.statusText}`);
  return payload;
}

function buildProbeInput(project) {
  const input = projectInput(project);
  for (const field of PROBE_FIELDS) input[field] = Array.isArray(input[field]) ? [] : "";
  return input;
}

function evaluateAutofill(snapshot, probe, result) {
  const evidence = new Map((result.evidence || []).map((item) => [item.id, item]));
  const suggestions = result.suggestions || [];
  const problems = [];
  const seen = new Set();

  for (const suggestion of suggestions) {
    if (seen.has(suggestion.field)) problems.push(`duplicate suggestion: ${suggestion.field}`);
    seen.add(suggestion.field);
    if (!isBlank(probe[suggestion.field])) problems.push(`would overwrite non-empty field: ${suggestion.field}`);
    const linked = suggestion.evidenceIds.map((id) => evidence.get(id)).filter(Boolean);
    if (linked.length !== suggestion.evidenceIds.length) problems.push(`missing evidence: ${suggestion.field}`);
    if (INTERNAL_ONLY_FIELDS.has(suggestion.field) && !linked.some((item) => item.kind === "document")) {
      problems.push(`internal-only field lacks document evidence: ${suggestion.field}`);
    }
  }

  const completedTools = new Set((result.toolTrace || []).filter((item) => item.status === "completed").map((item) => item.tool));
  for (const required of ["read_current_form", "list_uploaded_documents"]) {
    if (!completedTools.has(required)) problems.push(`required tool not completed: ${required}`);
  }
  if (PROBE_FIELDS.some((field) => PUBLIC_PROBE_FIELDS.has(field) && isBlank(probe[field])) && !completedTools.has("web_search_public_facts")) {
    problems.push("GLM Web Search was not completed for blank public fields");
  }
  if (PROBE_FIELDS.some((field) => PUBLIC_PROBE_FIELDS.has(field) && isBlank(probe[field])) && !Array.from(evidence.values()).some((item) => item.kind === "web")) {
    problems.push("GLM Web Search returned no usable web evidence");
  }
  if (suggestions.length < 3) problems.push("fewer than three evidence-backed suggestions for the blank-field probe");

  const expectedMatches = {};
  for (const field of ["gameName", "versionName", "launchDate"]) {
    const suggestion = suggestions.find((item) => item.field === field);
    const expected = snapshot.project[field];
    expectedMatches[field] = Boolean(suggestion && typeof suggestion.value === "string" && suggestion.value.trim() === expected.trim());
    if (expected && !expectedMatches[field]) problems.push(`did not recover known ${field}`);
  }

  const score = Math.max(0, 100 - problems.length * 20);
  return {
    score,
    verdict: score >= minimumScore ? "pass" : "fail",
    suggestedFields: suggestions.map((item) => item.field),
    evidenceCount: evidence.size,
    toolCalls: (result.toolTrace || []).map((item) => ({ tool: item.tool, status: item.status, resultCount: item.resultCount })),
    warningCount: (result.warnings || []).length,
    probeFields: PROBE_FIELDS,
    expectedMatches,
    problems,
  };
}

function evaluateBrief(snapshot, project) {
  const brief = project.brief;
  const validSourceIds = new Set(snapshot.sources.map((source) => source.id));
  const problems = [];
  if (!brief?.executiveSummary?.trim()) problems.push("missing executive summary");
  for (const field of ["goals", "sellingPoints", "assetInventory", "businessExpectations", "characterProfiles", "constraints"]) {
    if (!Array.isArray(brief?.[field])) problems.push(`invalid section: ${field}`);
  }
  if (!brief?.sourceFacts?.length && snapshot.sources.length) problems.push("no source facts from uploaded documents");
  if (brief?.sourceFacts?.some((fact) => !validSourceIds.has(fact.sourceId))) problems.push("source fact references unknown document");
  if (brief?.sourceFacts?.some((fact) => !/^片段 \d+$/.test(fact.locator))) problems.push("source fact uses a non-canonical locator");
  const totalItems = ["goals", "sellingPoints", "assetInventory", "businessExpectations", "characterProfiles", "constraints"]
    .reduce((sum, field) => sum + (brief?.[field]?.length || 0), 0);
  const minimumFacts = Math.min(8, Math.max(1, Math.ceil(totalItems / 6)));
  if ((brief?.sourceFacts?.length || 0) < minimumFacts) problems.push(`traceability is too sparse: expected at least ${minimumFacts} source facts`);
  const categoryCount = new Set((brief?.sourceFacts || []).map((fact) => fact.category)).size;
  if (totalItems >= 20 && categoryCount < 3) problems.push("source facts cover fewer than three business categories");
  if (totalItems > 48) problems.push("brief is too dense: more than 48 section items");
  const maxItemLength = Math.max(0, ...["goals", "sellingPoints", "assetInventory", "businessExpectations", "characterProfiles", "constraints"]
    .flatMap((field) => brief?.[field] || []).map((item) => item.length));
  if (maxItemLength > 220) problems.push("at least one brief item is longer than 220 characters");
  const score = Math.max(0, 100 - problems.length * 15);
  return {
    score,
    verdict: score >= minimumScore ? "pass" : "fail",
    status: project.briefStatus,
    sectionCounts: Object.fromEntries(["goals", "sellingPoints", "assetInventory", "businessExpectations", "characterProfiles", "constraints"].map((field) => [field, brief?.[field]?.length || 0])),
    sourceFactCount: brief?.sourceFacts?.length || 0,
    sourceCategoryCount: categoryCount,
    totalSectionItems: totalItems,
    maxItemLength,
    problems,
  };
}

async function main() {
  const snapshot = await request("/api/project/current");
  if (!snapshot.glm?.configured) throw new Error("The running server has no ZHIPU_API_KEY configured.");
  if (!snapshot.sources?.some((source) => source.status === "parsed")) throw new Error("No parsed source is available for a meaningful live test.");

  const report = {
    baseUrl,
    model: snapshot.glm.model,
    mode: briefOnly ? "brief-only" : testBrief ? "autofill+brief" : "autofill-read-only",
  };

  if (!briefOnly) {
    const probe = buildProbeInput(snapshot.project);
    const autofillStartedAt = Date.now();
    const autofill = await request("/api/brief/autofill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(probe),
    });
    report.autofill = { ...evaluateAutofill(snapshot, probe, autofill), durationMs: Date.now() - autofillStartedAt };
  }

  if (testBrief) {
    if (!snapshot.project.gameName || !snapshot.project.versionName) throw new Error("Brief test requires gameName and versionName in the current project.");
    const briefStartedAt = Date.now();
    const generated = await request("/api/brief/generate", { method: "POST" });
    report.brief = { ...evaluateBrief(snapshot, generated.project), durationMs: Date.now() - briefStartedAt };
  }

  console.log(JSON.stringify(report, null, 2));
  if (report.autofill?.verdict === "fail" || report.brief?.verdict === "fail") process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ verdict: "error", message: error.message }, null, 2));
  process.exitCode = 1;
});
