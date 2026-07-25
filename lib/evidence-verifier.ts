import dns from "node:dns/promises";
import https from "node:https";
import net from "node:net";
import { canonicalizeUrl, stableHash } from "@/lib/governance";
import type { RegionResearchProfile, ResearchDimension } from "@/lib/region-profiles";

const MAX_BYTES = 1_048_576;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const MAX_CONCURRENT_PAGE_VERIFICATIONS = 4;
let activePageVerifications = 0;
const pageVerificationWaiters: Array<() => void> = [];

export type VerifiedPage = {
  canonicalUrl: string;
  finalUrl: string;
  title: string;
  publisher: string;
  text: string;
  contentHash: string;
  detectedLanguage: string;
  publisherMarket: string;
  contentMarket: string;
  claimScope: "regional" | "global_context" | "irrelevant";
  claimedPublishedAt: string;
  verifiedPublishedAt: string;
  verificationStatus: "verified" | "conflict" | "missing_date" | "unreachable" | "rejected";
  rejectionReason: string;
  relevanceScore: number;
  localEvidence: boolean;
};

function privateAddress(address: string) {
  const normalized = address.replace(/^::ffff:/, "");
  if (net.isIPv4(normalized)) {
    const [a, b] = normalized.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const value = normalized.toLowerCase();
  return value === "::1" || value === "::" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb");
}

export async function resolvePublicAddress(hostname: string) {
  const results = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!results.length || results.some((item) => privateAddress(item.address))) throw new Error("目标域名解析到私有或保留地址");
  return results[0];
}

function decodeHtml(buffer: Buffer, contentType: string) {
  const charset = /charset\s*=\s*([^;\s]+)/i.exec(contentType)?.[1]?.replace(/["']/g, "").toLowerCase();
  if (charset && !["utf-8", "utf8", "us-ascii"].includes(charset)) throw new Error(`不支持的页面字符集：${charset}`);
  return buffer.toString("utf8");
}

async function requestPage(rawUrl: string, redirects = 0): Promise<{ url: string; html: string }> {
  if (redirects > MAX_REDIRECTS) throw new Error("页面重定向次数超过限制");
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("证据页面必须使用 HTTPS");
  if (url.username || url.password || url.port) throw new Error("证据 URL 不允许凭据或自定义端口");
  const address = await resolvePublicAddress(url.hostname);
  return new Promise((resolve, reject) => {
    const request = https.request({
      protocol: "https:", hostname: url.hostname, servername: url.hostname, path: `${url.pathname}${url.search}`, method: "GET",
      headers: { "User-Agent": "ReHoYoEvidenceVerifier/1.0", Accept: "text/html,application/xhtml+xml,text/plain;q=0.8" },
      lookup: (_hostname, options, callback) => {
        if (typeof options === "object" && options.all) {
          callback(null, [{ address: address.address, family: address.family }]);
        } else {
          callback(null, address.address, address.family);
        }
      },
      timeout: TIMEOUT_MS,
    }, (response) => {
      const status = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
        response.resume();
        const target = new URL(response.headers.location, url).toString();
        requestPage(target, redirects + 1).then(resolve, reject);
        return;
      }
      if (status < 200 || status >= 300) { response.resume(); reject(new Error(`页面响应状态 ${status}`)); return; }
      const contentType = String(response.headers["content-type"] || "");
      if (!/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)) { response.resume(); reject(new Error("页面不是可验证的文本内容")); return; }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BYTES) { request.destroy(new Error("页面超过 1 MB 验证限制")); return; }
        chunks.push(chunk);
      });
      response.on("end", () => {
        try { resolve({ url: url.toString(), html: decodeHtml(Buffer.concat(chunks), contentType) }); } catch (error) { reject(error); }
      });
    });
    request.on("timeout", () => request.destroy(new Error("页面验证超时")));
    request.on("error", reject);
    request.end();
  });
}

function attribute(html: string, names: string[]) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
    ];
    for (const pattern of patterns) { const match = pattern.exec(html); if (match?.[1]) return match[1].trim(); }
  }
  return "";
}

function plainText(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim().slice(0, 50_000);
}

