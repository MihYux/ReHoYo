from copy import deepcopy

from playwright.sync_api import Route, sync_playwright


BASE_URL = "http://localhost:3000"
EDIT_MARKER = "｜人工最终编辑"


def ready_snapshot(snapshot):
    state = deepcopy(snapshot)
    state["project"]["planStatus"] = "needs_review"
    for region in state["regions"]:
        if not region.get("selected"):
            continue
        region["status"] = "quality_passed"
        analysis = region.get("analysis") or {}
        differentiation = analysis.get("differentiation") or {}
        differentiation["provisional"] = False
        analysis["differentiation"] = differentiation
        region["analysis"] = analysis
    return state


def install_routes(page, snapshot, trace):
    state = ready_snapshot(snapshot)

    def current_project(route: Route) -> None:
        route.fulfill(status=200, json=state)

    def save_plan(route: Route) -> None:
        plan = route.request.post_data_json
        trace["saved_plan"] = plan
        state["project"]["plan"] = plan
        state["project"]["planStatus"] = "needs_review"
        route.fulfill(status=200, json={"project": state["project"]})

    def approve(route: Route) -> None:
        plan = route.request.post_data_json["plan"]
        trace["approved_plan"] = plan
        state["project"]["plan"] = plan
        state["project"]["planStatus"] = "approved"
        route.fulfill(status=200, json={"project": state["project"]})

    def sync_character(route: Route) -> None:
        trace["synced_region_id"] = route.request.post_data_json["regionId"]
        route.fulfill(status=200, json={"taskId": "task-browser-smoke", "data": {}})

    page.route("**/api/project/current", current_project)
    page.route("**/api/plan", save_plan)
    page.route("**/api/plan/approve", approve)
    page.route("**/api/character-release/sync", sync_character)
    return state


def run() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        seed_page = browser.new_page()
        response = seed_page.request.get(f"{BASE_URL}/api/project/current")
        assert response.ok, f"Could not load workspace fixture: {response.status}"
        snapshot = response.json()
        assert snapshot["project"].get("plan"), "Workspace fixture needs a generated plan"
        assert snapshot["project"]["plan"].get("characterSymbiosisRelease"), "Workspace fixture needs character plans"
        seed_page.close()

        trace = {}
        page = browser.new_page(viewport={"width": 1600, "height": 1100})
        install_routes(page, snapshot, trace)
        page.goto(f"{BASE_URL}/plan", wait_until="networkidle")
        global_axis = page.get_by_label("全球主轴")
        global_axis.wait_for()
        global_axis.fill(global_axis.input_value() + EDIT_MARKER)
        page.get_by_role("button", name="确认最终方案").click()
        page.wait_for_url("**/export")
        assert trace["approved_plan"]["globalAxis"].endswith(EDIT_MARKER)
        assert page.get_by_role("heading", name="三月七角色共生方案").count() == 1
        assert "审批门禁" not in page.locator("body").inner_text()

        import_button = page.get_by_role("button", name="导入角色发行").first
        import_button.click()
        page.wait_for_url("**/character-release?taskId=task-browser-smoke")
        assert trace.get("synced_region_id")
        page.close()

        gate_page = browser.new_page()
        gate_state = ready_snapshot(snapshot)
        gate_page.route("**/api/project/current", lambda route: route.fulfill(status=200, json=gate_state))
        gate_page.goto(f"{BASE_URL}/export", wait_until="networkidle")
        gate_page.get_by_role("heading", name="请先确认最终方案").wait_for()
        assert gate_page.get_by_role("link", name="下载完整策略").count() == 0
        gate_page.close()

        browser.close()
        print("Plan edit, approval, export, and character import smoke test passed.")


if __name__ == "__main__":
    run()
