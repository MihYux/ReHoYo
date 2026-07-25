import detailBanner from "../../assets/gallery/rehoyo-detail-banner-1920x320-white.png";
import chatBlackSwan from "../../assests/readme-chat-black-swan.png";
import chatPenacony from "../../assests/readme-chat-penacony.png";
import workbenchRegion from "../../assests/readme-workbench-region.png";

export type WorkflowStage = {
  id: string;
  index: string;
  title: string;
  shortTitle: string;
  summary: string;
  detail: string;
  outcome: string;
  image: string;
  imageAlt: string;
};

export type ShowcaseImage = {
  id: string;
  label: string;
  title: string;
  description: string;
  src: string;
  alt: string;
};

export type Contributor = {
  login: string;
  name: string;
  role: string;
  avatar: string;
  profile: string;
};

export const links = {
  repository: "https://github.com/MihYux/ReHoYo",
  releases: "https://github.com/MihYux/ReHoYo/releases/latest",
  checksums: "https://github.com/MihYux/ReHoYo/releases/download/v0.1.2/SHA256SUMS.txt",
} as const;

export const workflowStages: WorkflowStage[] = [
  {
    id: "brief",
    index: "01",
    shortTitle: "版本理解",
    title: "把散落资料变成可审核的版本简报",
    summary: "上传内部资料，补全版本字段，并把游戏内容、商业目标与限制整理为团队共同理解。",
    detail: "AI 只补充空白字段；关键事实保留来源，最终内容由人确认后才进入下游。",
    outcome: "输出：版本简报与证据边界",
    image: workbenchRegion,
    imageAlt: "ReHoYo 工作台中的结构化区域信息与证据列表",
  },
  {
    id: "regions",
    index: "02",
    shortTitle: "区域判断",
    title: "用本地证据看见地区之间真正的差异",
    summary: "研究中国大陆、日本、韩国、北美、欧洲、东南亚及自定义区域，形成结构化判断。",
    detail: "玩家动机、渠道生态、文化时机与发行约束都能回到具体来源，避免只凭经验下结论。",
    outcome: "输出：区域判断、引用与质量状态",
    image: workbenchRegion,
    imageAlt: "ReHoYo 区域判断页，左侧为区域，右侧为证据来源",
  },
  {
    id: "plan",
    index: "03",
    shortTitle: "发行方案",
    title: "在统一主轴下，为每个区域生成不同打法",
    summary: "把审核后的版本理解和区域研究转化为素材、社媒、KOL、买量、联动与预算建议。",
    detail: "方案可编辑、自动保存，并明确区分 AI 草稿与人工最终确认版本。",
    outcome: "输出：全球方案与分区域行动建议",
    image: workbenchRegion,
    imageAlt: "ReHoYo 工作台展示区域策略判断与证据来源",
  },
  {
    id: "export",
    index: "04",
    shortTitle: "策略导出",
    title: "把最终策略交付成团队可以继续工作的文件",
    summary: "下载完整方案、分区域策略和角色共生 Markdown 或 ZIP，并保留版本与审核状态。",
    detail: "只有人工确认的最终方案可以导出，避免草稿被误当成正式交付。",
    outcome: "输出：可追溯的策略交付包",
    image: chatBlackSwan,
    imageAlt: "三月七角色陪伴界面中的黑天鹅主题对话",
  },
  {
    id: "character",
    index: "05",
    shortTitle: "角色发行",
    title: "让发行策略通过角色陪伴自然抵达玩家",
    summary: "将经过审核的区域方案导入三月七桌宠，进入任务、灰度发布、效果观察与持续优化。",
    detail: "发送前执行本地硬规则与语义评审；玩家授权、勿扰时间和频率限制始终优先。",
    outcome: "输出：可控、可撤回的角色共生任务",
    image: chatPenacony,
    imageAlt: "三月七角色陪伴界面中的匹诺康尼主题对话",
  },
];

export const showcaseImages: ShowcaseImage[] = [
  {
    id: "workbench",
    label: "REGIONAL INTELLIGENCE",
    title: "区域判断工作台",
    description: "结构化结论、地区差异与可追溯证据在同一画布中并列呈现。",
    src: workbenchRegion,
    alt: "ReHoYo 区域判断工作台截图",
  },
  {
    id: "penacony",
    label: "CHARACTER SYMBIOSIS",
    title: "三月七谈匹诺康尼",
    description: "角色共生方案不是把后台目标直接说给玩家，而是转化为自然、有边界的陪伴。",
    src: chatPenacony,
    alt: "ReHoYo 三月七桌宠谈匹诺康尼的真实对话截图",
  },
  {
    id: "black-swan",
    label: "LOCAL SAFETY REVIEW",
    title: "三月七谈黑天鹅",
    description: "真实模型回复经过本地输出检查，密钥、内部元数据与后台指令不会出现在玩家消息中。",
    src: chatBlackSwan,
    alt: "ReHoYo 三月七桌宠谈黑天鹅的真实对话截图",
  },
];

export const contributors: Contributor[] = [
  {
    login: "UnoxyRich",
    name: "UnoxyRich",
    role: "产品架构 · 全栈工程",
    avatar: "/contributors/unoxyrich.png",
    profile: "https://github.com/UnoxyRich",
  },
  {
    login: "maybebebee",
    name: "maybebebee",
    role: "产品协作 · 体验设计",
    avatar: "/contributors/maybebebee.png",
    profile: "https://github.com/maybebebee",
  },
  {
    login: "wangxz01",
    name: "wangxz01",
    role: "工程协作 · 质量验证",
    avatar: "/contributors/wangxz01.png",
    profile: "https://github.com/wangxz01",
  },
];

export const stack = [
  ["WEB", "Next.js 16 · React 19 · TypeScript"],
  ["DESKTOP", "Electron 43 · Vite 8"],
  ["DATA", "SQLite · libSQL · Drizzle ORM"],
  ["VALIDATION", "Zod · 本地安全规则"],
  ["AI", "智谱 GLM · DeepSeek"],
  ["VISUAL", "D3 Force · React Force Graph"],
  ["DOCUMENTS", "DOCX · PDF · XLSX · Markdown"],
  ["QUALITY", "Vitest · Playwright · ESLint"],
] as const;

export const heroBanner = detailBanner;
