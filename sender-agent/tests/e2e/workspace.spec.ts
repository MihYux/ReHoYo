import { expect, test } from "@playwright/test";

test("shows the three-stage Chinese workspace", async ({ page }, testInfo) => {
  await page.goto("/brief");
  await expect(page.getByRole("heading", { name: /先让系统准确理解/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "工作流" })).toContainText("版本理解");
  await expect(page.getByRole("navigation", { name: "工作流" })).toContainText("区域判断");
  await expect(page.getByRole("navigation", { name: "工作流" })).toContainText("发行方案");
  await expect(page.locator("body")).toHaveCSS("box-shadow", "none");
  await page.waitForTimeout(650);
  await expect(page.locator(".page-enter")).toHaveCSS("opacity", "1");
  await expect(page.getByRole("heading", { name: /先让系统准确理解/ })).toHaveCSS("color", "rgb(16, 36, 51)");
  await page.screenshot({ path: testInfo.outputPath("brief-workspace.png"), fullPage: true });
});

test("uploads by drag and drop, fills only blanks, and saves after review", async ({ page }) => {
  let uploaded = false;
  let projectPutCount = 0;
  let storedProject = {
    id: "current",
    gameName: "",
    versionName: "",
    launchDate: "",
    platforms: [] as string[],
    campaignStartWeek: -8,
    campaignEndWeek: 4,
    objective: "",
    sellingPoints: [] as string[],
    contentAssets: [] as string[],
    businessGoal: "",
    totalBudget: "",
    kpis: [] as string[],
    characterProfiles: [] as string[],
    constraints: "",
    brief: null,
    briefStatus: "draft",
    plan: null,
    planStatus: "draft",
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
  };
  const source = { id: "source-1", name: "版本资料.md", extension: ".md", mimeType: "text/markdown", size: 1024, parser: "local", status: "parsed", extractedLength: 280, error: "", createdAt: "2026-07-24T00:00:00.000Z" };

  await page.route("**/api/project/current", async (route) => {
    if (route.request().method() === "PUT") {
      projectPutCount += 1;
      storedProject = { ...storedProject, ...route.request().postDataJSON(), updatedAt: "2026-07-24T01:00:00.000Z" };
      await route.fulfill({ json: { project: storedProject } });
      return;
    }
    await route.fulfill({ json: { project: storedProject, regions: [], sources: uploaded ? [source] : [], citations: [], jobs: [], glm: { configured: true, model: "glm-5.2" } } });
  });
  await page.route("**/api/sources", async (route) => {
    uploaded = true;
    await route.fulfill({ status: 201, json: { sources: [source] } });
  });
  await page.route("**/api/brief/autofill", async (route) => {
    await route.fulfill({ json: {
      suggestions: [
        { field: "gameName", value: "星穹远征", confidence: "high", evidenceIds: ["WEB-001"] },
        { field: "versionName", value: "AI 不应覆盖的版本名", confidence: "high", evidenceIds: ["WEB-001"] },
        { field: "launchDate", value: "2026-09-10", confidence: "high", evidenceIds: ["WEB-001"] },
        { field: "objective", value: "通过新主线提升回流玩家首周参与", confidence: "medium", evidenceIds: ["DOC-source-1-1"] },
      ],
      evidence: [
        { id: "DOC-source-1-1", kind: "document", title: "版本资料.md", snippet: "版本目标", sourceId: "source-1", locator: "片段 1", url: "", publisher: "", publishedAt: "" },
        { id: "WEB-001", kind: "web", title: "官方版本公告", snippet: "公开上线信息", sourceId: "", locator: "", url: "https://example.com/official", publisher: "游戏官网", publishedAt: "2026-07-01" },
      ],
      toolTrace: [
        { tool: "read_current_form", status: "completed", resultCount: 1, label: "读取当前录入" },
        { tool: "search_internal_documents", status: "completed", resultCount: 1, label: "版本目标" },
        { tool: "web_search_public_facts", status: "completed", resultCount: 1, label: "官方版本公告" },
      ],
      warnings: [],
    } });
  });

  await page.goto("/brief");
  const sectionHeadings = page.getByRole("heading", { level: 2 });
  await expect(sectionHeadings.nth(0)).toContainText("内部资料");
  await expect(sectionHeadings.nth(1)).toContainText("版本基础信息");
  await expect(page.getByRole("button", { name: "AI 自动填写" })).toBeDisabled();

  const dropZone = page.locator('[aria-describedby="upload-boundary"]');
  await dropZone.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["版本目标：提升回流玩家首周参与"], "版本资料.md", { type: "text/markdown" }));
    element.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await expect(dropZone).toHaveCSS("border-style", "solid");
  await dropZone.evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["版本目标：提升回流玩家首周参与"], "版本资料.md", { type: "text/markdown" }));
    element.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await expect(page.getByText("版本资料.md")).toBeVisible();

  await page.getByLabel(/版本名称/).fill("人工版本名称");
  await page.getByRole("button", { name: "AI 自动填写" }).click();
  await expect(page.getByLabel(/游戏名称/)).toHaveValue("星穹远征");
  await expect(page.getByLabel(/版本名称/)).toHaveValue("人工版本名称");
  await expect(page.getByLabel(/计划上线日期/)).toHaveValue("2026-09-10");
  await expect(page.getByLabel(/版本目标/)).toHaveValue("通过新主线提升回流玩家首周参与");
  await expect(page.getByText("已填写 3 项", { exact: true })).toBeVisible();
  expect(projectPutCount).toBe(0);

  await page.getByRole("button", { name: "保存录入" }).click();
  await expect.poll(() => projectPutCount).toBe(1);
  await page.reload();
  await expect(page.getByLabel(/游戏名称/)).toHaveValue("星穹远征");
  await expect(page.getByLabel(/版本名称/)).toHaveValue("人工版本名称");
});
