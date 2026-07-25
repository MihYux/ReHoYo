import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle,
  Database,
  Desktop,
  DownloadSimple,
  GithubLogo,
  GlobeHemisphereWest,
  List,
  LockKey,
  Package,
  ShieldCheck,
  Sparkle,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import {
  contributors,
  heroBanner,
  links,
  showcaseImages,
  stack,
  workflowStages,
  type ShowcaseImage,
} from "./data";

const navItems = [
  ["产品", "#product"],
  ["流程", "#workflow"],
  ["预览", "#preview"],
  ["架构", "#architecture"],
  ["团队", "#team"],
] as const;

const particles = Array.from({ length: 13 }, (_, index) => ({
  "--particle-left": `${index * 8 + (index % 3) * 2}%`,
  "--particle-top": `${18 + (index % 4) * 19}%`,
  "--particle-delay": `${index * -1.35}s`,
  "--particle-duration": `${16 + (index % 4) * 3}s`,
  "--particle-size": `${7 + (index % 4) * 3}px`,
} as React.CSSProperties));

function ExternalLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a className={className} href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

function SectionHeader({
  index,
  eyebrow,
  title,
  description,
}: {
  index: string;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="section-header">
      <div className="section-marker">
        <span>{index}</span>
        <i aria-hidden="true" />
      </div>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p className="section-description">{description}</p>
      </div>
    </div>
  );
}

function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="site-header">
      <div className="header-particles" aria-hidden="true">
        {particles.map((particle, index) => (
          <i key={index} style={particle} />
        ))}
      </div>
      <div className="header-inner">
        <a className="brand" href="#top" aria-label="返回 ReHoYo 首页">
          <span className="brand-word">ReHoYo</span>
          <span className="brand-rule" />
          <span className="brand-sub">GLOBAL RELEASE<br />INTELLIGENCE</span>
        </a>
        <nav className={open ? "site-nav is-open" : "site-nav"} aria-label="主导航">
          {navItems.map(([label, href], index) => (
            <a key={href} href={href} onClick={() => setOpen(false)}>
              <span>{String(index + 1).padStart(2, "0")}</span>{label}
            </a>
          ))}
        </nav>
        <div className="header-actions">
          <ExternalLink className="header-github" href={links.repository}>
            <GithubLogo weight="fill" aria-hidden="true" />
            <span>GitHub</span>
          </ExternalLink>
          <button
            className="menu-button"
            type="button"
            aria-expanded={open}
            aria-label={open ? "关闭导航" : "打开导航"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X aria-hidden="true" /> : <List aria-hidden="true" />}
          </button>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">ADVENTUREX 2026 · AI AGENTS × LOCAL INTELLIGENCE</p>
          <h1 id="hero-title">让每个地区，<br /><span>都不再从零开始。</span></h1>
          <p className="hero-lead">
            ReHoYo 把版本理解、区域研究、全球发行方案、角色共生执行与人工最终确认连接在同一个本地工作台中。
          </p>
          <div className="hero-actions">
            <ExternalLink className="button button-primary" href={links.releases}>
              <DownloadSimple weight="bold" aria-hidden="true" />
              下载最新版本
              <ArrowUpRight weight="bold" aria-hidden="true" />
            </ExternalLink>
            <ExternalLink className="button button-secondary" href={links.repository}>
              <GithubLogo weight="fill" aria-hidden="true" />
              查看 GitHub 仓库
            </ExternalLink>
          </div>
          <p className="hero-note">
            <ShieldCheck weight="fill" aria-hidden="true" />
            Windows 与 macOS 预览构建 · 下载前可核验 SHA-256
          </p>
          <p className="hero-callout">目前网页是介绍，请去github上体验完整版</p>
        </div>
        <aside className="control-card" aria-label="ReHoYo 当前发布状态">
          <div className="control-card-head">
            <span>RELEASE CONTROL</span>
            <span className="online"><i /> READY</span>
          </div>
          <div className="control-readout">
            <span className="readout-index">05 / 05</span>
            <div>
              <strong>人类保持最终控制</strong>
              <p>只有审核通过的策略，才会进入导出和角色发行。</p>
            </div>
          </div>
          <div className="control-steps" aria-hidden="true">
            {workflowStages.map((stage) => <i key={stage.id} className="is-complete" />)}
          </div>
          <dl>
            <div><dt>模式</dt><dd>LOCAL-FIRST</dd></div>
            <div><dt>证据</dt><dd>TRACEABLE</dd></div>
            <div><dt>状态</dt><dd>HUMAN APPROVED</dd></div>
          </dl>
        </aside>
      </div>
      <div className="hero-banner-frame">
        <img src={heroBanner} alt="ReHoYo 全球发行智能工作台白色主题横幅" width="1920" height="320" />
      </div>
    </section>
  );
}

