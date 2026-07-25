import json
import os
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright


base_url = os.environ.get("REHOYO_BASE_URL", "http://localhost:3000")
artifact_dir = Path(os.environ.get("REHOYO_ARTIFACT_DIR", ".data/test-artifacts"))
artifact_dir.mkdir(parents=True, exist_ok=True)
screenshot_path = artifact_dir / "headless-plan-agent.png"
with urllib.request.urlopen(f"{base_url}/api/project/current", timeout=10) as response:
    workspace_payload = json.loads(response.read().decode("utf-8"))
for region in workspace_payload.get("regions", []):
    if region.get("selected") and region.get("analysis"):
        region["status"] = "approved"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=1)
    console_errors = []
    failed_requests = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.on("pageerror", lambda error: console_errors.append(str(error)))
    page.on("requestfailed", lambda request: failed_requests.append({"url": request.url, "error": request.failure}))
    page.route("**/api/project/current", lambda route: route.fulfill(status=200, content_type="application/json; charset=utf-8", body=json.dumps(workspace_payload, ensure_ascii=False)))
    page.add_init_script("""
        window.__rehoyoAgentNoticeSeen = false;
        addEventListener('DOMContentLoaded', () => {
          const inspect = () => {
            const node = document.querySelector("aside[aria-label='AI 发行文档 Agent']");
            if (node && (node.dataset.agentNotice === 'true' || node.className.includes('agentDockNotice'))) {
              window.__rehoyoAgentNoticeSeen = true;
            }
          };
          new MutationObserver(inspect).observe(document.documentElement, {subtree: true, childList: true, attributes: true});
          inspect();
        });
    """)

    page.goto(f"{base_url}/plan", wait_until="networkidle")
    early_agent_dock = page.locator("aside[aria-label='AI 发行文档 Agent']")
    early_agent_dock.wait_for(state="visible", timeout=30_000)
    notice_seen = bool(page.evaluate("window.__rehoyoAgentNoticeSeen"))

    global_axis = page.locator("#global-axis")
    workspace = page.locator("#regional-plan")
    global_axis.wait_for(state="visible", timeout=15_000)
    global_box = global_axis.bounding_box()
    workspace_box = workspace.bounding_box()
    global_before_regions = global_box["y"] < workspace_box["y"]
    global_full_width = abs(global_box["width"] - workspace_box["width"]) <= 2
    global_textarea = page.get_by_label("全球主轴")
    global_text_metrics = global_textarea.evaluate("element => ({clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, overflowY: getComputedStyle(element).overflowY, fontSize: getComputedStyle(element).fontSize})")
    global_no_inner_scroll = global_text_metrics["scrollHeight"] <= global_text_metrics["clientHeight"] + 2 and global_text_metrics["overflowY"] == "hidden"

    region_headings = page.locator("text=REGIONAL PLAN /")
    one_region_visible = region_headings.count() == 1
    region_buttons = workspace.locator("nav[aria-label='发行方案文档目录'] button")
    region_button_count = region_buttons.count() - 1
    if region_button_count > 1:
        target_name = region_buttons.nth(2).inner_text().strip().split("\n")[-1]
        region_buttons.nth(2).click()
        page.wait_for_timeout(250)
        switched_region = page.locator("article h2").first.inner_text().strip() == target_name
    else:
        switched_region = region_button_count == 1

    source_rail = page.locator("aside[aria-label='来源智能']")
    source_count = int(source_rail.get_attribute("data-source-count") or "0")
    rendered_sources = source_rail.locator("a[target='_blank']").count()
    all_sources_rendered = rendered_sources == source_count and source_count > 8
    source_filters = all(page.get_by_label(label).is_visible() for label in ["搜索来源", "来源区域", "来源维度", "来源类型"])
    source_list_metrics = source_rail.locator("a[target='_blank']").first.locator("xpath=parent::*").evaluate("element => ({clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, overflowY: getComputedStyle(element).overflowY})")
    source_list_scrolls_independently = source_list_metrics["overflowY"] == "auto" and source_list_metrics["scrollHeight"] > source_list_metrics["clientHeight"]
    execution_boundary_visible = source_rail.get_by_text("执行边界", exact=True).is_visible()

    role_input = page.get_by_label("角色名称").first
    role_style = role_input.evaluate("element => { const s = getComputedStyle(element); const r = element.getBoundingClientRect(); return { background: s.backgroundColor, color: s.color, width: r.width, maxWidth: s.maxWidth }; }")
    role_not_black = role_style["background"] not in ("rgb(0, 0, 0)", "rgba(0, 0, 0, 1)") and role_style["color"] != role_style["background"]
    asset_dependencies_visible = page.get_by_text("资产依赖", exact=True).first.is_visible()

    plan = workspace_payload["project"]["plan"]
    target_region = plan["regions"][0]
    target_region["materialStrategy"] = ["无头验收：以时刻场景美术为核心"]
    patch_event = {
        "type": "patch",
        "patch": {"scope": "region", "regionId": target_region["regionId"], "field": "materialStrategy", "value": target_region["materialStrategy"], "reason": "无头验收补丁", "sourceIds": []},
        "plan": plan,
        "highlightKey": f"region:{target_region['regionId']}:materialStrategy",
    }

    def agent_route(route):
        if route.request.method != "POST":
            route.continue_()
            return
        stream = "data: " + json.dumps({"type": "started", "runId": "headless-plan-agent"}, ensure_ascii=False) + "\n\n"
        stream += "data: " + json.dumps({"type": "phase", "phase": "editing", "label": "应用结构化修改"}, ensure_ascii=False) + "\n\n"
        stream += "data: " + json.dumps(patch_event, ensure_ascii=False) + "\n\n"
        route.fulfill(status=200, content_type="text/event-stream; charset=utf-8", body=stream)

    page.route("**/api/plan/agent", agent_route)
    agent_dock = page.locator("aside[aria-label='AI 发行文档 Agent']")
    pip_metrics = agent_dock.evaluate("element => { const r = element.getBoundingClientRect(); const s = getComputedStyle(element); return {position: s.position, left: Math.round(r.left), bottom: Math.round(innerHeight - r.bottom), width: Math.round(r.width)}; }")
    pip_fixed_bottom_left = pip_metrics["position"] == "fixed" and pip_metrics["left"] <= 32 and pip_metrics["bottom"] <= 80 and 400 <= pip_metrics["width"] <= 480
    pip_default_mode = agent_dock.get_attribute("data-agent-mode") == "default"
    page.get_by_role("button", name="收起 AI 文档 Agent").click()
    page.wait_for_timeout(260)
    pip_collapses = agent_dock.get_attribute("data-agent-mode") == "minimized" and agent_dock.locator("div[aria-hidden='true']").count() == 1
    page.get_by_role("button", name="展开 AI 文档 Agent").click()
    page.wait_for_timeout(260)
    page.get_by_label("AI 文档修改指令").fill("将中国大陆方案调整为以时刻场景美术为核心")
    page.get_by_role("button", name="发送文档修改指令").click()
    page.get_by_text("无头验收：以时刻场景美术为核心", exact=False).wait_for(state="visible", timeout=8_000)
    live_patch_visible = True
    agent_open = page.get_by_text("AI 发行文档助手", exact=True).is_visible() and page.get_by_label("AI 文档修改指令").is_visible()
    agent_style = agent_dock.evaluate("element => { const s = getComputedStyle(element); return {backgroundImage: s.backgroundImage, boxShadow: s.boxShadow}; }")
    restrained_agent_visual = agent_style["backgroundImage"] == "none" and agent_style["boxShadow"] == "none"

    page.screenshot(path=str(screenshot_path), full_page=True)
    browser.close()

