import type { ProjectSnapshot, RegionReleasePlan, ResearchCitation, ReleasePlan, RegionalCharacterSymbiosisPlan } from "@/lib/contracts";

function list(items: string[]) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- 暂无";
}

export function planToMarkdown(project: ProjectSnapshot, plan: ReleasePlan, citations: ResearchCitation[]) {
  const sections = plan.regions.map((region) => {
    const timeline = region.timeline.map((item) => `- **${item.week} · ${item.focus}**：${item.actions.join("；")}`).join("\n");
    const characters = region.characterRelease.map((character) => `### ${character.character} · ${character.relationshipStage}\n\n**目标**：${character.objective}\n\n**玩家分群**：${character.audienceSegment}\n\n**口吻规则**\n${list(character.voiceRules)}\n\n**长期内容弧**\n${list(character.contentArc)}\n\n**渠道与频率**\n${list(character.channels.map((item) => `${item.channel}｜${item.frequency}｜${item.role}`))}\n\n**任务草案**\n${list(character.tasks.map((item) => `${item.time}｜${item.action}｜资产：${item.asset}｜信号：${item.successSignal}`))}\n\n**资产依赖**\n${list(character.assetDependencies)}\n\n**示例话题**\n${list(character.sampleTopics)}\n\n**禁区**\n${list(character.guardrails)}`).join("\n\n");
    return `## ${region.regionName}\n\n${region.coreJudgment}\n\n### 素材策略\n${list(region.materialStrategy)}\n\n### 社媒节奏\n${list(region.socialCadence)}\n\n### KOL 合作\n${list(region.kolPlan)}\n\n### 买量\n${list(region.paidMedia)}\n\n### 联动计划\n${list(region.partnerships)}\n\n### 周级时间表\n${timeline}\n\n### KPI\n${list(region.kpis)}\n\n### 预算\n${list(region.budget)}\n\n### 风险提示\n${list(region.riskNotes)}\n\n## AI 角色关系型发行 · ${region.regionName}\n\n> 本章节仅为人工审核的发行方案与任务草案，不代表已执行任何触达。\n\n${characters || "暂无角色发行方案。"}`;
  }).join("\n\n---\n\n");
  const symbiosis = plan.characterSymbiosisRelease.map((item) => {
    const tasks = item.characterTasks.map((task) => `### ${task.character} · ${task.playerSegment}\n\n- **任务目标**：${task.objective}\n- **版本信息**：${task.versionMessage}\n- **沟通切入点**：${task.communicationAngle}\n- **互动场景**：${task.interactionScene}\n- **时机与频率**：${task.timing}｜${task.frequency}\n- **语气**：${task.tone}\n- **文化注意**：${task.culturalNotes.join("；")}\n- **禁止行为**：${task.prohibitedBehaviors.join("；")}\n- **风险边界**：${task.riskBoundaries.join("；")}\n- **预期效果**：${task.expectedEffect}\n- **评估指标**：${task.metrics.map((metric) => `${metric.name}=${metric.target}（${metric.measurementWindow}）`).join("；")}`).join("\n\n");
    return `## ${item.regionName}\n\n**共生发行目标**：${item.symbiosisObjective}\n\n**目标玩家群体**\n${list(item.targetPlayerGroups)}\n\n**适合由角色传递的版本信息**\n${list(item.characterSuitableVersionMessages)}\n\n**角色沟通切入点与互动场景**\n${list(item.communicationEntryPointsAndScenes)}\n\n**推荐触达时机与频率**\n${list(item.recommendedTimingAndFrequency)}\n\n**语气、表达和文化注意事项**\n${list(item.toneExpressionAndCulturalNotes)}\n\n**禁止行为与风险边界**\n${list(item.prohibitedBehaviorsAndRiskBoundaries)}\n\n**预期效果与评估指标**\n${list(item.expectedEffectsAndMetrics)}\n\n${tasks}`;
  }).join("\n\n---\n\n");
  const sources = citations.map((source) => `- [${source.id}] [${source.title}](${source.url})${source.publisher ? ` · ${source.publisher}` : ""}${source.publishedAt ? ` · ${source.publishedAt}` : ""}`).join("\n");
  return `# ${project.gameName || "未命名游戏"} · ${project.versionName || "新版本"} 全球发行方案\n\n生成时间：${plan.generatedAt}\n上线日期：${project.launchDate || "待定"}\n计划窗口：T${project.campaignStartWeek} 至 T+${project.campaignEndWeek}\n\n## 全球统一主轴\n\n${plan.globalAxis}\n\n### 全球原则\n${list(plan.globalPrinciples)}\n\n### 共同行动节点\n${list(plan.commonMoments)}\n\n### 全球 KPI\n${list(plan.globalKpis)}\n\n---\n\n${sections}\n\n---\n\n# 角色共生发行方案\n\n> 以下各区域模块可独立传给后续“共生发行 Agent”；下游不接收整份发行方案。\n\n${symbiosis || "暂无角色共生发行方案。"}\n\n---\n\n## 来源清单\n\n${sources || "暂无外部来源。"}\n`;
}

