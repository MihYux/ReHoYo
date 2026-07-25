import { describe, expect, it } from "vitest";
import { ProjectAutofillResponseSchema, ReleasePlanSchema } from "@/lib/contracts";
import { embeddedDemoAutofillResponse, embeddedDemoFixture, embeddedDemoPlan } from "@/lib/embedded-demo-fixture";
import { EMBEDDED_DEMO_FILE_NAME, embeddedDemoState, isEmbeddedDemoDocument } from "@/lib/embedded-demo";

const canonicalText = `# 《崩坏：星穹铁道》2.0「假如在午夜入梦」版本发行执行层输入材料\r\n\r\n> 数据冻结时间：2024 年 1 月 2 日\r\n> 版本上线时间：2024 年 2 月 6 日\r\n# 1｜产品侧版本移交单\r\n# 2｜版本经营目标输入`;

describe("embedded HSR 2.0 workflow fixture", () => {
  it("matches the normalized target name and required content markers", () => {
    expect(isEmbeddedDemoDocument({ name: EMBEDDED_DEMO_FILE_NAME.normalize("NFD"), extractedText: canonicalText })).toBe(true);
    expect(embeddedDemoState([
      { name: "other.md", extractedText: "unrelated" },
      { name: EMBEDDED_DEMO_FILE_NAME, extractedText: canonicalText },
    ]).eligible).toBe(true);
  });

  it("does not match similar names or incomplete documents", () => {
    expect(isEmbeddedDemoDocument({ name: `副本-${EMBEDDED_DEMO_FILE_NAME}`, extractedText: canonicalText })).toBe(false);
    expect(isEmbeddedDemoDocument({ name: EMBEDDED_DEMO_FILE_NAME, extractedText: canonicalText.replace("版本经营目标输入", "") })).toBe(false);
  });

  it("ships schema-valid autofill, brief and seven-region plan data", () => {
    const autofill = ProjectAutofillResponseSchema.parse(embeddedDemoAutofillResponse());
    expect(autofill.executionMode).toBe("embedded_fixture");
    expect(autofill.replacementProject).toEqual(embeddedDemoFixture.input);
    expect(embeddedDemoFixture.brief.dataFreezeDate).toBe("2024-01-02");
    const plan = ReleasePlanSchema.parse(embeddedDemoPlan("runtime-research-id"));
    expect(plan.regions).toHaveLength(7);
    expect(plan.characterSymbiosisRelease).toHaveLength(7);
    expect(plan.researchRunId).toBe("runtime-research-id");
    expect(plan.sourceIds.every((id) => !embeddedDemoFixture.sourceRefs.some((reference) => reference.id === id))).toBe(true);
  });
});
