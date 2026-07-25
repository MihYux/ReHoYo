from pathlib import Path
from time import monotonic
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "test-results"
OUTPUT.mkdir(exist_ok=True)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 980}, device_scale_factor=1)
    page.add_init_script("""
      window.__pipTransitions = [];
      new MutationObserver(() => {
        const mode = document.querySelector('[data-region-graph-pip=true]')?.dataset.pipMode;
        const transitions = window.__pipTransitions;
        if (mode && transitions.at(-1)?.mode !== mode) transitions.push({ mode, at: performance.now() });
      }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-pip-mode'] });
    """)
    console_errors = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.on("pageerror", lambda error: console_errors.append(str(error)))
    started = monotonic()
    page.goto("http://localhost:3000/regions", wait_until="domcontentloaded")
    pip = page.locator('[data-region-graph-pip="true"]')
    pip.wait_for(state="visible", timeout=30_000)
    page.wait_for_function("document.querySelector('[data-region-graph-pip=true]')?.dataset.pipMode === 'intro'", timeout=30_000)
    intro_seen = monotonic()
    intro_box = pip.bounding_box()
    assert intro_box, "Intro graph has no bounding box"
    assert intro_box["x"] <= 1 and intro_box["y"] <= 1, intro_box
    assert intro_box["width"] >= 1438 and intro_box["height"] >= 978, intro_box
    assert pip.get_attribute("data-pip-mode") == "intro"
    page.screenshot(path=str(OUTPUT / "pip-intro-fullscreen.png"), full_page=False)

    page.wait_for_function("document.querySelector('[data-region-graph-pip=true]')?.dataset.pipMode === 'default'", timeout=2_000)
    transitions = page.evaluate("window.__pipTransitions")
    intro_transition = next(item for item in transitions if item["mode"] == "intro")
    default_transition = next(item for item in transitions if item["mode"] == "default")
    intro_duration = default_transition["at"] - intro_transition["at"]
    # Hydration and the first force-graph frame can expose the portal before the rendered-frame timer starts.
    assert 900 <= intro_duration <= 1_800, transitions
    page.wait_for_timeout(260)
    default_box = pip.bounding_box()
    assert default_box, "Default graph has no bounding box"
    assert 20 <= default_box["x"] <= 28, default_box
    assert 430 <= default_box["width"] <= 450, default_box
    assert default_box["x"] < 80, default_box
    page.screenshot(path=str(OUTPUT / "pip-default-left.png"), full_page=False)

    page.mouse.move(700, 500)
    page.mouse.wheel(0, 420)
    page.wait_for_function("document.querySelector('[data-region-graph-pip=true]')?.dataset.pipMode === 'minimized'", timeout=2_000)
    page.wait_for_timeout(90)
    collapsing_box = pip.bounding_box()
    assert collapsing_box, "Collapsing graph has no bounding box"
    assert 300 < collapsing_box["width"] < 440, collapsing_box
    page.wait_for_timeout(170)
    minimized_box = pip.bounding_box()
    assert minimized_box, "Minimized graph has no bounding box"
    assert 20 <= minimized_box["x"] <= 28, minimized_box
    assert 292 <= minimized_box["width"] <= 308, minimized_box
    assert not page.locator('[data-region-graph-pip=true] canvas').is_visible()
    page.screenshot(path=str(OUTPUT / "pip-minimized-on-scroll.png"), full_page=False)
    assert not console_errors, console_errors
    print({
        "intro_detected_ms": round((intro_seen - started) * 1000),
        "intro_box": intro_box,
        "default_box": default_box,
        "collapsing_box": collapsing_box,
        "minimized_box": minimized_box,
        "fullscreen_to_default_ms": round(intro_duration),
        "console_errors": console_errors,
    })
    browser.close()
