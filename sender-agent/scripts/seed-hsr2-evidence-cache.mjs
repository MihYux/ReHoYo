import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const envText = await fs.readFile(path.join(root, ".env"), "utf8").catch(() => "");
for (const line of envText.split(/\r?\n/)) {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
}

const apiKey = process.env.ZHIPU_API_KEY;
if (!apiKey) throw new Error("ZHIPU_API_KEY is required.");
const baseUrl = process.env.GLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";
const regions = {
  cn: ["崩坏星穹铁道2.0", "中国", "米游社 B站 微博 TapTap"],
  jp: ["崩壊スターレイル2.0", "日本", "5ch GameWith 4Gamer Famitsu"],
  kr: ["붕괴스타레일2.0", "한국", "Naver Inven GameMeca"],
  na: ["Honkai Star Rail 2.0", "US Canada", "Reddit YouTube PlayStation"],
  eu: ["Honkai Star Rail 2.0", "Europe UK France Germany", "Reddit Jeuxvideo Eurogamer"],
  sea: ["Honkai Star Rail 2.0", "SEA Philippines Singapore", "HoYoLAB Reddit"],
  hmt: ["崩壞星穹鐵道2.0", "台灣 香港 澳門", "巴哈姆特 PTT LIHKG"],
};
const topics = [
  ["player", "Penacony player expectations"],
  ["player", "returning player concerns"],
  ["player", "Black Swan Sparkle reaction"],
  ["player", "Misha character discussion"],
  ["market", "PS5 PC mobile performance"],
  ["market", "download package storage"],
  ["market", "regional launch awareness"],
  ["sentiment", "WHITE NIGHT trailer reaction"],
  ["sentiment", "rewards power translation controversy"],
  ["sentiment", "gacha fatigue community"],
  ["culture", "Penacony dream jazz film"],
  ["culture", "Sparkle culture voice actor fandom"],
  ["culture", "Penacony fan art cosplay"],
  ["culture", "Black Swan character culture"],
  ["player", "dream exploration wall gravity puzzle"],
  ["player", "return path system optimization relic"],
  ["sentiment", "TGA Penacony reveal trailer"],
  ["market", "update size device requirements storage"],
  ["market", "2.0 special program release date banners"],
  ["market", "Penacony update preload package size"],
  ["player", "Black Swan drip marketing December 2023"],
  ["player", "Sparkle drip marketing December 2023"],
  ["player", "Misha drip marketing December 2023"],
  ["player", "Penacony unlock requirements returning players"],
  ["sentiment", "Penacony Developer Radio reaction"],
  ["sentiment", "TGA Acheron Black Swan Penacony reveal reaction"],
  ["sentiment", "WHITE NIGHT music video comments reaction"],
  ["culture", "Penacony jazz dream city aesthetic discussion"],
  ["culture", "Black Swan Sparkle voice actor interview"],
  ["culture", "Penacony 2.0 livestream community discussion"],
  ["culture", "Penacony trailer fan art memes cosplay"],
  ["player", "dreamwalker gravity wall puzzle gameplay"],
  ["sentiment", "Sparkle design localization cultural debate"],
  ["market", "2.0 app store PlayStation PC update"],
];