export function detectPageLanguage(value: string) {
  const sample = value.slice(0, 20_000);
  if (/[가-힯]/.test(sample)) return "한국어";
  if (/[぀-ヿ]/.test(sample)) return "日本語";
  if (/[฀-๿]/.test(sample)) return "ไทย";
  if (/[Ă-ưẠ-ỹ]/.test(sample)) return "Tiếng Việt";
  const visible = sample.replace(/\s/g, "");
  if (visible && (visible.match(/[A-Za-z]/g)?.length || 0) / visible.length > 0.55) return "English";
  if (/[㐀-鿿]/.test(sample)) return "中文";
  return "未知";
}

function isoDate(value: string) {
  if (!value) return "";
  const match = value.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

export function extractPublishedDateSignals(html: string, pageUrl: string, text: string) {
  const metadataDates = Array.from(new Set([
    attribute(html, ["article:published_time", "datePublished", "date", "pubdate"]),
    /"datePublished"\s*:\s*"([^"]+)"/i.exec(html)?.[1] || "",
    /<time[^>]+datetime=["']([^"']+)["'][^>]*>/i.exec(html)?.[1] || "",
  ].map(isoDate).filter(Boolean)));
  if (metadataDates.length) {
    const times = metadataDates.map((date) => new Date(date).getTime());
    return { date: metadataDates[0], conflict: Math.max(...times) - Math.min(...times) > 45 * 86_400_000, signals: metadataDates.length };
  }
  const visibleDates = Array.from(text.slice(0, 6000).matchAll(/20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}/g)).map((match) => isoDate(match[0])).filter(Boolean);
  const urlDate = isoDate(/20\d{2}[/-]\d{1,2}[/-]\d{1,2}/.exec(pageUrl)?.[0] || "");
  const archiveMatch = /\/web\/(20\d{2})(\d{2})(\d{2})/.exec(pageUrl);
  const archiveDate = archiveMatch ? isoDate(`${archiveMatch[1]}-${archiveMatch[2]}-${archiveMatch[3]}`) : "";
  const counts = new Map<string, number>();
  for (const signal of [...visibleDates, urlDate, archiveDate].filter(Boolean)) counts.set(signal, (counts.get(signal) || 0) + 1);
  const agreed = Array.from(counts.entries()).find(([, count]) => count >= 2)?.[0] || "";
  return { date: agreed, conflict: false, signals: agreed ? counts.get(agreed) || 0 : 0 };
}

function publisherMarket(url: URL, text: string, profile: RegionResearchProfile) {
  if (profile.publisherSuffixes.some((suffix) => url.hostname.endsWith(suffix))) return profile.code;
  if (profile.marketTokens.some((token) => text.toLowerCase().includes(token.toLowerCase()))) return profile.code;
  return "global";
}

function relevance(text: string, profile: RegionResearchProfile, dimension: ResearchDimension) {
  const normalized = text.toLowerCase();
  const market = profile.marketTokens.some((token) => normalized.includes(token.toLowerCase())) ? 0.45 : 0;
  const dimensionTerms: Record<ResearchDimension, string[]> = {
    player: ["player", "玩家", "ユーザー", "プレイヤー", "이용자", "유저", "retention", "回流"],
    market: ["market", "市场", "市場", "시장", "platform", "平台", "channel", "渠道"],
    sentiment: ["sentiment", "舆情", "輿情", "評判", "여론", "competitor", "竞品", "競合", "경쟁"],
    culture: ["culture", "文化", "holiday", "节日", "祝日", "명절", "event", "活动", "イベント"],
  };
  const hits = dimensionTerms[dimension].filter((term) => normalized.includes(term.toLowerCase())).length;
  return Math.min(1, market + Math.min(0.55, hits * 0.18));
}

// Keep legacy scorers referenced while historical snapshots remain readable; all new verification uses the strict variants below.
void publisherMarket;
void relevance;

function containsStrictToken(text: string, token: string) {
  const normalizedText = text.toLowerCase();
  const normalizedToken = token.toLowerCase().trim();
  if (!normalizedToken) return false;
  if (/^[a-z0-9. -]+$/i.test(normalizedToken)) {
    const escaped = normalizedToken.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(normalizedText);
  }
  return normalizedText.includes(normalizedToken);
}

