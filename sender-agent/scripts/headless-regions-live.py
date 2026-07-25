import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright


base_url = os.environ.get("REHOYO_BASE_URL", "http://localhost:3000")
batch_id = os.environ.get("REHOYO_BATCH_ID", "")
if not batch_id:
    raise SystemExit("REHOYO_BATCH_ID is required")
artifact_dir = Path(os.environ.get("REHOYO_ARTIFACT_DIR", ".data/test-artifacts"))
artifact_dir.mkdir(parents=True, exist_ok=True)
screenshot_path = artifact_dir / "headless-regions-live.png"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    console_errors = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.goto(f"{base_url}/regions?view=matrix&batch={batch_id}#region-matrix", wait_until="networkidle")
    page.locator("#region-matrix").wait_for(state="visible", timeout=20_000)
    batch = page.evaluate(f"fetch('/api/regions/research-batch/{batch_id}').then(response => response.json())")
    workspace = page.evaluate("fetch('/api/project/current').then(response => response.json())")
    matrix_headers = page.locator("#region-matrix [class*='compareHeader'] strong").count()
    matrix_text = page.locator("#region-matrix").inner_text()
    graph = page.locator('[data-renderer="canvas-force"]').first
    graph.wait_for(state="attached", timeout=20_000)
    graph_evidence = int(graph.get_attribute("data-evidence-count") or "0")
    citation_count = len(workspace["citations"])
    differentiation_count = sum(1 for region in workspace["regions"] if region.get("analysis", {}).get("differentiation", {}).get("paragraph"))
    final_url = page.url
    page.screenshot(path=str(screenshot_path), full_page=True)
    browser.close()

summary = batch["batch"]
report = {
    "verdict": "pass" if summary["status"] == "completed" and summary["qualityPassed"] == 7 and summary["failed"] == 0 and matrix_headers == 7 and graph_evidence == citation_count and citation_count > 0 and differentiation_count == 7 and "尚未综合" not in matrix_text else "fail",
    "checks": {
        "batchStatus": summary["status"], "qualityPassed": summary["qualityPassed"], "failed": summary["failed"],
        "matrixHeaders": matrix_headers, "urlSwitched": "view=matrix" in final_url,
        "citationCount": citation_count, "graphEvidenceCount": graph_evidence,
        "differentiationCount": differentiation_count, "matrixHasStaleDifferentiation": "尚未综合" in matrix_text,
    },
    "diagnostics": {"consoleErrors": console_errors[-10:]},
    "screenshot": str(screenshot_path.resolve()),
}
print(json.dumps(report, ensure_ascii=False, indent=2))
if report["verdict"] != "pass":
    raise SystemExit(1)