checks = {
    "noticeSeenWithinFirstSecond": notice_seen,
    "globalBeforeRegions": global_before_regions,
    "globalFullWidth": global_full_width,
    "globalNoInnerScroll": global_no_inner_scroll,
    "globalTextMetrics": global_text_metrics,
    "oneRegionVisible": one_region_visible,
    "regionButtonCount": region_button_count,
    "regionSwitchWorks": switched_region,
    "sourceCount": source_count,
    "renderedSources": rendered_sources,
    "allSourcesRendered": all_sources_rendered,
    "sourceFiltersVisible": source_filters,
    "sourceListScrollsIndependently": source_list_scrolls_independently,
    "sourceListMetrics": source_list_metrics,
    "executionBoundaryVisible": execution_boundary_visible,
    "roleInputNotBlack": role_not_black,
    "roleStyle": role_style,
    "assetDependenciesVisible": asset_dependencies_visible,
    "pipFixedBottomLeft": pip_fixed_bottom_left,
    "pipMetrics": pip_metrics,
    "pipDefaultMode": pip_default_mode,
    "pipCollapses": pip_collapses,
    "agentOpen": agent_open,
    "livePatchVisible": live_patch_visible,
    "restrainedAgentVisual": restrained_agent_visual,
}
passed = all(value for key, value in checks.items() if key not in {"globalTextMetrics", "regionButtonCount", "sourceCount", "renderedSources", "sourceListMetrics", "roleStyle", "pipMetrics"})
report = {"verdict": "pass" if passed else "fail", "checks": checks, "consoleErrors": console_errors[-10:], "failedRequests": failed_requests[-10:], "screenshot": str(screenshot_path.resolve())}
print(json.dumps(report, ensure_ascii=False, indent=2))
if not passed:
    raise SystemExit(1)