function ProductSection() {
  const pillars = [
    {
      icon: GlobeHemisphereWest,
      label: "REGION AWARE",
      title: "地区不是翻译变量",
      text: "把玩家动机、渠道、文化时机与风险作为独立判断，而不是在全球方案末尾补一层本地化。",
    },
    {
      icon: Database,
      label: "EVIDENCE BOUND",
      title: "每条判断都能回到来源",
      text: "内部资料与联网研究分开治理，结论保留证据编号、时间边界与质量状态。",
    },
    {
      icon: ShieldCheck,
      label: "HUMAN CONTROL",
      title: "AI 生成，人工批准",
      text: "草稿、审核、最终方案与角色任务有清晰状态边界，不让生成结果越权成为正式执行。",
    },
  ];

  return (
    <section className="content-section" id="product">
      <SectionHeader
        index="01"
        eyebrow="WHY REHOYO"
        title="全球发行不缺模板，缺的是有来源的区域判断。"
        description="ReHoYo 不是自动投放工具，而是一套让发行团队先理解版本、再理解地区、最后形成可审核行动的决策工作台。"
      />
      <div className="problem-grid">
        <article className="problem-panel">
          <span className="panel-label">BEFORE</span>
          <h3>资料散落，地区重复研究，策略难以追溯。</h3>
          <p>版本资料、市场洞察、渠道经验和角色内容往往分散在文档、聊天与个人记忆中。</p>
        </article>
        <div className="problem-arrow" aria-hidden="true"><ArrowRight weight="thin" /></div>
        <article className="problem-panel is-outcome">
          <span className="panel-label">WITH REHOYO</span>
          <h3>一个本地工作台，连接证据、判断与交付。</h3>
          <p>团队共享同一套版本理解和区域证据，同时保留每一步的人类审核边界。</p>
        </article>
      </div>
      <div className="pillar-grid">
        {pillars.map(({ icon: Icon, ...pillar }) => (
          <article className="pillar-card" key={pillar.label}>
            <div className="pillar-icon"><Icon weight="duotone" aria-hidden="true" /></div>
            <span>{pillar.label}</span>
            <h3>{pillar.title}</h3>
            <p>{pillar.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function WorkflowSection() {
  const [activeId, setActiveId] = useState(workflowStages[0].id);
  const activeStage = useMemo(
    () => workflowStages.find((stage) => stage.id === activeId) ?? workflowStages[0],
    [activeId],
  );

  return (
    <section className="content-section" id="workflow">
      <SectionHeader
        index="02"
        eyebrow="CONTROLLED WORKFLOW"
        title="五个阶段，只有一条可审计的前进路径。"
        description="阶段编号不是装饰：每一步都消费上一步经过审核的结果，任何上游修改都会让下游内容明确失效。"
      />
      <div className="workflow-shell">
        <div className="workflow-rail" role="tablist" aria-label="ReHoYo 五阶段工作流">
          {workflowStages.map((stage) => (
            <button
              key={stage.id}
              type="button"
              role="tab"
              aria-selected={activeStage.id === stage.id}
              aria-controls={`stage-panel-${stage.id}`}
              id={`stage-tab-${stage.id}`}
              className={activeStage.id === stage.id ? "workflow-tab is-active" : "workflow-tab"}
              onClick={() => setActiveId(stage.id)}
            >
              <span>{stage.index}</span>
              <strong>{stage.shortTitle}</strong>
              <i aria-hidden="true" />
            </button>
          ))}
        </div>
        <div
          className="workflow-panel"
          role="tabpanel"
          id={`stage-panel-${activeStage.id}`}
          aria-labelledby={`stage-tab-${activeStage.id}`}
          tabIndex={0}
        >
          <div className="workflow-copy">
            <p className="eyebrow">STAGE {activeStage.index} · {activeStage.shortTitle}</p>
            <h3>{activeStage.title}</h3>
            <p className="workflow-summary">{activeStage.summary}</p>
            <p className="workflow-detail">{activeStage.detail}</p>
            <div className="workflow-outcome">
              <CheckCircle weight="fill" aria-hidden="true" />
              {activeStage.outcome}
            </div>
          </div>
          <div className="workflow-image">
            <img src={activeStage.image} alt={activeStage.imageAlt} />
            <div className="image-status"><i /> VERIFIED LOCAL OUTPUT</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PreviewSection({ onOpen }: { onOpen: (image: ShowcaseImage) => void }) {
  return (
    <section className="content-section" id="preview">
      <SectionHeader
        index="03"
        eyebrow="PRODUCT PREVIEW"
        title="从研究画布，到玩家最终看到的一句话。"
        description="截图来自当前仓库的真实工作台与桌宠配置；公开资产不包含 API Key、内部文档正文或后台交付元数据。"
      />
      <div className="gallery-grid">
        {showcaseImages.map((image, index) => (
          <article className={index === 0 ? "gallery-card is-wide" : "gallery-card"} key={image.id}>
            <button type="button" className="gallery-image" onClick={() => onOpen(image)} aria-label={`放大查看：${image.title}`}>
              <img src={image.src} alt={image.alt} loading="lazy" />
              <span>查看大图 <ArrowUpRight weight="bold" aria-hidden="true" /></span>
            </button>
            <div className="gallery-copy">
              <span>{image.label}</span>
              <h3>{image.title}</h3>
              <p>{image.description}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ArchitectureSection() {
  return (
    <section className="content-section" id="architecture">
      <SectionHeader
        index="04"
        eyebrow="LOCAL-FIRST ARCHITECTURE"
        title="云端负责模型能力，本地保留项目控制权。"
        description="原始文件、项目数据库、审核状态与角色发行工作区默认保存在用户设备；网站本身不连接这些数据。"
      />
      <div className="architecture-grid">
        <div className="architecture-diagram" aria-label="ReHoYo 本地优先架构示意">
          <div className="architecture-node is-user">
            <Desktop weight="duotone" aria-hidden="true" />
            <span>LOCAL DESKTOP</span>
            <strong>ReHoYo 工作台</strong>
          </div>
          <div className="architecture-line"><span>审核后交付</span><i /></div>
          <div className="architecture-node is-companion">
            <Sparkle weight="duotone" aria-hidden="true" />
            <span>COMPANION LOOP</span>
            <strong>三月七桌宠</strong>
          </div>
          <div className="architecture-safety">
            <LockKey weight="fill" aria-hidden="true" />
            数据库、上传文件与密钥默认不离开本地边界
          </div>
        </div>
        <div className="stack-list">
          {stack.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TeamSection() {
  return (
    <section className="content-section" id="team">
      <SectionHeader
        index="05"
        eyebrow="HUMAN CONTRIBUTORS"
        title="由人定义边界，也由人对最终结果负责。"
        description="以下成员来自公开 GitHub 贡献记录。AI 工具参与开发过程，但不列入人类贡献者名单。"
      />
      <div className="contributors-grid">
        {contributors.map((contributor) => (
          <ExternalLink className="contributor-card" href={contributor.profile} key={contributor.login}>
            <img src={contributor.avatar} alt={`${contributor.name} 的 GitHub 头像`} loading="lazy" width="88" height="88" />
            <div>
              <span>@{contributor.login}</span>
              <h3>{contributor.name}</h3>
              <p>{contributor.role}</p>
            </div>
            <ArrowUpRight weight="bold" aria-hidden="true" />
          </ExternalLink>
        ))}
      </div>
    </section>
  );
}

function ReleaseSection() {
  const safeguards = [
    "不直接连接真实广告投放、支付、社交平台或外部发布渠道。",
    "未签名预览安装包可能触发 SmartScreen 或 Gatekeeper 提示。",
    "角色回复用于陪伴与娱乐，不构成专业建议。",
    "本项目与米哈游 / HoYoverse 无隶属、合作或背书关系。",
  ];

  return (
    <section className="release-section" id="download">
      <div className="release-main">
        <p className="eyebrow">PUBLIC PREVIEW · v0.1.2</p>
        <h2>把全球发行的复杂性，<br />留在一个可控的工作台里。</h2>
        <p>下载 Windows 或 macOS 预览版，或直接进入公开仓库查看实现、测试与完整文档。</p>
        <div className="hero-actions">
          <ExternalLink className="button button-primary" href={links.releases}>
            <Package weight="fill" aria-hidden="true" />
            前往最新版本
            <ArrowUpRight weight="bold" aria-hidden="true" />
          </ExternalLink>
          <ExternalLink className="button button-secondary" href={links.repository}>
            <GithubLogo weight="fill" aria-hidden="true" />
            阅读源代码
          </ExternalLink>
          <ExternalLink className="checksum-link" href={links.checksums}>
            SHA256SUMS.txt <ArrowUpRight weight="bold" aria-hidden="true" />
          </ExternalLink>
        </div>
      </div>
      <aside className="safeguards">
        <div className="safeguards-head"><ShieldCheck weight="duotone" aria-hidden="true" /><span>公开预览边界</span></div>
        <ul>
          {safeguards.map((item) => <li key={item}><CheckCircle weight="fill" aria-hidden="true" />{item}</li>)}
        </ul>
      </aside>
    </section>
  );
}

function Lightbox({ image, onClose }: { image: ShowcaseImage | null; onClose: () => void }) {
  useEffect(() => {
    if (!image) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.classList.add("has-dialog");
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("has-dialog");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [image, onClose]);

  if (!image) return null;
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={image.title} onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="lightbox-card">
        <button type="button" className="lightbox-close" onClick={onClose} aria-label="关闭大图">
          <X weight="bold" aria-hidden="true" />
        </button>
        <img src={image.src} alt={image.alt} />
        <div><span>{image.label}</span><strong>{image.title}</strong></div>
      </div>
    </div>
  );
}

export function App() {
  const [selectedImage, setSelectedImage] = useState<ShowcaseImage | null>(null);

  return (
    <>
      <a className="skip-link" href="#main">跳到主要内容</a>
      <Header />
      <main id="main">
        <div className="page-shell" id="top">
          <Hero />
          <ProductSection />
          <WorkflowSection />
          <PreviewSection onOpen={setSelectedImage} />
          <ArchitectureSection />
          <TeamSection />
          <ReleaseSection />
        </div>
      </main>
      <footer className="site-footer">
        <div className="footer-inner">
          <div><strong>ReHoYo</strong><span>全球发行智能工作台</span></div>
          <p>ADVENTUREX 2026 · BUILT WITH HUMAN CONTROL</p>
          <div className="footer-links">
            <ExternalLink href={links.repository}>GitHub</ExternalLink>
            <ExternalLink href={links.releases}>Releases</ExternalLink>
            <a href="#top">返回顶部</a>
          </div>
        </div>
      </footer>
      <Lightbox image={selectedImage} onClose={() => setSelectedImage(null)} />
    </>
  );
}
