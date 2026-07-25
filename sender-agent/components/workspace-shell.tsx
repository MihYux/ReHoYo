"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { Check, CircleNotch, Warning } from "@phosphor-icons/react";
import type { WorkflowStatus } from "@/lib/contracts";
import { useWorkspace } from "@/components/workspace-provider";
import logo from "@/ReHoYo-transparent.png";

const nav = [
  { href: "/settings", number: "00", label: "连接设置", key: "settings" },
  { href: "/brief", number: "01", label: "版本理解", key: "brief" },
  { href: "/regions", number: "02", label: "区域判断", key: "regions" },
  { href: "/plan", number: "03", label: "发行方案", key: "plan" },
  { href: "/export", number: "04", label: "策略导出", key: "export" },
  { href: "/character-release", number: "05", label: "角色发行", key: "characterRelease" },
] as const;

const statusLabel: Record<WorkflowStatus, string> = {
  evidence_gap: "待补充",
  blocked: "已阻断",
  quality_passed: "质量通过",
  draft: "待开始",
  processing: "处理中",
  needs_review: "待审核",
  approved: "已审核",
  stale: "需更新",
  failed: "失败",
};

export function StatusBadge({ status }: { status: WorkflowStatus }) {
  return <span className={`status status-${status}`}>{statusLabel[status]}</span>;
}

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data, loading, error } = useWorkspace();
  const selectedRegions = data?.regions.filter((item) => item.selected) || [];
  const regionStatus: WorkflowStatus = !selectedRegions.length
    ? "draft"
    : selectedRegions.every((item) => item.status === "quality_passed")
      ? "quality_passed"
      : selectedRegions.some((item) => item.status === "processing")
        ? "processing"
        : selectedRegions.some((item) => item.status === "blocked")
          ? "blocked"
          : selectedRegions.some((item) => item.status === "evidence_gap")
            ? "evidence_gap"
        : selectedRegions.some((item) => item.status === "failed")
          ? "failed"
          : selectedRegions.some((item) => item.status === "stale")
            ? "stale"
            : "needs_review";
  const statuses: Record<(typeof nav)[number]["key"], WorkflowStatus> = {
    settings: data?.glm?.configured && data?.delivery?.configured ? "quality_passed" : "needs_review",
    brief: data?.project.briefStatus || "draft",
    regions: regionStatus,
    plan: data?.project.planStatus || "draft",
    export: data?.project.plan ? "quality_passed" : data?.project.planStatus || "draft",
    characterRelease: data?.project.planStatus === "approved" ? "needs_review" : data?.project.planStatus || "draft",
  };

  return (
    <>
      <header className="app-header">
        <HeaderPolygonBackdrop />
        <Link href="/brief" className="brand" aria-label="ReHoYo 首页">
          <span className="brand-crop"><Image src={logo} alt="ReHoYo" priority quality={100} sizes="168px" /></span>
          <span className="brand-divider" />
          <span className="brand-product">GLOBAL RELEASE INTELLIGENCE</span>
        </Link>
        <nav className="workflow-nav" aria-label="工作流">
          {nav.map((item) => {
            const active = pathname.startsWith(item.href);
            const status = statuses[item.key];
            return (
              <Link key={item.href} href={item.href} className={`workflow-link ${active ? "is-active" : ""}`}>
                <span className="workflow-number">{item.number}</span>
                <span>{item.label}</span>
                {status === "approved" || status === "quality_passed" ? <Check size={14} weight="bold" /> : status === "processing" ? <CircleNotch className="spin" size={14} /> : status === "failed" || status === "stale" || status === "blocked" ? <Warning size={14} /> : <span className="nav-dot" />}
              </Link>
            );
          })}
        </nav>
        <div className="header-meta">
          <span className={`api-indicator ${data?.glm.configured ? "is-online" : ""}`} />
          <span>{data?.glm.configured ? data.glm.model : "AI 未配置"}</span>
          <span className="header-separator" />
          <span>{data?.project.versionName || "未命名版本"}</span>
        </div>
      </header>
      {error ? <div className="global-error">{error}</div> : null}
      <main className="app-main">
        {loading ? <WorkspaceSkeleton /> : children}
      </main>
      <footer className="app-footer">
        <span>ReHoYo / EMPLOYEE SENDER AGENT</span>
        <span>研究资料留在本机，仅发布审核后的玩家安全区域策略</span>
      </footer>
    </>
  );
}

function HeaderPolygonBackdrop() {
  const [particles, setParticles] = useState<Array<CSSProperties & Record<`--${string}`, string>>>([]);

  useEffect(() => {
    const colors = ["#5cc8dc", "#2d9fca", "#167d8d", "#3f9ed1", "#196f9e", "#64c4dc"];
    setParticles(Array.from({ length: 42 }, (_, index) => {
      const size = 8 + Math.random() * 34;
      const duration = (2.6 + Math.random() * 3.6) * 10;
      return {
        "--particle-size": `${size.toFixed(1)}px`,
        "--particle-top": `${(-8 + Math.random() * 80).toFixed(1)}px`,
        "--particle-color": colors[Math.floor(Math.random() * colors.length)],
        "--particle-opacity": (0.08 + Math.random() * 0.18).toFixed(2),
        "--particle-duration": `${duration.toFixed(2)}s`,
        "--particle-delay": `${(-(index / 42) * duration - Math.random() * 1.4).toFixed(2)}s`,
        "--particle-rotation": `${Math.floor(Math.random() * 360)}deg`,
        "--particle-spin": `${Math.random() > 0.5 ? 1 : -1}${Math.floor(180 + Math.random() * 720)}deg`,
        "--particle-drift": `${(-10 + Math.random() * 20).toFixed(1)}px`,
        "--particle-skew": `${(0.72 + Math.random() * 0.56).toFixed(2)}`,
      };
    }));
  }, []);

  return (
    <div className="header-polygons" aria-hidden="true">
      {particles.map((style, index) => <span className="polygon-particle" style={style} key={index} />)}
    </div>
  );
}

function WorkspaceSkeleton() {
  return (
    <div className="skeleton-page" aria-label="正在载入">
      <div className="skeleton skeleton-kicker" />
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton-grid"><div className="skeleton skeleton-panel" /><div className="skeleton skeleton-panel" /></div>
    </div>
  );
}
