import collections
import datetime as dt
import json
import os
import sys
import requests

sys.stdout.reconfigure(encoding="utf-8")
base = os.environ.get("REHOYO_AUDIT_URL", "http://127.0.0.1:3019")
workspace = requests.get(f"{base}/api/project/current", timeout=30).json()
project = workspace["project"]
citations = workspace["citations"]
by_region = collections.defaultdict(list)
for citation in citations:
    by_region[citation["regionId"]].append(citation)
valid_requirement_ids = {item["id"] for item in project["humanContract"]["requirements"]}
cutoff = dt.datetime.fromisoformat(project["evidenceCutoff"].replace("Z", "+00:00"))

regions = []
for region in workspace["regions"]:
    analysis = region.get("analysis")
    sources = by_region[region["id"]]
    dimensions = collections.Counter(source["dimension"] for source in sources)
    languages = collections.Counter(source.get("language") or "unknown" for source in sources)
    claims = [] if not analysis else sum((analysis[key] for key in ["playerSignals", "marketEnvironment", "sentimentAndCompetition", "culturalMoments"]), [])
    source_ids = {source["id"] for source in sources}
    missing_snapshot_links = [claim["text"] for claim in claims if not claim.get("citationSnapshotIds") or not set(claim["citationSnapshotIds"]).issubset(source_ids)]
    missing_requirement_links = [claim["text"] for claim in claims if not claim.get("requirementIds") or not set(claim["requirementIds"]).issubset(valid_requirement_ids)]
    post_cutoff = []
    missing_dates = []
    for source in sources:
        raw_date = source.get("publishedAt") or ""
        if not raw_date and source["dimension"] in ("sentiment", "culture"):
            missing_dates.append(source.get("displayId") or source["id"])
        if raw_date:
            try:
                parsed = dt.datetime.fromisoformat(raw_date.replace("Z", "+00:00"))
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=dt.timezone.utc)
                if parsed > cutoff:
                    post_cutoff.append(source.get("displayId") or source["id"])
            except ValueError:
                missing_dates.append(source.get("displayId") or source["id"])
    text = json.dumps(analysis, ensure_ascii=False) if analysis else ""
    regions.append({
        "name": region["name"], "status": region["status"], "analysis": bool(analysis), "claimCount": len(claims),
        "differentiation": bool(analysis and analysis.get("differentiation")), "sourceCount": len(sources),
        "dimensions": dimensions, "languages": languages, "missingSnapshotLinks": missing_snapshot_links,
        "missingRequirementLinks": missing_requirement_links, "postCutoff": post_cutoff, "missingDates": missing_dates,
        "redlineTerms": [term for term in ["流萤死亡", "死亡伏笔", "身份揭晓", "结局揭示"] if term in text],
        "researchNote": analysis.get("researchNote", "") if analysis else "",
        "claims": [claim["text"] for claim in claims],
        "sources": [{"id": source.get("displayId") or source["id"], "dimension": source["dimension"], "date": source.get("publishedAt"), "language": source.get("language"), "title": source["title"], "url": source["url"]} for source in sources],
    })

canonical_urls = [source["url"] for source in citations]
result = {
    "cutoff": project["evidenceCutoff"],
    "researchRunId": project["activeResearchRunId"],
    "citationCount": len(citations),
    "duplicateCanonicalUrls": [url for url, count in collections.Counter(canonical_urls).items() if count > 1],
    "regions": regions,
}
print(json.dumps(result, ensure_ascii=False, indent=2, default=dict))
