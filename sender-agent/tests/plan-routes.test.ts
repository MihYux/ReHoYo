import { beforeEach, describe, expect, it, vi } from "vitest";

const getProject = vi.fn();
const setPlan = vi.fn();

vi.mock("@/lib/db", () => ({ getProject, setPlan }));

describe("plan editing and human confirmation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProject.mockResolvedValue({ plan: { globalAxis: "existing" }, planStatus: "needs_review" });
    setPlan.mockImplementation(async (plan, planStatus) => ({ plan, planStatus }));
  });

  it("saves direct edits as needs_review", async () => {
    const { PATCH } = await import("@/app/api/plan/route");
    const edited = { globalAxis: "edited" };
    const response = await PATCH(new Request("http://localhost/api/plan", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(edited) }));
    expect(response.status).toBe(200);
    expect(setPlan).toHaveBeenCalledWith(edited, "needs_review");
  });

  it("uses the submitted document as the final human-confirmed version", async () => {
    const { POST } = await import("@/app/api/plan/approve/route");
    const edited = { globalAxis: "latest unsaved edit" };
    const response = await POST(new Request("http://localhost/api/plan/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: edited }) }));
    expect(response.status).toBe(200);
    expect(setPlan).toHaveBeenCalledWith(edited, "approved");
  });
});