const supplementalTopics = {
  kr: [
    ["player", "붕괴 스타레일 2.0 페나코니 유저 반응"],
    ["player", "붕괴 스타레일 블랙 스완 스파클 평가"],
    ["market", "붕괴 스타레일 2.0 한국 매출 순위"],
    ["market", "붕괴 스타레일 페나코니 모바일 PC"],
    ["sentiment", "붕괴 스타레일 2.0 논란 번역 보상"],
    ["sentiment", "붕괴 스타레일 페나코니 커뮤니티 반응"],
    ["culture", "붕괴 스타레일 페나코니 한국 팬아트"],
    ["culture", "붕괴 스타레일 블랙 스완 성우"],
    ["player", "site:inven.co.kr 붕괴 스타레일 페나코니"],
    ["sentiment", "site:gamemeca.com 붕괴 스타레일 2.0"],
    ["culture", "site:hoyolab.com 붕괴 스타레일 2.0 한국"],
    ["player", "site:reddit.com 붕괴 스타레일 페나코니 한국"],
  ],
  na: [
    ["player", "site:reddit.com/r/HonkaiStarRail Penacony 2.0"],
    ["player", "Honkai Star Rail 2.0 returning player US"],
    ["market", "Honkai Star Rail 2.0 PS5 North America"],
    ["market", "Honkai Star Rail Penacony mobile storage US"],
    ["sentiment", "Honkai Star Rail 2.0 trailer reaction US"],
    ["sentiment", "Honkai Star Rail Sparkle controversy English"],
    ["culture", "Honkai Star Rail Penacony fan art cosplay US"],
    ["culture", "Honkai Star Rail WHITE NIGHT reaction English"],
    ["player", "site:hoyolab.com/article Penacony 2.0 review"],
    ["sentiment", "site:gamespot.com Honkai Star Rail Penacony"],
    ["sentiment", "site:ign.com Honkai Star Rail 2.0"],
    ["market", "site:playstation.com Honkai Star Rail Penacony"],
  ],
};
const directQueries = {
  cn: [
    "site:bbs.mihoyo.com/sr/article 星穹铁道2.0 匹诺康尼", "site:miyoushe.com/sr/article 星穹铁道2.0", "site:bilibili.com/video 星穹铁道2.0 匹诺康尼", "site:weibo.com 星穹铁道2.0 黑天鹅 花火", "site:taptap.cn/moment 星穹铁道2.0", "site:nga.cn 星穹铁道2.0 匹诺康尼", "site:zhihu.com 星穹铁道2.0 匹诺康尼", "site:youku.com 星穹铁道2.0 WHITE NIGHT", "site:163.com 星穹铁道2.0 匹诺康尼", "site:qq.com 星穹铁道2.0 黑天鹅", "星穹铁道2.0 前瞻 玩家 讨论", "匹诺康尼 梦境探索 玩家 评价",
  ],
  jp: [
    "site:4gamer.net 崩壊スターレイル 2.0 ピノコニー", "site:famitsu.com 崩壊スターレイル 2.0", "site:gamewith.jp 崩壊スターレイル 2.0", "site:game8.jp 崩壊スターレイル ピノコニー", "site:youtube.com/watch 崩壊スターレイル 2.0", "site:hoyolab.com/article ピノコニー 2.0", "site:dengekionline.com スターレイル 2.0", "site:game.watch.impress.co.jp スターレイル ピノコニー", "site:gamespark.jp スターレイル 2.0", "site:automaton-media.com スターレイル 2.0", "ブラックスワン 花火 ピノコニー 反応", "WHITE NIGHT スターレイル 反応",
  ],
  kr: [
    "site:inven.co.kr 붕괴 스타레일 2.0 페나코니", "site:gamemeca.com 붕괴 스타레일 2.0", "site:gameinsight.co.kr 스타레일 페나코니", "site:gametoc.co.kr 스타레일 2.0", "site:youtube.com/watch 붕괴 스타레일 2.0", "site:hoyolab.com/article 붕괴 스타레일 페나코니", "site:dcinside.com 스타레일 페나코니", "site:naver.com 붕괴 스타레일 2.0", "site:playstation.com/ko-kr 스타레일 2.0", "붕괴 스타레일 블랙 스완 스파클 반응", "붕괴 스타레일 WHITE NIGHT 반응", "페나코니 꿈세계 플레이 후기",
  ],
  na: [
    "site:reddit.com/r/HonkaiStarRail Penacony 2.0", "site:hoyolab.com/article Penacony version 2.0", "site:youtube.com/watch Honkai Star Rail 2.0 Penacony", "site:playstation.com Honkai Star Rail 2.0", "site:gamespot.com Honkai Star Rail Penacony", "site:ign.com Honkai Star Rail 2.0", "site:pcgamer.com Honkai Star Rail Penacony", "site:gamesradar.com Honkai Star Rail 2.0", "site:polygon.com Honkai Star Rail Penacony", "site:screenrant.com Honkai Star Rail 2.0", "Honkai Star Rail WHITE NIGHT reaction", "Black Swan Sparkle Misha community reaction",
  ],
  eu: [
    "site:jeuxvideo.com Honkai Star Rail 2.0 Penacony", "site:eurogamer.net Honkai Star Rail Penacony", "site:pushsquare.com Honkai Star Rail 2.0", "site:gamepro.de Honkai Star Rail Penacony", "site:gamestar.de Honkai Star Rail 2.0", "site:youtube.com/watch Honkai Star Rail 2.0 Europe", "site:hoyolab.com/article Penacony 2.0 Europe", "site:reddit.com Honkai Star Rail Penacony Europe", "site:playstation.com/en-gb Honkai Star Rail 2.0", "site:millenium.org Honkai Star Rail Penacony", "Honkai Star Rail 2.0 French review", "Honkai Star Rail 2.0 German review",
  ],
  sea: [
    "site:hoyolab.com/article Penacony 2.0 Philippines", "site:reddit.com Honkai Star Rail Penacony Singapore", "site:oneesports.gg Honkai Star Rail 2.0", "site:ungeek.ph Honkai Star Rail Penacony", "site:gamerbraves.com Honkai Star Rail 2.0", "site:youtube.com/watch Honkai Star Rail 2.0 SEA", "site:game8.co Honkai Star Rail Penacony", "Honkai Star Rail 2.0 Indonesia review", "Honkai Star Rail 2.0 Malaysia review", "Honkai Star Rail Penacony Philippines reaction", "Honkai Star Rail WHITE NIGHT Singapore", "Black Swan Sparkle SEA community",
  ],
  hmt: [
    "site:gamer.com.tw 崩壞星穹鐵道 2.0 匹諾康尼", "site:forum.gamer.com.tw 星穹鐵道 2.0", "site:gamebase.com.tw 星穹鐵道 匹諾康尼", "site:youtube.com/watch 星穹鐵道 2.0 台灣", "site:hoyolab.com/article 星穹鐵道2.0 繁中", "site:ptt.cc 星穹鐵道 匹諾康尼", "site:lihkg.com 星穹鐵道 2.0", "site:hk01.com 星穹鐵道 匹諾康尼", "site:taptap.io/tw 星穹鐵道 2.0", "崩壞星穹鐵道 黑天鵝 花火 台灣", "匹諾康尼 WHITE NIGHT 香港 反應", "星穹鐵道2.0 玩家 心得 繁中",
  ],
};

