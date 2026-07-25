import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright


base_url = os.environ.get("REHOYO_BASE_URL", "http://localhost:3000")
batch_id = os.environ.get("REHOYO_BATCH_ID", "4107da31-a0af-488c-af21-3267790b97a0")
artifact_dir = Path(os.environ.get("REHOYO_ARTIFACT_DIR", ".artifacts/live-retest"))
artifact_dir.mkdir(parents=True, exist_ok=True)
screenshot_path = artifact_dir / "region-detail-redesign.png"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page(viewport={"width": 1920, "height": 1080})
    console_errors = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.goto(f"{base_url}/regions", wait_until="networkidle")
    region_rail = page.locator("[class*='regionRail']")
    region_rail.wait_for(state="visible", timeout=20_000)
    region_rail.get_by_role("button", name="港澳台", exact=False).click()
    page.get_by_text("区域核心差异", exact=True).wait_for(state="visible", timeout=20_000)
    page.locator("[data-region-graph-pip='true']").evaluate("element => element.style.display = 'none'")
    document = page.locator("[class*='analysisDocument']")
    text = document.inner_text()
    sentence_count = document.locator("[class*='differentiationItem']").count()
    evidence_cards = page.locator("[class*='sourceCard']").count()
    document.screenshot(path=str(screenshot_path))
    report = {
        "verdict": "pass" if sentence_count == 5 and evidence_cards > 0 and "RESEARCH NOTE" not in text and "30秒路演数据集" not in text else "fail",
        "checks": {
            "sentenceCount": sentence_count,
            "evidenceCards": evidence_cards,
            "researchNoteRemoved": "RESEARCH NOTE" not in text and "30秒路演数据集" not in text,
            "coreHeadingVisible": "区域核心差异" in text,
        },
        "consoleErrors": console_errors,
        "screenshot": str(screenshot_path.resolve()),
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    browser.close()

if report["verdict"] != "pass":
    raise SystemExit(1)
