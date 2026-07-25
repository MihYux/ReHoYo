import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const generated = JSON.parse(await fs.readFile(path.join(root, "lib", "generated-hsr2-evidence-cache.json"), "utf8"));
const koreanSupplement = JSON.parse(await fs.readFile(path.join(root, "lib", "hsr2-korean-supplement.json"), "utf8"));
const northAmericaSupplement = JSON.parse(await fs.readFile(path.join(root, "lib", "hsr2-na-supplement.json"), "utf8"));
const webSupplement = JSON.parse(await fs.readFile(path.join(root, "lib", "hsr2-web-supplement.json"), "utf8"));
const webSupplement2 = JSON.parse(await fs.readFile(path.join(root, "lib", "hsr2-web-supplement-2.json"), "utf8"));
const webSupplement3 = JSON.parse(await fs.readFile(path.join(root, "lib", "hsr2-web-supplement-3.json"), "utf8"));
const seeds = [...generated, ...koreanSupplement, ...northAmericaSupplement, ...webSupplement, ...webSupplement2, ...webSupplement3];

const gamePattern = /(honkai\s*:?\s*star\s*rail|崩坏\s*:?\s*星穹铁道|崩壞\s*:?\s*星穹鐵道|崩壊\s*:?\s*スターレイル|붕괴\s*:?\s*스타레일)/i;
const versionPattern = /(version\s*2\.0|ver\.?\s*2\.0|v2\.0|star\s*rail\s*2\.0|2\.0\s*版本|2\.0\s*버전|penacony|匹诺康尼|匹諾康尼|ピノコニー|페나코니|white night)/i;

function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|amp|quot|#39);/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function htmlPrimaryText(html) {
  const values = [];
  for (const pattern of [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
    /<title[^>]*>([\s\S]*?)<\/title>/i,
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
  ]) {
    const match = html.match(pattern);
    if (match?.[1]) values.push(visibleText(decodeEntities(match[1])));
  }
  return values.join(" ").replace(/\s+/g, " ").trim();
}

async function fetchSource(seed, controller) {
  const parsed = new URL(seed.url);
  if (parsed.hostname === "www.hoyolab.com" && /^\/article\/\d+/.test(parsed.pathname)) {
    const postId = parsed.pathname.match(/\d+/)?.[0];
    const apiUrl = `https://bbs-api-os.hoyolab.com/community/post/wapi/getPostFull?post_id=${postId}`;
    const response = await fetch(apiUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 ReHoYoEvidenceAudit/2.0", Accept: "application/json" },
    });
    if (!response.ok) return { ok: false, status: response.status, finalUrl: seed.url };
    const payload = await response.json();
    const post = payload?.data?.post?.post;
    if (!post) return { ok: false, status: "invalid_hoyolab_payload", finalUrl: seed.url };
    const primary = `${post.subject || ""} ${visibleText(post.content || "").slice(0, 2_000)}`;
    return {
      ok: true,
      finalUrl: seed.url,
      primary,
      text: `${post.subject || ""} ${visibleText(post.content || "")}`,
      gameConfirmed: Number(post.game_id) === 6,
    };
  }

  const response = await fetch(seed.url, {
    redirect: "follow",
    signal: controller.signal,
    headers: { "User-Agent": "Mozilla/5.0 ReHoYoEvidenceAudit/2.0", Accept: "text/html,application/xhtml+xml,text/plain" },
  });
  if (!response.ok) return { ok: false, status: response.status, finalUrl: response.url || seed.url };
  const contentType = response.headers.get("content-type") || "";
  if (!/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)) {
    return { ok: false, status: "non_text", finalUrl: response.url, contentType };
  }
  const html = (await response.text()).slice(0, 1_500_000);
  const text = visibleText(html).slice(0, 100_000);
  return {
    ok: true,
    finalUrl: response.url,
    primary: `${htmlPrimaryText(html)} ${text.slice(0, 2_000)}`,
    text,
    gameConfirmed: false,
  };
}

async function verify(seed) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const source = await fetchSource(seed, controller);
    if (!source.ok) {
      return {
        ...seed,
        verification: source.status === "non_text" ? "non_text" : "unreachable",
        reason: source.status === "non_text" ? source.contentType : `HTTP ${source.status}`,
        finalUrl: source.finalUrl,
        checkedAt: new Date().toISOString(),
      };
    }
    const hasGame = source.gameConfirmed || gamePattern.test(source.primary);
    const hasVersion = versionPattern.test(source.primary);
    return {
      ...seed,
      verification: hasGame && hasVersion ? "verified" : "off_topic",
      reason: !hasGame
        ? "missing_hsr_anchor_in_primary_content"
        : !hasVersion
          ? "missing_2.0_penacony_anchor_in_primary_content"
          : "",
      finalUrl: source.finalUrl,
      checkedAt: new Date().toISOString(),
      contentChars: source.text.length,
    };
  } catch (error) {
    return {
      ...seed,
      verification: "unreachable",
      reason: error?.name === "AbortError" ? "timeout" : String(error?.message || error),
      finalUrl: seed.url,
      checkedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timer);
  }
}

const audit = new Array(seeds.length);
let cursor = 0;
async function worker() {
  while (cursor < seeds.length) {
    const index = cursor++;
    audit[index] = await verify(seeds[index]);
  }
}
await Promise.all(Array.from({ length: 8 }, () => worker()));

const verified = audit
  .filter((item) => item.verification === "verified")
  .map((item) => ({
    regionCode: item.regionCode,
    title: item.title,
    url: item.finalUrl || item.url,
    publishedAt: item.publishedAt,
    dimensions: item.dimensions,
    query: item.query,
    discoveredAt: item.discoveredAt,
    verifiedAt: item.checkedAt,
  }));
const unique = [...new Map(verified.map((item) => [`${item.regionCode}:${item.url.replace(/[?#].*$/, "").replace(/\/$/, "")}`, item])).values()];

await fs.writeFile(path.join(root, "lib", "hsr2-evidence-cache-audit.json"), `${JSON.stringify(audit, null, 2)}\n`, "utf8");
if (unique.length < 150) {
  throw new Error(`Only ${unique.length}/${seeds.length} pages directly verified as primarily about HSR 2.0/Penacony; active cache was not replaced.`);
}
await fs.writeFile(path.join(root, "lib", "verified-hsr2-evidence-cache.json"), `${JSON.stringify(unique, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({
  candidates: seeds.length,
  verified: unique.length,
  rejected: seeds.length - unique.length,
  byRegion: Object.fromEntries(["cn", "jp", "kr", "na", "eu", "sea", "hmt"].map((code) => [code, unique.filter((item) => item.regionCode === code).length])),
}, null, 2)}\n`);
