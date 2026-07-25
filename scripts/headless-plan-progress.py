import argparse
from pathlib import Path
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "test-results"
OUTPUT.mkdir(exist_ok=True)
ARGS = argparse.ArgumentParser()
ARGS.add_argument("--start", action="store_true")
ARGS.add_argument("--observe", action="store_true")
ARGS.add_argument("--final", action="store_true")
args = ARGS.parse_args()


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=1)
    console_errors = []
    diagnostics = []
    page.on("console", lambda message: diagnostics.append(f"console:{message.type}:{message.text}"))
    page.on("pageerror", lambda error: diagnostics.append(f"pageerror:{error}"))
    page.on("requestfailed", lambda request: diagnostics.append(f"requestfailed:{request.url}:{request.failure}"))
    page.on("response", lambda response: diagnostics.append(f"response:{response.status}:{response.url}") if "/api/project/current" in response.url else None)
    page.goto("http://localhost:3000/plan", wait_until="networkidle")
    try:
        if args.observe:
            page.get_by_text("发行方案实时草稿", exact=True).wait_for(state="visible", timeout=30_000)
        elif args.final:
            page.get_by_role("button", name="完整重新生成").wait_for(state="visible", timeout=30_000)
        else:
            page.get_by_role("button", name="重新生成方案").wait_for(state="visible", timeout=30_000)
    except Exception:
        page.screenshot(path=str(OUTPUT / "plan-hydration-failure.png"), full_page=True)
        print({"body": page.locator("body").inner_text()[:2000], "diagnostics": diagnostics})
        raise
    page.screenshot(path=str(OUTPUT / "plan-current-state.png"), full_page=True)
    body = page.locator("body").inner_text()
    if args.observe:
        page.get_by_text("发行方案实时草稿", exact=True).wait_for(state="visible", timeout=30_000)
        page.screenshot(path=str(OUTPUT / "plan-live-progress.png"), full_page=True)
        live_text = page.get_by_text("发行方案实时草稿", exact=True).locator("xpath=ancestor::section[1]").inner_text()
        print({"live_visible": True, "preview": live_text[:1800], "console_errors": [item for item in diagnostics if item.startswith("console:error") or item.startswith("pageerror")], "screenshot": str(OUTPUT / "plan-live-progress.png")})
        browser.close()
        raise SystemExit(0)
    if args.final:
        assert "DOCUMENT MAP" in body, body[:2500]
        assert "AI 角色关系型发行" in body, body[:2500]
        assert "中国大陆" in body and "港澳台" in body, body[:2500]
        page.screenshot(path=str(OUTPUT / "plan-final-document.png"), full_page=True)
        print({"final_document_visible": True, "console_errors": [item for item in diagnostics if item.startswith("console:error") or item.startswith("pageerror")], "screenshot": str(OUTPUT / "plan-final-document.png")})
        browser.close()
        raise SystemExit(0)
    if args.start:
        page.get_by_role("button", name="重新生成方案").click()
        page.get_by_text("发行方案实时草稿", exact=True).wait_for(state="visible", timeout=30_000)
        page.screenshot(path=str(OUTPUT / "plan-live-start.png"), full_page=True)
        live_text = page.get_by_text("发行方案实时草稿", exact=True).locator("xpath=ancestor::section[1]").inner_text()
        print({"live_started": True, "preview": live_text[:1200], "screenshot": str(OUTPUT / "plan-live-start.png")})
        browser.close()
        raise SystemExit(0)
    assert "上一次生成已经失败" in body, body[:2000]
    assert "重新生成方案" in body, body[:2000]
    assert "0% 生成中" not in body, body[:2000]
    print({
        "url": page.url,
        "failed_state_visible": True,
        "retry_button_visible": page.get_by_role("button", name="重新生成方案").is_visible(),
        "console_errors": [item for item in diagnostics if item.startswith("console:error") or item.startswith("pageerror")],
        "screenshot": str(OUTPUT / "plan-current-state.png"),
    })
    browser.close()
