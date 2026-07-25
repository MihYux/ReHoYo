import json
import os
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("REHOYO_BASE_URL", "http://127.0.0.1:3000")
INPUT_FILE = Path(
    os.environ.get(
        "REHOYO_INPUT_FILE",
        r"D:\xwechat_files\wxid_ihb6iz732u7s12_f665\msg\file\2026-07\【内部模拟】崩坏星穹铁道2.0版本发行执行层输入材料.md",
    )
)
ARTIFACT_DIR = Path(os.environ.get("REHOYO_LIVE_ARTIFACT_DIR", ".artifacts/live-retest"))


def emit(event, **values):
    print(json.dumps({"event": event, **values}, ensure_ascii=False), flush=True)


def workspace_payload(page):
    response = page.request.get(f"{BASE_URL}/api/project/current")
    if not response.ok:
        raise RuntimeError(f"workspace request failed: {response.status} {response.text()}")
    body = response.json()
    return body.get("data", body)


def wait_button_idle(page, label, timeout=180_000):
    button = page.get_by_role("button", name=label)
    button.wait_for(state="visible", timeout=timeout)
    page.wait_for_function(
        "el => !el.disabled && !el.textContent.includes('生成中') && !el.textContent.includes('填写中')",
        arg=button.element_handle(),
        timeout=timeout,
    )
    return button