function regionalCharacterMarkdown(region: RegionReleasePlan) {
  return region.characterRelease.map((character) => `### ${character.character} · ${character.relationshipStage}\n\n**目标**：${character.objective}\n\n**玩家分群**：${character.audienceSegment}\n\n**口吻规则**\n${list(character.voiceRules)}\n\n**长期内容弧**\n${list(character.contentArc)}\n\n**渠道与频率**\n${list(character.channels.map((item) => `${item.channel}｜${item.frequency}｜${item.role}`))}\n\n**任务草案**\n${list(character.tasks.map((item) => `${item.time}｜${item.action}｜资产：${item.asset}｜信号：${item.successSignal}`))}\n\n**资产依赖**\n${list(character.assetDependencies)}\n\n**示例话题**\n${list(character.sampleTopics)}\n\n**禁区**\n${list(character.guardrails)}`).join("\n\n");
}

function regionalSymbiosisMarkdown(item: RegionalCharacterSymbiosisPlan | undefined) {
  if (!item) return "暂无角色共生发行方案。";
  const tasks = item.characterTasks.map((task) => `### ${task.character} · ${task.playerSegment}\n\n- **任务目标**：${task.objective}\n- **版本信息**：${task.versionMessage}\n- **沟通切入点**：${task.communicationAngle}\n- **互动场景**：${task.interactionScene}\n- **时机与频率**：${task.timing}｜${task.frequency}\n- **语气**：${task.tone}\n- **文化注意**：${task.culturalNotes.join("；")}\n- **禁止行为**：${task.prohibitedBehaviors.join("；")}\n- **风险边界**：${task.riskBoundaries.join("；")}\n- **预期效果**：${task.expectedEffect}\n- **评估指标**：${task.metrics.map((metric) => `${metric.name}=${metric.target}（${metric.measurementWindow}）`).join("；")}`).join("\n\n");
  return `**共生发行目标**：${item.symbiosisObjective}\n\n**目标玩家群体**\n${list(item.targetPlayerGroups)}\n\n**适合由角色传递的版本信息**\n${list(item.characterSuitableVersionMessages)}\n\n**角色沟通切入点与互动场景**\n${list(item.communicationEntryPointsAndScenes)}\n\n**推荐触达时机与频率**\n${list(item.recommendedTimingAndFrequency)}\n\n**语气、表达和文化注意事项**\n${list(item.toneExpressionAndCulturalNotes)}\n\n**禁止行为与风险边界**\n${list(item.prohibitedBehaviorsAndRiskBoundaries)}\n\n**预期效果与评估指标**\n${list(item.expectedEffectsAndMetrics)}\n\n${tasks}`;
}