export function inferPublisherMarketStrict(url: URL, text: string, profile: RegionResearchProfile) {
  if (profile.publisherSuffixes.some((suffix) => url.hostname.endsWith(suffix))) return profile.code;
  return profile.marketTokens.some((token) => containsStrictToken(text, token)) ? profile.code : "global";
}

export function inferContentMarket(text: string, profile: RegionResearchProfile) {
  return profile.marketTokens.some((token) => containsStrictToken(text.slice(0, 6000), token)) ? profile.code : "global";
}

export function scoreEvidenceRelevanceStrict(text: string, profile: RegionResearchProfile, dimension: ResearchDimension) {
  const gameTerms = [
    "honkai: star rail", "honkai star rail", "崩坏：星穹铁道", "崩壞：星穹鐵道", "崩壊：スターレイル", "붕괴: 스타레일",
    "video game", "mobile game", "games market", "game market", "game industry", "gaming",
    "game player", "game community", "game publisher", "game developer", "console game", "pc game",
    "gacha", "rpg", "\u6e38\u620f", "\u624b\u6e38", "\u7535\u73a9", "\u904a\u6232", "\u624b\u904a",
    "\u30b2\u30fc\u30e0", "\u30e2\u30d0\u30a4\u30eb\u30b2\u30fc\u30e0", "\uac8c\uc784", "\ubaa8\ubc14\uc77c \uac8c\uc784",
  ];
  const dimensionTerms: Record<ResearchDimension, string[]> = {
    player: ["player behavior", "player survey", "player motivation", "player preference", "user behavior", "retention", "\u73a9\u5bb6", "\u30e6\u30fc\u30b6\u30fc", "\ud50c\ub808\uc774\uc5b4"],
    market: ["market", "revenue", "downloads", "spending", "platform", "channel", "\u5e02\u573a", "\u5e02\u5834", "\uc2dc\uc7a5"],
    sentiment: ["sentiment", "review", "complaint", "competitor", "competition", "community", "\u8206\u60c5", "\u8a55\u5224", "\uc5ec\ub860"],
    culture: ["cultural", "culture", "festival", "convention", "holiday", "gamescom", "tokyo game show", "\u6587\u5316", "\u8282\u65e5", "\u795d\u65e5", "\ubb38\ud654"],
  };
  const normalized = text.toLowerCase();
  const gameAnchorCount = gameTerms.filter((term) => containsStrictToken(normalized, term)).length;
  const hasGameAnchor = gameAnchorCount > 0;
  if (!hasGameAnchor) return 0;
  const unrelatedTerms = ["atlassian", "confluence api", "github pull request", "pfizer", "pharmaceutical", "football match", "soccer report", "hockey schedule"];
  if (gameAnchorCount < 2 && unrelatedTerms.some((term) => containsStrictToken(normalized, term))) return 0;
  const employmentReviewTerms = ["employee review", "company review", "salary", "job opening", "recruitment", "career opportunity", "\u4f1a\u793e\u306e\u8a55\u5224", "\u8ee2\u8077", "\u6c42\u4eba", "\u5e74\u53ce", "\u793e\u54e1", "\u62db\u8058", "\u5458\u5de5"];
  if ((dimension === "player" || dimension === "sentiment") && employmentReviewTerms.some((term) => containsStrictToken(normalized, term))) return 0;
  const hasMarketAnchor = profile.marketTokens.some((token) => containsStrictToken(normalized, token));
  const hasDimensionAnchor = dimensionTerms[dimension].some((term) => containsStrictToken(normalized, term));
  if (!hasDimensionAnchor) return hasMarketAnchor ? 0.4 : 0.2;
  const analysisTerms = ["report", "survey", "research", "analysis", "statistics", "data", "revenue", "%", "\u62a5\u544a", "\u8c03\u7814", "\u7d71\u8a08"];
  const hasAnalyticalSignal = analysisTerms.some((term) => containsStrictToken(normalized, term));
  return Math.min(1, 0.35 + (hasMarketAnchor ? 0.3 : 0) + 0.25 + (hasAnalyticalSignal ? 0.1 : 0));
}

