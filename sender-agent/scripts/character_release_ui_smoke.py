from pathlib import Path
import os
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get("REHOYO_BASE_URL", "http://127.0.0.1:3000")
ROOT = Path(__file__).resolve().parents[1]
SCREENSHOT = ROOT / ".data" / "character-release-smoke.png"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=1)
    console_errors = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.route("**/api/project/current", lambda route: route.fulfill(json={
        "project": {"briefStatus": "approved", "planStatus": "approved", "plan": {}, "versionName": "2.0"},
        "regions": [{"id": "region-jp", "selected": True, "status": "quality_passed"}],
        "sources": [], "citations": [], "jobs": [],
        "glm": {"configured": False, "model": "glm-5.2"},
        "providers": {"glm": {"configured": False, "model": "glm-5.2"}},
    }))
    page.route("**/api/character-release", lambda route: route.fulfill(json={
        "schemaVersion": 1, "activeRegionId": "region-jp", "updatedAt": "2026-07-25T00:00:00.000Z", "auditLog": [],
        "regions": [{
            "id": "region-jp", "sourceRegionId": "region-jp", "code": "JP", "name": "日本",
            "language": "ja-JP", "timeZone": "Asia/Tokyo", "quietHours": {"start": "22:00", "end": "08:00"},
            "segments": [{"id": "returning", "name": "剧情向回流玩家", "eligible": 5200, "authorized": 4100, "reachable": 3300, "excluded": 210}],
            "releaseAgents": [{"id": "voice", "name": "日本三月七表达 AI", "description": "保持角色语气与互动方式", "enabled": True}],
        }],
        "workspaces": {"region-jp": {"regionId": "region-jp", "tasks": [], "releases": [], "emergencyStoppedAt": None}},
    }))
    response = page.goto(f"{BASE_URL}/character-release", wait_until="domcontentloaded")
    SCREENSHOT.parent.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(SCREENSHOT), full_page=True)
    if response is None or response.status >= 400:
        raise AssertionError(f"character-release returned {response.status if response else 'no response'}: {page.locator('body').inner_text()[:1200]}")
    heading = page.get_by_role("heading", name="三月七角色发行控制台")
    if heading.count() == 0:
        raise AssertionError(f"heading missing; title={page.title()}; body={page.locator('body').inner_text()[:1200]}")
    heading.wait_for(timeout=60_000)
    assert page.locator("nav[aria-label='工作流'] a").count() == 5
    assert "is-active" in page.get_by_role("link", name="05 角色发行").get_attribute("class")
    assert page.locator("nav[aria-label='角色发行工作流'] button").count() == 4
    assert page.get_by_role("button", name="同步当前区域").is_visible()
    workflow = page.locator("nav[aria-label='角色发行工作流'] button")
    workflow.nth(1).click()
    page.get_by_role("heading", name="玩家分群").wait_for()
    workflow.nth(2).click()
    page.get_by_text("先准备一个版本任务").wait_for()
    page.screenshot(path=str(SCREENSHOT), full_page=True)
    assert not console_errors, f"Browser console errors: {console_errors}"
    print(f"character-release UI smoke passed; screenshot={SCREENSHOT}")
    browser.close()