export function characterSymbiosisToMarkdown(
  project: ProjectSnapshot,
  plan: ReleasePlan,
  item: RegionalCharacterSymbiosisPlan,
) {
  const objective = `通过三月七与${item.regionName}玩家之间已有的长期陪伴关系，自然传递《崩坏：星穹铁道》${project.versionName}版本“匹诺康尼”相关信息，重点提升老玩家回流意愿与版本关注度。`;
  const targets = [
    "近30天未登录的老玩家",
    "曾重点培养三月七或经常与三月七互动的玩家",
    "对剧情、角色关系和版本世界观关注度较高的玩家",
  ];
  const messages = [
    "匹诺康尼全新世界与新主线即将开放",
    "新版本将围绕梦境都市及其隐藏危机展开",
    "走墙、重力转换与视错觉谜题等探索机制即将上线",
    "2.0版本上线时间、预约提醒与回归相关信息",
  ];
  const communicationAngle = "优先从玩家与三月七已经建立的陪伴关系、共同开拓经历和近期状态切入，由三月七以第一人称发出邀请，不使用广告式表达。";
  const scenes = [
    "玩家长时间未登录后，三月七以久未见面的关心自然开场",
    "玩家提到近期工作或学习繁忙时，三月七回应其状态并降低行动压力",
    "玩家查看桌宠或与三月七进行日常互动时，顺势提到新的开拓目的地",
    "2.0版本上线前3天，由三月七进行一次不催促登录的轻量提醒",
  ];
  const memoryRequirements = [
    "player_preferred_story_content",
    "player_character_affinity",
    "player_recent_activity_status",
  ];
  const riskRules = [
    "不得连续催促玩家登录",
    "不得直接使用购买、抽卡或付费等营销词",
    "不得虚构与玩家不存在的共同记忆",
    "玩家明确拒绝后停止本轮发行触达",
  ];
  const regionCode = item.regionId.replace(/^region-/i, "").toUpperCase();
  const executionPayload = {
    region: regionCode,
    character: "March 7th",
    player_segment: "returning_story_player",
    objective: "version_recall",
    trigger: { type: "inactive_days", value: 21 },
    memory_requirements: memoryRequirements,
    message_strategy: {
      opening: "从玩家近期忙碌或久未见面切入",
      version_hook: "以一起前往新的梦境世界看看作为邀请",
      cta: "轻量邀请玩家了解2.0版本信息，不要求立即登录",
    },
    frequency_limit: { max_messages: 2, period_days: 7 },
    risk_rules: riskRules,
  };
  const firstDialogue = "最近是不是又忙得团团转啦？我只是想来看看你。列车接下来要前往一个叫匹诺康尼的新地方，听说那里连梦境都藏着许多秘密。等你有空的时候，要不要和我一起去看看？";
  const followupDialogue = "这次不只是换了一个目的地，我们还会进入梦境都市，遇到新的势力和探索机关。听说有些地方连方向和重力都会改变，我已经准备好相机了；你想出发的时候，再来找我就好。";
  return `# 角色共生发行方案

## ${item.regionName}区域

### 1. 共生发行目标

${objective}

### 2. 目标玩家群体
${list(targets)}

### 3. 可传递的版本信息
${list(messages)}

### 4. 角色沟通切入点
${communicationAngle}

推荐场景：
${list(scenes)}

### 5. 角色执行指令示例

\`\`\`json
${JSON.stringify(executionPayload, null, 2)}
\`\`\`

### 6. 对话示例

当目标玩家符合触达条件时：

${firstDialogue}

玩家继续追问后，再补充：

${followupDialogue}
`;
}

export function regionPlanToMarkdown(project: ProjectSnapshot, plan: ReleasePlan, region: RegionReleasePlan, citations: ResearchCitation[]) {
  const timeline = region.timeline.map((item) => `- **${item.week} · ${item.focus}**：${item.actions.join("；")}`).join("\n");
  const symbiosis = plan.characterSymbiosisRelease.find((item) => item.regionId === region.regionId);
  const regionSources = citations.filter((source) => source.regionId === region.regionId);
  const sources = regionSources.map((source) => `- [${source.displayId || source.id}] [${source.title}](${source.url})${source.publisher ? ` · ${source.publisher}` : ""}${source.publishedAt ? ` · ${source.publishedAt}` : ""}`).join("\n");
  return `# ${project.gameName || "未命名游戏"} · ${project.versionName || "新版本"} · ${region.regionName}发行策略\n\n生成时间：${plan.generatedAt}\n上线日期：${project.launchDate || "待定"}\n计划窗口：T${project.campaignStartWeek} 至 T+${project.campaignEndWeek}\n\n## 全球统一主轴\n\n${plan.globalAxis}\n\n### 全球原则\n${list(plan.globalPrinciples)}\n\n### 共同行动节点\n${list(plan.commonMoments)}\n\n## ${region.regionName}核心判断\n\n${region.coreJudgment}\n\n### 素材策略\n${list(region.materialStrategy)}\n\n### 社媒节奏\n${list(region.socialCadence)}\n\n### KOL 合作\n${list(region.kolPlan)}\n\n### 买量与联动\n${list([...region.paidMedia, ...region.partnerships])}\n\n### 周级时间表\n${timeline || "- 暂无"}\n\n### KPI 与预算\n${list([...region.kpis, ...region.budget])}\n\n### 风险边界\n${list(region.riskNotes)}\n\n## 角色关系型发行\n\n> 本章节仅为发行任务草案，不代表已经执行触达、发布、投放或外部联络。\n\n${regionalCharacterMarkdown(region) || "暂无角色关系型发行方案。"}\n\n## 角色共生发行方案\n\n${regionalSymbiosisMarkdown(symbiosis)}\n\n## 本区域来源\n\n${sources || "暂无外部来源。"}\n`;
}

export function markdownWordCount(content: string) {
  const plain = content.replace(/https?:\/\/\S+/g, " ").replace(/[`#>*_\[\]()|｜·：，。；、]/g, " ");
  return plain.match(/[\p{Script=Han}]|[\p{L}\p{N}]+/gu)?.length || 0;
}
