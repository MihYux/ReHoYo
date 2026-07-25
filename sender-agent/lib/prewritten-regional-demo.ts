import { and, eq } from "drizzle-orm";
import type { RegionAnalysis, ResearchClaim } from "@/lib/contracts";
import {
  db,
  ensureDb,
  evidenceSnapshotDimensions,
  evidenceSnapshotRegions,
  evidenceSnapshots,
  evidenceSources,
  jobs,
  projects,
  regions,
  researchRuns,
  sources,
} from "@/lib/db";
import { GAME_EVIDENCE_CACHE, type GameEvidenceSeed } from "@/lib/game-evidence-cache";
import { stableHash } from "@/lib/governance";
import type { ResearchDimension } from "@/lib/region-profiles";
import { embeddedDemoState } from "@/lib/embedded-demo";

const DEMO_COPY: Record<string, {
  player: string;
  market: string;
  sentiment: string;
  culture: string;
  differentiation: [string, string, string, string, string];
}> = {
  cn: {
    player: "大陆玩家更关注回流成本、角色养成衔接与新主线是否值得立即开启。",
    market: "B站、米游社与短视频平台共同承担大版本认知、攻略扩散和社群回流。",
    sentiment: "讨论重点集中在匹诺康尼体量、黑天鹅与花火卡池，以及实机探索的新鲜度。",
    culture: "春节前后的线上娱乐高峰适合用团圆反差与梦境都市氛围组织连续内容。",
    differentiation: [
      "大陆发行应优先唤醒已流失玩家，用主线直达、回归养成清单和低理解成本内容推动重新登录。",
      "渠道组合以米游社沉淀任务、B站承接长视频解释、抖音放大视听片段，形成由种草到开玩的闭环。",
      "春节档期适合借华丽盛会与团聚氛围制造反差，但不把匹诺康尼包装成现实博彩或普通新地图。",
      "同档产品争夺线上娱乐时长，因此首周素材必须证明走墙、重力转换与视错觉谜题确为真实实机。",
      "相较日本更依赖角色声优触达，大陆应把回流效率与社区任务前置，再让黑天鹅和花火承接商业波峰。",
    ],
  },
  jp: {
    player: "日本玩家对角色关系、声优表现、收藏价值和长期养成信息的响应更集中。",
    market: "X、YouTube、游戏媒体与线下零售触点适合形成高频角色信息接力。",
    sentiment: "讨论更容易围绕角色人设、配音演出、卡池规划及剧情悬念形成细分社群。",
    culture: "冬季档期的通勤与夜间观看场景适合连续短篇角色内容和音乐传播。",
    differentiation: [
      "日本发行应以角色关系与声优演绎建立进入匹诺康尼的情感理由，并用收藏型信息降低观望。",
      "X负责高频角色切片，YouTube承接节目与音乐长内容，专业游戏媒体补充机制和回流说明。",
      "通勤与深夜观看习惯适合连续发布短篇悬念，让黄金时刻的爵士歌舞成为稳定记忆点。",
      "角色承诺必须避开未锁定数值与关键剧透，商业化表达要保留足够的世界观探索空间。",
      "相较大陆强调任务闭环，日本应把声优、角色收藏与连续叙事前置，再以玩法说明消除下载顾虑。",
    ],
  },
  kr: {
    player: "韩国玩家更重视角色强度讨论、队伍效率、更新节奏与可快速验证的攻略结论。",
    market: "YouTube、Naver与Inven式社区讨论适合快速放大实机验证和阵容研究。",
    sentiment: "卡池价值、战斗效率和版本福利的比较讨论升温快，也更容易出现强度争议。",
    culture: "高密度网咖和移动场景要求素材在短时间内明确版本变化与开玩收益。",
    differentiation: [
      "韩国发行应先回答回归后如何快速组队与进入新主线，用可验证的养成路径降低重新上手压力。",
      "YouTube负责实机与队伍演示，Naver和核心社区承接攻略讨论，短内容只承担版本变化提示。",
      "网咖与移动端并行的高频游戏场景要求素材直接呈现操作收益，而不是只依赖电影化镜头。",
      "强度舆情扩散速度快，必须区分机制介绍和确定性强度承诺，并准备卡池争议回应口径。",
      "相较日本侧重声优收藏，韩国应把实机效率和阵容验证提前，再用匹诺康尼悬念维持讨论周期。",
    ],
  },
  na: {
    player: "北美玩家更容易被新世界探索、长线剧情讨论、创作者反应和可分享玩法吸引。",
    market: "YouTube、Reddit、TikTok与HoYoLAB形成预告反应、讨论和UGC挑战的组合。",
    sentiment: "对新星球规模、叙事节奏、角色多样性和实际玩法深度的讨论并行出现。",
    culture: "音乐、动画与网络迷因可跨圈层扩散，但需要明确素材来源和广告合作标识。",
    differentiation: [
      "北美发行应把匹诺康尼作为可共同发现的新世界，鼓励创作者记录首见反应与探索路线。",
      "YouTube承接节目和实机深读，Reddit沉淀讨论，TikTok用音乐与场景转场触发二创参与。",
      "网络迷因和创作者文化适合放大梦境都市的荒诞感，但官方内容仍需守住剧情信息边界。",
      "受众会快速质疑CG与实际玩法落差，因此每轮华丽视听素材都要配套可核验的操作片段。",
      "相较欧洲更关注多语种一致性，北美应扩大创作者反应与UGC规模，并用社区问答控制误读。",
    ],
  },
  eu: {
    player: "欧洲玩家群体语言分散，对本地化质量、设备适配、隐私与长期内容价值更敏感。",
    market: "多语种媒体、YouTube与本地社区需要分层同步，避免只用英语覆盖所有市场。",
    sentiment: "讨论常把叙事质量、技术表现、商业化透明度和本地化文本放在同一评价框架。",
    culture: "跨国发布时间和语言差异要求资产可复用，同时保留重点市场的本地表达。",
    differentiation: [
      "欧洲发行应把多语种本地化与设备信息列为回流入口，让不同市场都能快速判断是否值得重返。",
      "区域媒体负责可信解释，YouTube承接统一母版，本地社区账号补充语言化问答和时间信息。",
      "跨国文化差异要求爵士歌舞只作为共同视觉入口，具体文案应由各语言市场重新落地。",
      "广告披露、未成年人规则和商业化透明度必须前置检查，避免同一合作模板跨国直接复用。",
      "相较北美依赖UGC扩散，欧洲应优先保证多语种信息对齐与法规一致，再选择重点市场放大创作者。",
    ],
  },
  sea: {
    player: "东南亚玩家更关注移动设备负担、流量成本、社群共玩与免费资源的获取节奏。",
    market: "Facebook、TikTok、YouTube与本地社群管理员共同影响版本信息的触达和解释。",
    sentiment: "下载体积、设备性能、福利信息和角色抽取规划更容易决定是否立即更新。",
    culture: "多语言、多宗教与多节庆环境要求素材避免把单一市场习惯代表整个区域。",
    differentiation: [
      "东南亚发行应先解决设备、流量和回归资源焦虑，再用匹诺康尼探索内容推动玩家完成更新。",
      "Facebook社群负责本地答疑，TikTok传播音乐与场景，YouTube提供低配设置和玩法说明。",
      "区域内部语言与节庆差异显著，统一母版只能提供核心画面，本地文案必须分别校准。",
      "福利传播要区分全球内容与区域活动，且不得让单一国家的奖励被误读为全区统一权益。",
      "相较港澳台可依靠繁中社区集中扩散，东南亚应优先分国家管理语言、设备建议与社群节奏。",
    ],
  },
  hmt: {
    player: "港澳台玩家重视繁中翻译、社区口碑、剧情讨论和与大陆版本同步的资讯效率。",
    market: "巴哈姆特、YouTube、Facebook与HoYoLAB繁中内容适合形成集中讨论链路。",
    sentiment: "角色剧情、翻译用语、卡池安排和攻略完整度常共同影响版本口碑。",
    culture: "繁体中文语境相近但并不等同，地区称谓与活动规则需要逐项核对。",
    differentiation: [
      "港澳台发行应以繁中信息同步和剧情讨论质量建立信任，让玩家明确新世界内容并非延迟转述。",
      "巴哈姆特承接长讨论和攻略，YouTube负责实机说明，Facebook与HoYoLAB补充活动触达。",
      "繁中语境能够共享核心资产，但地区用语、发布时间与活动资格必须逐项标注避免混淆。",
      "社区对翻译与剧情细节敏感，所有悬念文案都需防止提前泄露死亡、身份反转和结局信息。",
      "相较东南亚需要多语言拆分，港澳台应集中经营繁中讨论深度，并以同步效率放大口碑。",
    ],
  },
};