const accepted = new Map();
const discoveredAt = new Date().toISOString();
const outputPath = path.join(root, "lib", "generated-hsr2-evidence-cache.json");
const existingSeeds = JSON.parse(await fs.readFile(outputPath, "utf8").catch(() => "[]"));
for (const seed of existingSeeds) accepted.set(`${seed.regionCode}:${seed.url.replace(/[?#].*$/, "").replace(/\/$/, "")}`, seed);
const requestedRegionArg = process.argv.find((value) => value.startsWith("--regions="));
const requestedRegions = requestedRegionArg ? new Set(requestedRegionArg.slice(10).split(",")) : null;
const directOnly = process.argv.includes("--direct-only");
async function search(query) {
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/web_search`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ search_query: query, search_engine: "search_std", search_intent: false, count: 8, search_recency_filter: "noLimit", content_size: "high" }),
      });
      if (response.ok) return (await response.json()).search_result || [];
      lastError = `HTTP ${response.status}: ${(await response.text()).slice(0, 160)}`;
    } catch (error) { lastError = String(error?.message || error); }
    await new Promise((resolve) => setTimeout(resolve, 400 * (2 ** attempt)));
  }
  process.stderr.write(`Skipped failed query: ${query} (${lastError})\n`);
  return [];
}
for (const [regionCode, [game, market, communities]] of Object.entries(regions).filter(([code]) => !requestedRegions || requestedRegions.has(code))) {
  const queryTopics = directOnly ? [] : [...topics, ...(supplementalTopics[regionCode] || [])];
  for (const [dimension, topic] of queryTopics) {
    const query = `${game} ${market} ${topic} ${communities}`.slice(0, 70);
    for (const hit of await search(query)) {
      const url = String(hit.link || "");
      const haystack = `${hit.title || ""} ${hit.content || ""}`.toLowerCase();
      if (!url.startsWith("https://") || !/(honkai|star rail|星穹|スターレイル|스타레일)/i.test(haystack)) continue;
      const key = `${regionCode}:${url.replace(/[?#].*$/, "").replace(/\/$/, "")}`;
      const existing = accepted.get(key);
      if (existing) {
        if (!existing.dimensions.includes(dimension)) existing.dimensions.push(dimension);
        continue;
      }
      accepted.set(key, { regionCode, title: String(hit.title || url), url, publishedAt: String(hit.publish_date || "").slice(0, 10), dimensions: [dimension], query, discoveredAt });
    }
  }
  for (const [index, query] of (directQueries[regionCode] || []).entries()) {
    const dimension = ["player", "market", "sentiment", "culture"][index % 4];
    for (const hit of await search(query.slice(0, 70))) {
      const url = String(hit.link || "");
      const haystack = `${hit.title || ""} ${hit.content || ""}`.toLowerCase();
      if (!url.startsWith("https://") || !/(honkai|star rail|星穹|スターレイル|스타레일)/i.test(haystack)) continue;
      const key = `${regionCode}:${url.replace(/[?#].*$/, "").replace(/\/$/, "")}`;
      const existing = accepted.get(key);
      if (existing) { if (!existing.dimensions.includes(dimension)) existing.dimensions.push(dimension); continue; }
      accepted.set(key, { regionCode, title: String(hit.title || url), url, publishedAt: String(hit.publish_date || "").slice(0, 10), dimensions: [dimension], query, discoveredAt });
    }
  }
  const checkpoint = [...accepted.values()].sort((a, b) => a.regionCode.localeCompare(b.regionCode) || a.url.localeCompare(b.url));
  await fs.writeFile(outputPath, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
}

const output = [...accepted.values()].sort((a, b) => a.regionCode.localeCompare(b.regionCode) || a.url.localeCompare(b.url));
if (output.length < 150) throw new Error(`Deep research returned only ${output.length} unique HSR 2.0 links; refusing to publish an underfilled cache.`);
await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ links: output.length, byRegion: Object.fromEntries(Object.keys(regions).map((code) => [code, output.filter((item) => item.regionCode === code).length])) }, null, 2)}\n`);
