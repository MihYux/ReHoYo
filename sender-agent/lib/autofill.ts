import {
  AutofillFieldSchema,
  ProjectAutofillResponseSchema,
  ProjectInputSchema,
  type AutofillField,
  type AutofillSuggestion,
  type ProjectAutofillResponse,
  type ProjectInput,
} from "@/lib/contracts";

export const AUTOFILL_FIELDS = AutofillFieldSchema.options;

export const INTERNAL_ONLY_AUTOFILL_FIELDS = new Set<AutofillField>([
  "objective",
  "sellingPoints",
  "businessGoal",
  "totalBudget",
  "kpis",
  "characterProfiles",
  "constraints",
]);

export const AUTOFILL_FIELD_LABELS: Record<AutofillField, string> = {
  gameName: "游戏名称",
  versionName: "版本名称",
  launchDate: "计划上线日期",
  platforms: "发行平台",
  objective: "版本目标",
  sellingPoints: "核心卖点",
  contentAssets: "可用内容资产",
  businessGoal: "经营目标",
  totalBudget: "总预算",
  kpis: "核心 KPI",
  characterProfiles: "角色资料",
  constraints: "品牌 / IP 限制",
};

export function isAutofillFieldBlank(project: ProjectInput, field: AutofillField) {
  const value = project[field];
  return Array.isArray(value) ? value.length === 0 : typeof value === "string" && value.trim().length === 0;
}

function assignSuggestion(project: ProjectInput, suggestion: AutofillSuggestion) {
  const arrayValue = Array.isArray(suggestion.value)
    ? Array.from(new Set(suggestion.value.map((item) => item.trim()).filter(Boolean)))
    : [];
  const stringValue = typeof suggestion.value === "string" ? suggestion.value.trim() : "";

  switch (suggestion.field) {
    case "gameName": project.gameName = stringValue; break;
    case "versionName": project.versionName = stringValue; break;
    case "launchDate": project.launchDate = stringValue; break;
    case "platforms": project.platforms = arrayValue; break;
    case "objective": project.objective = stringValue; break;
    case "sellingPoints": project.sellingPoints = arrayValue; break;
    case "contentAssets": project.contentAssets = arrayValue; break;
    case "businessGoal": project.businessGoal = stringValue; break;
    case "totalBudget": project.totalBudget = stringValue; break;
    case "kpis": project.kpis = arrayValue; break;
    case "characterProfiles": project.characterProfiles = arrayValue; break;
    case "constraints": project.constraints = stringValue; break;
  }
}

export function filterAutofillResponse(projectInput: ProjectInput, rawResponse: ProjectAutofillResponse): ProjectAutofillResponse {
  const project = ProjectInputSchema.parse(projectInput);
  const response = ProjectAutofillResponseSchema.parse(rawResponse);
  const evidenceById = new Map(response.evidence.map((item) => [item.id, item]));
  const warnings = [...response.warnings];

  const suggestions = response.suggestions.filter((suggestion) => {
    if (!isAutofillFieldBlank(project, suggestion.field)) return false;
    if (suggestion.confidence === "low") {
      warnings.push(`${AUTOFILL_FIELD_LABELS[suggestion.field]}的证据不足，已保持空白。`);
      return false;
    }
    const evidence = suggestion.evidenceIds.map((id) => evidenceById.get(id)).filter(Boolean);
    if (!evidence.length || evidence.length !== suggestion.evidenceIds.length) {
      warnings.push(`${AUTOFILL_FIELD_LABELS[suggestion.field]}缺少可验证依据，已保持空白。`);
      return false;
    }
    if (INTERNAL_ONLY_AUTOFILL_FIELDS.has(suggestion.field) && !evidence.some((item) => item?.kind === "document")) {
      warnings.push(`${AUTOFILL_FIELD_LABELS[suggestion.field]}只能依据内部资料填写。`);
      return false;
    }
    return true;
  });

  return ProjectAutofillResponseSchema.parse({ ...response, suggestions, warnings: Array.from(new Set(warnings)) });
}

export function mergeAutofillSuggestions(projectInput: ProjectInput, rawResponse: ProjectAutofillResponse) {
  const original = ProjectInputSchema.parse(projectInput);
  const parsedResponse = ProjectAutofillResponseSchema.parse(rawResponse);
  if (parsedResponse.executionMode === "embedded_fixture" && parsedResponse.replacementProject) {
    const project = ProjectInputSchema.parse(parsedResponse.replacementProject);
    const missingFields = AUTOFILL_FIELDS.filter((field) => isAutofillFieldBlank(project, field));
    return {
      project,
      response: parsedResponse,
      appliedFields: AUTOFILL_FIELDS.filter((field) => !isAutofillFieldBlank(project, field)),
      preservedFields: [] as AutofillField[],
      missingFields,
    };
  }
  const response = filterAutofillResponse(original, parsedResponse);
  const project = ProjectInputSchema.parse({ ...original });
  const preservedFields = AUTOFILL_FIELDS.filter((field) => !isAutofillFieldBlank(original, field));
  const appliedFields: AutofillField[] = [];

  for (const suggestion of response.suggestions) {
    if (!isAutofillFieldBlank(project, suggestion.field)) continue;
    assignSuggestion(project, suggestion);
    appliedFields.push(suggestion.field);
  }

  const parsedProject = ProjectInputSchema.parse(project);
  const missingFields = AUTOFILL_FIELDS.filter((field) => isAutofillFieldBlank(parsedProject, field));
  return { project: parsedProject, response, appliedFields, preservedFields, missingFields };
}
