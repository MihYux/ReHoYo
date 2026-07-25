import json
import os
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError, sync_playwright


base_url = os.environ.get("REHOYO_BASE_URL", "http://localhost:3000")
artifact_dir = Path(os.environ.get("REHOYO_ARTIFACT_DIR", ".data/test-artifacts"))
artifact_dir.mkdir(parents=True, exist_ok=True)
screenshot_path = artifact_dir / "headless-brief.png"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    console_errors = []
    failed_requests = []
    api_responses = []
    http_errors = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.on("requestfailed", lambda request: failed_requests.append({"url": request.url, "error": request.failure}))
    page.on("response", lambda response: api_responses.append({"url": response.url, "status": response.status}) if "/api/" in response.url else None)
    page.on("response", lambda response: http_errors.append({"url": response.url, "status": response.status}) if response.status >= 400 else None)
    page.goto(f"{base_url}/brief", wait_until="networkidle")
    loading_timed_out = False
    try:
        page.locator(".skeleton-page").wait_for(state="detached", timeout=30_000)
    except PlaywrightTimeoutError:
        loading_timed_out = True

    title_visible = page.locator("h1", has_text="先让系统准确理解").is_visible()
    failure_visible = page.get_by_text("操作未完成", exact=True).is_visible()
    approved_status_visible = page.locator(".status-approved").first.is_visible()
    direct_brief_edit_hidden = page.get_by_role("button", name="保存修改").count() == 0
    upload_visible = page.get_by_text("拖入版本文档或经营表格", exact=True).is_visible()
    autofill_visible = page.get_by_role("button", name="AI 自动填写").is_visible()
    page.screenshot(path=str(screenshot_path), full_page=True)
    browser.close()

report = {
    "baseUrl": base_url,
    "verdict": "pass" if title_visible and not failure_visible and approved_status_visible and direct_brief_edit_hidden and upload_visible and autofill_visible else "fail",
    "checks": {
        "titleVisible": title_visible,
        "failureBannerVisible": failure_visible,
        "approvedStatusVisible": approved_status_visible,
        "directBriefEditHidden": direct_brief_edit_hidden,
        "uploadVisible": upload_visible,
        "autofillVisible": autofill_visible,
        "loadingTimedOut": loading_timed_out,
    },
    "diagnostics": {
        "consoleErrors": console_errors[-10:],
        "failedRequests": failed_requests[-10:],
        "apiResponses": api_responses[-10:],
        "httpErrors": http_errors[-10:],
    },
    "screenshot": str(screenshot_path.resolve()),
}
print(json.dumps(report, ensure_ascii=False, indent=2))
if report["verdict"] != "pass":
    raise SystemExit(1)
