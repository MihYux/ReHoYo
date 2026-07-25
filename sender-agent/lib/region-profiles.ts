import type { ResearchCitation } from "@/lib/contracts";

export type ResearchDimension = Exclude<ResearchCitation["dimension"], "manual">;

export type RegionResearchProfile = {
  code: string;
  gameName: string;
  allowedLanguages: string[];
  marketTokens: string[];
  publisherSuffixes: string[];
  queries: Record<ResearchDimension, string[]>;
};

const englishQueries = {
  player: ["player review motivation retention", "player community feedback", "turn-based RPG player experience"],
  market: ["regional revenue ranking downloads platform", "regional launch performance", "PlayStation mobile PC channel"],
  sentiment: ["player sentiment review complaints praise", "community reception competition", "local media review"],
  culture: ["local collaboration fan event convention", "community event cultural activation", "regional character fandom"],
};

export const REGION_RESEARCH_PROFILES: Record<string, RegionResearchProfile> = {
  cn: { code: "cn", gameName: "崩坏：星穹铁道", allowedLanguages: ["中文"], marketTokens: ["中国", "大陆", "China", "Chinese"], publisherSuffixes: [".cn"], queries: {
    player: ["玩家 体验 评价 留存", "玩家社区 反馈 回流", "回合制RPG 玩家偏好"],
    market: ["中国区 收入 排名 下载 渠道", "国服 上线 表现", "手游 PC 平台"],
    sentiment: ["玩家 舆情 评价 争议", "社区 口碑 竞品", "媒体 评测"],
    culture: ["中国 线下活动 联动 玩家", "漫展 社区 活动", "角色 二创 文化"],
  } },
  jp: { code: "jp", gameName: "崩壊：スターレイル", allowedLanguages: ["日本語"], marketTokens: ["日本", "国内", "Japan", "Japanese"], publisherSuffixes: [".jp"], queries: {
    player: ["プレイヤー レビュー 評価", "ユーザー コミュニティ 反応", "ターン制RPG プレイ体験"],
    market: ["日本 売上 ランキング ダウンロード", "国内 配信 実績", "PS5 スマホ PC"],
    sentiment: ["ユーザー 評判 不満 好評", "コミュニティ 反応 競合", "メディア レビュー"],
    culture: ["日本 コラボ イベント ファン", "東京ゲームショウ 展示", "キャラクター 文化"],
  } },
  kr: { code: "kr", gameName: "붕괴: 스타레일", allowedLanguages: ["한국어"], marketTokens: ["한국", "대한민국", "Korea", "Korean"], publisherSuffixes: [".kr"], queries: {
    player: ["플레이어 리뷰 평가", "유저 커뮤니티 반응", "턴제 RPG 플레이 경험"],
    market: ["한국 매출 순위 다운로드", "국내 출시 성과", "모바일 PC 플랫폼"],
    sentiment: ["유저 여론 장점 단점", "커뮤니티 반응 경쟁", "게임 리뷰"],
    culture: ["한국 콜라보 이벤트 팬", "서브컬처 행사", "캐릭터 문화"],
  } },
  na: { code: "na", gameName: "Honkai: Star Rail", allowedLanguages: ["English"], marketTokens: ["North America", "United States", "U.S.", "USA", "Canada", "American", "Canadian"], publisherSuffixes: [".us", ".ca"], queries: englishQueries },
  eu: { code: "eu", gameName: "Honkai: Star Rail", allowedLanguages: ["English", "Deutsch", "Français", "Español", "Italiano"], marketTokens: ["Europe", "European", "EU", "Germany", "France", "UK", "United Kingdom", "España", "Italia"], publisherSuffixes: [".eu", ".de", ".fr", ".uk", ".es", ".it"], queries: englishQueries },
  sea: { code: "sea", gameName: "Honkai: Star Rail", allowedLanguages: ["English", "Bahasa Indonesia", "ไทย", "Tiếng Việt", "Bahasa Melayu"], marketTokens: ["Southeast Asia", "SEA", "Indonesia", "Thailand", "Vietnam", "Malaysia", "Philippines", "Singapore"], publisherSuffixes: [".sg", ".id", ".th", ".vn", ".my", ".ph"], queries: englishQueries },
  hmt: { code: "hmt", gameName: "崩壞：星穹鐵道", allowedLanguages: ["中文"], marketTokens: ["台灣", "台湾", "香港", "澳門", "澳门", "Hong Kong", "Taiwan", "Macau"], publisherSuffixes: [".tw", ".hk", ".mo"], queries: {
    player: ["玩家 心得 評價", "社群 反應 回流", "回合制RPG 玩家體驗"],
    market: ["台港澳 收入 排名 下載", "台灣 香港 上線 表現", "手機 PC PS5 平台"],
    sentiment: ["玩家 輿情 評價 爭議", "社群 口碑 競品", "媒體 評測"],
    culture: ["台灣 香港 聯動 活動", "動漫節 社群 活動", "角色 二創 文化"],
  } },
};

export function regionResearchProfile(code: string) {
  return REGION_RESEARCH_PROFILES[code] || { ...REGION_RESEARCH_PROFILES.na, code };
}

export function researchInputFingerprintValue(profile: RegionResearchProfile, cutoff: string, manualSnapshotIds: string[]) {
  return JSON.stringify({ pipelineVersion: "hsr2-penacony-deep-cache-v4", code: profile.code, cutoff, gameName: profile.gameName, queries: profile.queries, manualSnapshotIds: [...manualSnapshotIds].sort() });
}