def main():
    if not INPUT_FILE.is_file():
        raise FileNotFoundError(INPUT_FILE)
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1920, "height": 1080})
        page = context.new_page()
        page.set_default_timeout(30_000)

        emit("open", url=f"{BASE_URL}/brief")
        page.goto(f"{BASE_URL}/brief", wait_until="networkidle")
        page.locator('input[type="file"]').set_input_files(str(INPUT_FILE))
        page.get_by_text(INPUT_FILE.name, exact=True).wait_for(state="visible", timeout=120_000)
        emit("uploaded", file=INPUT_FILE.name)

        autofill = wait_button_idle(page, "AI 自动填写")
        autofill.click()
        page.get_by_text("AI 结果尚未保存", exact=False).wait_for(state="visible", timeout=240_000)
        emit("autofill_complete")

        mode = page.locator('select').filter(has=page.locator('option[value="latest"]'))
        if mode.count() != 1:
            mode = page.locator('select:has(option[value="latest"])')
        mode.select_option("latest")
        page.get_by_role("button", name="保存录入", exact=True).click()
        page.wait_for_timeout(1200)
        emit("saved", evidenceMode="latest")

        generate = page.get_by_role("button", name="生成版本简报", exact=True)
        generate.click()
        page.get_by_text("EXECUTIVE SUMMARY", exact=False).wait_for(state="visible", timeout=300_000)
        page.get_by_role("link", name="进入区域判断", exact=False).wait_for(state="visible", timeout=60_000)
        brief_workspace = workspace_payload(page)
        emit(
            "brief_complete",
            briefStatus=brief_workspace["project"]["briefStatus"],
            glmConfigured=brief_workspace["glm"]["configured"],
        )
        page.screenshot(path=str(ARTIFACT_DIR / "01-brief-generated.png"), full_page=True)

        page.goto(f"{BASE_URL}/regions", wait_until="networkidle")
        start = page.get_by_role("button", name="研究并检查全部", exact=False)
        start.wait_for(state="visible", timeout=60_000)
        with page.expect_response(
            lambda response: response.request.method == "POST"
            and response.url.rstrip("/").endswith("/api/regions/research-batch"),
            timeout=60_000,
        ) as response_info:
            start.click()
        start_response = response_info.value
        if not start_response.ok:
            raise RuntimeError(f"batch start failed: {start_response.status} {start_response.text()}")
        start_body = start_response.json()
        batch_id = start_body.get("batch", start_body.get("data", {}).get("batch", {})).get("id")
        if not batch_id:
            raise RuntimeError(f"batch id missing: {start_body}")
        emit("batch_started", batchId=batch_id)

        deadline = time.monotonic() + 30 * 60
        last_revision = None
        batch = None
        while time.monotonic() < deadline:
            response = page.request.get(f"{BASE_URL}/api/regions/research-batch/{batch_id}")
            if not response.ok:
                raise RuntimeError(f"batch poll failed: {response.status} {response.text()}")
            body = response.json()
            batch = body.get("batch", body.get("data", {}).get("batch"))
            revision = (
                batch.get("status"),
                batch.get("synthesisStatus"),
                batch.get("qualityPassed"),
                batch.get("evidenceGap"),
                batch.get("failed"),
                batch.get("updatedAt"),
            )
            if revision != last_revision:
                emit(
                    "batch_progress",
                    status=batch.get("status"),
                    synthesisStatus=batch.get("synthesisStatus"),
                    completed=batch.get("completed"),
                    needsReview=batch.get("needsReview"),
                    evidenceGap=batch.get("evidenceGap"),
                    failed=batch.get("failed"),
                )
                last_revision = revision
            if batch.get("status") not in ("queued", "processing"):
                break
            time.sleep(2)
        else:
            raise TimeoutError("regional research did not settle within 30 minutes")

        # Give the client poller two cycles to consume the final synthesis revision.
        page.wait_for_timeout(3500)
        workspace = workspace_payload(page)
        citations = workspace.get("citations", [])
        regions = [region for region in workspace.get("regions", []) if region.get("selected")]
        analyzed = [region for region in regions if region.get("analysis")]

        page.goto(f"{BASE_URL}/regions?view=matrix&batch={batch_id}#region-matrix", wait_until="networkidle")
        page.wait_for_timeout(1500)
        graph = page.locator('[data-renderer="canvas-force"]').first
        graph.wait_for(state="attached", timeout=60_000)
        graph_evidence_count = int(graph.get_attribute("data-evidence-count") or "0")
        matrix = page.locator("#region-matrix")
        matrix.wait_for(state="visible", timeout=60_000)
        matrix_text = matrix.inner_text()
        differentiation_count = sum(
            1
            for region in analyzed
            if (region.get("analysis") or {}).get("differentiation", {}).get("paragraph")
        )
        stale_analysis_cells = matrix_text.count("尚未研究")
        stale_differentiation_cells = matrix_text.count("尚未综合")
        page.screenshot(path=str(ARTIFACT_DIR / "02-regions-final.png"), full_page=True)

        result = {
            "batchId": batch_id,
            "batchStatus": batch.get("status"),
            "synthesisStatus": batch.get("synthesisStatus"),
            "qualityPassed": batch.get("qualityPassed"),
            "evidenceGap": batch.get("evidenceGap"),
            "failed": batch.get("failed"),
            "selectedRegions": len(regions),
            "analyzedRegions": len(analyzed),
            "citationCount": len(citations),
            "graphEvidenceCount": graph_evidence_count,
            "differentiationCount": differentiation_count,
            "staleAnalysisCells": stale_analysis_cells,
            "staleDifferentiationCells": stale_differentiation_cells,
            "graphUpdated": graph_evidence_count == len(citations) and len(citations) > 0,
            "matrixUpdated": differentiation_count > 0 and stale_differentiation_cells < len(regions),
        }
        (ARTIFACT_DIR / "result.json").write_text(
            json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        emit("result", **result)
        browser.close()

        # Transport success and UI freshness are mandatory. Evidence gaps remain a
        # valid (blocked) research result and are reported instead of fabricated.
        if not result["graphUpdated"]:
            return 2
        if batch.get("synthesisStatus") in ("completed", "provisional") and not result["matrixUpdated"]:
            return 3
        return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
        (ARTIFACT_DIR / "error.txt").write_text(repr(error), encoding="utf-8")
        emit("error", type=type(error).__name__, message=str(error))
        raise
