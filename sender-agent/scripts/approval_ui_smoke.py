import os
from pathlib import Path

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("REHOYO_BASE_URL", "http://localhost:3000")
ARTIFACT = Path(__file__).resolve().parents[1] / ".artifacts" / "approval-ui-smoke.png"


def main() -> None:
    ARTIFACT.parent.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1100})
        errors: list[str] = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
        page.goto(f"{BASE_URL}/brief", wait_until="networkidle")
        page.screenshot(path=str(ARTIFACT), full_page=True)
        try:
            page.locator("label", has_text="已确认预算口径").wait_for(timeout=15_000)
        except Exception:
            raise AssertionError(f"budget confirmation did not render; browser errors: {errors[:5]}")
        budget_checkbox = page.locator('label:has-text("已确认预算口径") input[type="checkbox"]')
        assert budget_checkbox.count() == 1
        page.goto(f"{BASE_URL}/plan", wait_until="networkidle")
        page.get_by_text("三月七共生发行方案", exact=False).first.wait_for()
        page.get_by_text("三月七以同行者视角介绍黑天鹅，引导玩家对匹诺康尼产生兴趣", exact=True).first.wait_for()
        page.screenshot(path=str(ARTIFACT), full_page=True)
        browser.close()
    print(f"approval UI smoke passed: {ARTIFACT}")


if __name__ == "__main__":
    main()
