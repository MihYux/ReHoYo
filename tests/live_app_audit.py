import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = os.environ.get("REHOYO_AUDIT_URL", "http://127.0.0.1:3018")
PAGE_PATH = os.environ.get("REHOYO_AUDIT_PATH", "/brief")
OUT = Path(__file__).resolve().parents[1] / ".artifacts"
OUT.mkdir(exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1600, "height": 1000})
    console_errors = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.goto(f"{BASE}{PAGE_PATH}", wait_until="networkidle", timeout=120_000)
    workspace = page.request.get(f"{BASE}/api/project/current").json()
    page.screenshot(path=str(OUT / ("regions-after-live-run.png" if PAGE_PATH == "/regions" else "brief-before-live-run.png")), full_page=True)
    result = {
        "project": {
            "gameName": workspace["project"]["gameName"],
            "versionName": workspace["project"]["versionName"],
            "briefStatus": workspace["project"]["briefStatus"],
            "planStatus": workspace["project"]["planStatus"],
            "evidenceMode": workspace["project"]["evidenceMode"],
            "evidenceCutoff": workspace["project"]["evidenceCutoff"],
            "budgetEnvelope": workspace["project"]["budgetEnvelope"],
        },
        "sources": workspace["sources"],
        "regions": [{"id": r["id"], "name": r["name"], "selected": r["selected"], "status": r["status"]} for r in workspace["regions"]],
        "citationCount": len(workspace["citations"]),
        "jobCount": len(workspace["jobs"]),
        "consoleErrors": console_errors,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    browser.close()