function claim(text: string, dimension: ResearchDimension, snapshotIds: string[]): ResearchClaim {
  return {
    text,
    citationIds: snapshotIds,
    citationSnapshotIds: snapshotIds,
    requirementIds: ["HC-REQUIRED-001"],
    claimScope: "regional",
    dimension,
    confidence: "medium",
  };
}

export type BalancedDemoEvidence = { seed: GameEvidenceSeed; focus: ResearchDimension; local: boolean };

export function selectBalancedDemoEvidence(regionCode: string): BalancedDemoEvidence[] {
  const selected: BalancedDemoEvidence[] = [];
  const used = new Set<string>();
  const add = (focus: ResearchDimension, count: number) => {
    const candidates = [
      ...GAME_EVIDENCE_CACHE.filter((seed) => seed.regionCode === regionCode && seed.dimensions.includes(focus)),
      ...GAME_EVIDENCE_CACHE.filter((seed) => seed.regionCode !== regionCode && seed.dimensions.includes(focus)),
    ].sort((left, right) => {
      if (focus !== "player") {
        const leftPlayer = left.dimensions.includes("player") ? 1 : 0;
        const rightPlayer = right.dimensions.includes("player") ? 1 : 0;
        if (leftPlayer !== rightPlayer) return leftPlayer - rightPlayer;
      }
      return Number(right.regionCode === regionCode) - Number(left.regionCode === regionCode) || left.url.localeCompare(right.url);
    });
    for (const seed of candidates) {
      if (used.has(seed.url)) continue;
      used.add(seed.url);
      selected.push({ seed, focus, local: seed.regionCode === regionCode });
      if (selected.filter((item) => item.focus === focus).length === count) break;
    }
  };
  add("player", 24);
  add("market", 3);
  add("sentiment", 3);
  add("culture", 3);
  if (selected.length < 33) throw new Error(`${regionCode} 路演证据不足：仅 ${selected.length}/33。`);
  return selected;
}

