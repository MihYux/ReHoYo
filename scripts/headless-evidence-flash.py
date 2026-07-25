from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "test-results"
OUTPUT.mkdir(exist_ok=True)
CANVAS_SHOT = OUTPUT / "evidence-graph-canvas.png"


def evidence_centers(path: Path):
    image = Image.open(path).convert("RGB")
    width, height = image.size
    target = (213, 239, 242)
    mask = set()
    for y in range(height):
        for x in range(width):
            pixel = image.getpixel((x, y))
            if all(abs(pixel[index] - target[index]) <= 4 for index in range(3)):
                mask.add((x, y))
    components = []
    while mask:
        seed = mask.pop()
        stack = [seed]
        points = [seed]
        while stack:
            x, y = stack.pop()
            for candidate in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if candidate in mask:
                    mask.remove(candidate)
                    stack.append(candidate)
                    points.append(candidate)
        if 20 <= len(points) <= 130:
            components.append((sum(point[0] for point in points) / len(points), sum(point[1] for point in points) / len(points)))
    return components


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 980}, device_scale_factor=1)
    console_errors = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.on("pageerror", lambda error: console_errors.append(str(error)))
    page.goto("http://localhost:3000/regions", wait_until="networkidle")
    page.locator("[data-region-graph-pip=true]").wait_for(state="visible", timeout=30_000)
    expand = page.get_by_role("button", name="放大区域情报节点图")
    if expand.is_visible():
        expand.click()
    canvas = page.locator("[data-region-graph-pip=true] canvas")
    canvas.wait_for(state="visible", timeout=30_000)
    page.wait_for_timeout(2200)
    canvas.screenshot(path=str(CANVAS_SHOT))
    box = canvas.bounding_box()
    assert box, "Graph canvas has no bounding box"
    centers = evidence_centers(CANVAS_SHOT)
    assert centers, "No evidence-colored nodes found in canvas screenshot"

    selected = None
    for x, y in centers[:80]:
        page.mouse.click(box["x"] + x, box["y"] + y)
        page.wait_for_timeout(90)
        flash = page.locator('[data-evidence-flash="true"]')
        if flash.count():
            selected = flash.first
            break
    assert selected is not None, f"Clicked {min(80, len(centers))} evidence-colored candidates without a card highlight"
    evidence_id = selected.get_attribute("data-evidence-id")
    page.wait_for_timeout(280)
    focused_id = page.evaluate("document.activeElement?.getAttribute('data-evidence-id')")
    assert focused_id == evidence_id, {"expected": evidence_id, "focused": focused_id}
    page.screenshot(path=str(OUTPUT / "evidence-card-flash.png"), full_page=True)
    page.wait_for_timeout(2700)
    assert page.locator('[data-evidence-flash="true"]').count() == 0
    assert not console_errors, console_errors
    print({
        "evidence_id": evidence_id,
        "focused": focused_id,
        "flash_cleared": True,
        "candidate_nodes": len(centers),
        "screenshot": str(OUTPUT / "evidence-card-flash.png"),
    })
    browser.close()