async function verifyEvidencePageUnbounded(args: { url: string; claimedPublishedAt: string; profile: RegionResearchProfile; dimension: ResearchDimension }) : Promise<VerifiedPage> {
  try {
    const page = await requestPage(args.url);
    const canonicalHint = attribute(page.html, ["og:url"]);
    const canonicalUrl = canonicalizeUrl(canonicalHint ? new URL(canonicalHint, page.url).toString() : page.url);
    const title = attribute(page.html, ["og:title", "twitter:title"]) || /<title[^>]*>([\s\S]*?)<\/title>/i.exec(page.html)?.[1]?.trim() || canonicalUrl;
    const publisher = attribute(page.html, ["og:site_name", "application-name", "author"]);
    const text = plainText(page.html);
    const claimed = isoDate(args.claimedPublishedAt);
    const dateSignals = extractPublishedDateSignals(page.html, page.url, text);
    const verified = dateSignals.date;
    const detectedLanguage = detectPageLanguage(`${title} ${text}`);
    const market = inferPublisherMarketStrict(new URL(canonicalUrl), `${title} ${text.slice(0, 2500)}`, args.profile);
    const contentMarket = inferContentMarket(`${title} ${text.slice(0, 6000)}`, args.profile);
    const score = scoreEvidenceRelevanceStrict(`${title} ${text.slice(0, 12000)}`, args.profile, args.dimension);
    const claimScope: VerifiedPage["claimScope"] = score < 0.45 ? "irrelevant" : contentMarket === args.profile.code ? "regional" : "global_context";
    const localEvidence = args.profile.allowedLanguages.includes(detectedLanguage) && market === args.profile.code && contentMarket === args.profile.code && claimScope === "regional";
    let verificationStatus: VerifiedPage["verificationStatus"] = "verified";
    let rejectionReason = "";
    if (!verified) { verificationStatus = "missing_date"; rejectionReason = "页面没有可验证的发布日期"; }
    if (claimed && verified && Math.abs(new Date(claimed).getTime() - new Date(verified).getTime()) > 45 * 86_400_000) { verificationStatus = "conflict"; rejectionReason = `搜索日期 ${claimed} 与页面日期 ${verified} 冲突`; }
    const futureDates = Array.from(text.matchAll(/20\d{2}[-年/.]\d{1,2}[-月/.]\d{1,2}/g)).map((match) => isoDate(match[0])).filter(Boolean);
    if (verified && /(上线|发布|launch|release)/i.test(`${title} ${text.slice(0, 4000)}`) && futureDates.some((date) => new Date(date).getTime() - new Date(verified).getTime() > 180 * 86_400_000)) { verificationStatus = "conflict"; rejectionReason = "页面发布日期与正文所述发布事件存在明显时间冲突"; }
    if (score < 0.45) { verificationStatus = "rejected"; rejectionReason = `区域/维度相关性不足（${score.toFixed(2)}）`; }
    if (dateSignals.conflict) { verificationStatus = "conflict"; rejectionReason = "Page publication metadata contains conflicting dates."; }
    return { canonicalUrl, finalUrl: page.url, title, publisher, text, contentHash: stableHash(text), detectedLanguage, publisherMarket: market, contentMarket, claimScope, claimedPublishedAt: claimed, verifiedPublishedAt: verified, verificationStatus, rejectionReason, relevanceScore: score, localEvidence };
  } catch (error) {
    return { canonicalUrl: args.url, finalUrl: args.url, title: args.url, publisher: "", text: "", contentHash: "", detectedLanguage: "", publisherMarket: "global", contentMarket: "global", claimScope: "irrelevant", claimedPublishedAt: isoDate(args.claimedPublishedAt), verifiedPublishedAt: "", verificationStatus: "unreachable", rejectionReason: error instanceof Error ? error.message : "页面无法验证", relevanceScore: 0, localEvidence: false };
  }
}

export async function verifyEvidencePage(args: { url: string; claimedPublishedAt: string; profile: RegionResearchProfile; dimension: ResearchDimension }): Promise<VerifiedPage> {
  if (activePageVerifications >= MAX_CONCURRENT_PAGE_VERIFICATIONS) await new Promise<void>((resolve) => pageVerificationWaiters.push(resolve));
  activePageVerifications += 1;
  try { return await verifyEvidencePageUnbounded(args); } finally {
    activePageVerifications -= 1;
    pageVerificationWaiters.shift()?.();
  }
}