export async function materializePrewrittenRegionalDemo(batchId: string) {
  await ensureDb();
  const timestamp = new Date().toISOString();
  const regionRows = await db.select().from(regions);

  await db.transaction(async (tx) => {
    for (const region of regionRows) {
      const copy = DEMO_COPY[region.code] || DEMO_COPY.na;
      const seeds = selectBalancedDemoEvidence(region.code);
      const dimensionSnapshots = new Map<ResearchDimension, string[]>();
      for (const dimension of ["player", "market", "sentiment", "culture"] as ResearchDimension[]) dimensionSnapshots.set(dimension, []);

      for (let index = 0; index < seeds.length; index += 1) {
        const selected = seeds[index];
        const seed = selected.seed;
        const sourceId = stableHash(seed.url);
        const snapshotId = stableHash(`${batchId}:${region.id}:${seed.url}`);
        const dimensions = [selected.focus, ...seed.dimensions.filter((dimension) => dimension !== selected.focus)];
        const defaultDescription = selected.focus === "player"
          ? `玩家社区关于“${seed.title}”的讨论、体验或攻略内容。`
          : `区域公开资料“${seed.title}”，用于补充2.0版本外部环境。`;
        const defaultTakeaway = selected.focus === "player"
          ? "提取玩家对匹诺康尼内容、理解门槛、玩法体验与回流意愿的直接信号。"
          : selected.focus === "market"
            ? "核对版本节奏、产品信息和区域市场关注点。"
            : selected.focus === "sentiment"
              ? "识别玩家口碑、争议焦点和竞争注意力变化。"
              : "识别当地语言表达、文化偏好和内容接受方式。";
        await tx.insert(evidenceSources).values({ id: sourceId, canonicalUrl: seed.url, title: seed.title, createdAt: timestamp, updatedAt: timestamp }).onConflictDoNothing();
        await tx.insert(evidenceSnapshots).values({
          id: snapshotId,
          sourceId,
          runId: batchId,
          projectId: "current",
          regionId: region.id,
          dimension: dimensions[0],
          displayId: `${region.code.toUpperCase()}-S${String(index + 1).padStart(3, "0")}`,
          title: seed.title,
          url: seed.url,
          publisher: new URL(seed.url).hostname,
          publishedAt: seed.publishedAt,
          snippet: `内容简介：${seed.description || defaultDescription}｜关键看点：${seed.takeaway || defaultTakeaway}`,
          query: seed.query,
          language: region.language,
          marketScope: selected.local ? region.code : seed.regionCode,
          qualityTier: seed.url.includes("hoyolab.com") ? "community" : "trade",
          contentHash: stableHash(`${seed.title}:${seed.url}`),
          retrievedAt: seed.verifiedAt || seed.discoveredAt || timestamp,
          origin: "cache",
          verificationStatus: seed.verificationStatus || "verified",
          claimedPublishedAt: seed.publishedAt,
          verifiedPublishedAt: seed.verificationStatus === "discovered" ? "" : seed.publishedAt,
          detectedLanguage: selected.local ? region.language : "multi",
          publisherMarket: seed.regionCode,
          contentMarket: seed.regionCode,
          claimScope: selected.local ? "regional" : "global_context",
          relevanceScore: seed.verificationStatus === "discovered" ? 0.72 : 0.92,
          rejectionReason: "",
        }).onConflictDoNothing();
        await tx.insert(evidenceSnapshotRegions).values({ id: stableHash(`${snapshotId}:${region.id}`), snapshotId, regionId: region.id, displayId: `${region.code.toUpperCase()}-S${String(index + 1).padStart(3, "0")}`, localEvidence: selected.local }).onConflictDoNothing();
        for (const dimension of dimensions) {
          dimensionSnapshots.get(dimension)?.push(snapshotId);
          await tx.insert(evidenceSnapshotDimensions).values({ id: stableHash(`${snapshotId}:${region.id}:${dimension}`), snapshotId, regionId: region.id, dimension, query: seed.query }).onConflictDoNothing();
        }
      }

      const allIds = Array.from(new Set(Array.from(dimensionSnapshots.values()).flat()));
      const idsFor = (dimension: ResearchDimension) => {
        const direct = dimensionSnapshots.get(dimension) || [];
        return (direct.length ? direct : allIds).slice(0, 2);
      };
      const analysis: RegionAnalysis = {
        playerSignals: [claim(copy.player, "player", idsFor("player"))],
        marketEnvironment: [claim(copy.market, "market", idsFor("market"))],
        sentimentAndCompetition: [claim(copy.sentiment, "sentiment", idsFor("sentiment"))],
        culturalMoments: [claim(copy.culture, "culture", idsFor("culture"))],
        differentiators: [copy.differentiation.join("")],
        differentiation: {
          paragraph: copy.differentiation.join(""),
          sentences: copy.differentiation.map((text, index) => ({
            role: (["audience", "channel", "culture", "constraint", "contrast"] as const)[index],
            topicKey: `${region.code}-${["return", "channel", "culture", "risk", "contrast"][index]}`,
            text,
            citationSnapshotIds: index === 4 ? allIds.slice(0, 2) : allIds.slice(index % Math.max(1, allIds.length), index % Math.max(1, allIds.length) + 1),
            requirementIds: ["HC-REQUIRED-001"],
            comparedRegionIds: index === 4 ? regionRows.filter((candidate) => candidate.id !== region.id).slice(0, 1).map((candidate) => candidate.id) : [],
          })),
          excludedCommonThemes: ["全球共同版本卖点", "通用画面表现", "跨区域基础福利"],
          provisional: false,
          missingRegionIds: [],
          quality: { uniquenessScore: 0.94, evidenceCoverage: 1, violations: [] },
        },
        risks: ["不得披露关键剧情死亡、身份反转或结局。", "不得把CG包装为真实操作画面。"],
        researchNote: "",
        generatedAt: timestamp,
      };
      await tx.update(regions).set({ selected: true, status: "quality_passed", analysis: JSON.stringify(analysis), updatedAt: timestamp }).where(eq(regions.id, region.id));
      await tx.update(jobs).set({
        status: "quality_passed",
        phase: "quality_passed",
        progress: 100,
        attempt: 1,
        result: JSON.stringify({ violations: [], diagnostics: [], providerStats: { glm: { requests: 0, cached: 0, results: seeds.length, accepted: seeds.length, failures: 0, latencyMs: 0, credits: 0 } } }),
        error: "",
        updatedAt: timestamp,
      }).where(and(eq(jobs.scopeId, region.id), eq(jobs.externalId, batchId)));
    }
    await tx.update(researchRuns).set({ status: "quality_passed", synthesisStatus: "completed", quality: "[]", updatedAt: timestamp }).where(eq(researchRuns.id, batchId));
    await tx.update(projects).set({ activeResearchRunId: batchId, planStatus: "stale", updatedAt: timestamp }).where(eq(projects.id, "current"));
  });
}

export async function prewrittenDemoEnabled() {
  if (process.env.PREWRITTEN_RESEARCH_DEMO === "false") return false;
  await ensureDb();
  const rows = await db.select({ name: sources.name, extractedText: sources.extractedText }).from(sources).where(eq(sources.projectId, "current"));
  return embeddedDemoState(rows).eligible;
}

export function prewrittenDemoJobResult() {
  return JSON.stringify({ violations: [], diagnostics: [], providerStats: { glm: { requests: 0, cached: 0, results: 33, accepted: 33, failures: 0, latencyMs: 0, credits: 0 } } });
}
