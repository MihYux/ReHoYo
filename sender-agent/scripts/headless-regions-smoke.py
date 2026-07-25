import json
import os
import re
from pathlib import Path

from playwright.sync_api import sync_playwright


base_url = os.environ.get("REHOYO_BASE_URL", "http://localhost:3000")
artifact_dir = Path(os.environ.get("REHOYO_ARTIFACT_DIR", ".data/test-artifacts"))
artifact_dir.mkdir(parents=True, exist_ok=True)
screenshot_path = artifact_dir / "headless-regions.png"
searching_screenshot_path = artifact_dir / "headless-regions-searching.png"
graph_screenshot_path = artifact_dir / "headless-regions-graph.png"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    console_errors = []
    failed_requests = []
    http_errors = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.on("requestfailed", lambda request: failed_requests.append({"url": request.url, "error": request.failure}))
    page.on("response", lambda response: http_errors.append({"url": response.url, "status": response.status}) if response.status >= 400 else None)

    page.goto(f"{base_url}/regions", wait_until="networkidle")
    workspace = page.evaluate("fetch('/api/project/current').then(response => response.json())")
    regions = workspace.get("regions", [])
    batch_id = "headless-regional-batch"
    poll_count = {"value": 0}

    def batch_payload(completed=False):
        items = []
        for index, region in enumerate(regions):
            approved = completed or index < max(1, len(regions) // 2)
            items.append({
                "jobId": f"job-{index}", "regionId": region["id"], "regionName": region["name"],
                "status": "quality_passed" if approved else "processing",
                "phase": "quality_passed" if approved else "searching",
                "progress": 100 if approved else 46, "attempt": 1, "error": "",
            })
        approved_count = len(regions) if completed else sum(1 for item in items if item["status"] == "quality_passed")
        return {"batch": {
            "id": batch_id, "status": "completed" if completed else "processing", "total": len(regions),
            "queued": 0, "processing": 0 if completed else len(regions) - approved_count,
            "completed": approved_count, "qualityPassed": approved_count, "evidenceGap": 0, "failed": 0,
            "synthesisStatus": "completed" if completed else "pending", "activeConcurrency": 3,
            "items": items, "createdAt": "2026-07-24T00:00:00.000Z", "updatedAt": "2026-07-24T00:00:01.000Z",
        }}

    def route_batch(route):
        if route.request.method == "POST":
            route.fulfill(status=202, content_type="application/json", body=json.dumps(batch_payload(False)))
            return
        poll_count["value"] += 1
        route.fulfill(status=200, content_type="application/json", body=json.dumps(batch_payload(poll_count["value"] >= 2)))

    page.route("**/api/regions/research-batch**", route_batch)
    start_button = page.get_by_role("button", name=re.compile("研究并检查全部"))
    start_visible = start_button.is_visible()
    graph_pip = page.locator("[data-region-graph-pip='true']")
    graph_visible = graph_pip.is_visible()
    pip_metrics = graph_pip.evaluate("element => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return { position: style.position, rightGap: Math.round(innerWidth - rect.right), bottomGap: Math.round(innerHeight - rect.bottom), width: Math.round(rect.width) }; }")
    pip_fixed = pip_metrics["position"] == "fixed" and pip_metrics["rightGap"] <= 32 and pip_metrics["bottomGap"] <= 80
    graph_root = page.locator("section[aria-label='区域情报节点图'] [data-renderer='canvas-force']")
    background_pan_disabled = graph_root.get_attribute("data-pan-enabled") == "false"
    individual_node_drag_enabled = graph_root.get_attribute("data-node-drag-enabled") == "true"
    canvas_visible = graph_root.locator("canvas").is_visible()
    static_svg_absent = graph_root.locator("svg").count() == 0
    evidence_count = int(graph_root.get_attribute("data-evidence-count") or "0")
    all_evidence_loaded = evidence_count == len(workspace.get("citations", []))
    contract_hidden = page.get_by_text("HUMAN CONTRACT / 人工约束", exact=False).count() == 0
    start_button.click()
    page.get_by_text("检索公开信号", exact=False).first.wait_for(state="visible", timeout=5_000)
    page.screenshot(path=str(searching_screenshot_path), full_page=True)
    zoom_button = page.get_by_role("button", name="放大节点图")
    if zoom_button.count():
        for _ in range(3):
            zoom_button.click()
    page.wait_for_timeout(250)
    if graph_root.is_visible():
        graph_root.screenshot(path=str(graph_screenshot_path))
    page.locator("#region-matrix").wait_for(state="visible", timeout=15_000)
    page.wait_for_url(re.compile(r".*view=matrix.*batch=headless-regional-batch.*"), timeout=15_000)
    matrix_visible = page.locator("#region-matrix h2").is_visible()
    url_switched = "view=matrix" in page.url and f"batch={batch_id}" in page.url
    compact_height = page.locator("section[aria-label='区域情报节点图'] canvas").evaluate("element => Math.round(element.getBoundingClientRect().height)")
    page.screenshot(path=str(screenshot_path), full_page=True)
    fullscreen_button = page.get_by_role("button", name="放大区域情报节点图")
    if fullscreen_button.count():
        fullscreen_button.click()
        page.wait_for_timeout(300)
    fullscreen_pan_disabled = graph_root.get_attribute("data-pan-enabled") == "false"
    browser.close()

report = {
    "baseUrl": base_url,
    "verdict": "pass" if start_visible and graph_visible and pip_fixed and background_pan_disabled and individual_node_drag_enabled and canvas_visible and static_svg_absent and all_evidence_loaded and contract_hidden and matrix_visible and url_switched and compact_height <= 300 and fullscreen_pan_disabled else "fail",
    "checks": {
        "startButtonVisible": start_visible,
        "graphVisible": graph_visible,
        "pipFixedBottomRight": pip_fixed,
        "pipMetrics": pip_metrics,
        "backgroundPanDisabled": background_pan_disabled,
        "individualNodeDragEnabled": individual_node_drag_enabled,
        "canvasVisible": canvas_visible,
        "staticSvgAbsent": static_svg_absent,
        "evidenceNodes": evidence_count,
        "workspaceCitations": len(workspace.get("citations", [])),
        "allEvidenceLoaded": all_evidence_loaded,
        "contractHidden": contract_hidden,
        "matrixVisible": matrix_visible,
        "urlSwitched": url_switched,
        "compactGraphHeight": compact_height,
        "fullscreenPanDisabled": fullscreen_pan_disabled,
        "regionCount": len(regions),
    },
    "diagnostics": {
        "consoleErrors": console_errors[-10:],
        "failedRequests": failed_requests[-10:],
        "httpErrors": http_errors[-10:],
    },
    "screenshot": str(screenshot_path.resolve()),
    "searchingScreenshot": str(searching_screenshot_path.resolve()),
    "graphScreenshot": str(graph_screenshot_path.resolve()),
}
print(json.dumps(report, ensure_ascii=False, indent=2))
if report["verdict"] != "pass":
    raise SystemExit(1)
