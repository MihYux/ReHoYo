"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, DownloadSimple, FileText, SpinnerGap, UserCircle } from "@phosphor-icons/react";
import { useWorkspace } from "@/components/workspace-provider";
import { characterSymbiosisToMarkdown, markdownWordCount, planToMarkdown, regionPlanToMarkdown } from "@/lib/markdown";
import styles from "./export.module.css";

export default function ExportPage() {
  const { data } = useWorkspace();
  const router = useRouter();
  const [busyRegionId, setBusyRegionId] = useState("");
  const [importError, setImportError] = useState<{ regionId: string; message: string } | null>(null);
  if (!data) return null;
  const plan = data.project.plan;
  if (!plan) return <ExportGate title="发行策略尚未生成" text="完成第 3 步后，这里会提供完整策略、区域文件和角色共生方案。" />;
  if (data.project.planStatus !== "approved") return <ExportGate title="请先确认最终方案" text="策略导出只使用页面 3 中由人工确认的最终文档版本。" />;

  const wholeWords = markdownWordCount(planToMarkdown(data.project, plan, data.citations));
  const regions = plan.regions.map((region) => ({
    region,
    words: markdownWordCount(regionPlanToMarkdown(data.project, plan, region, data.citations)),
  }));
  const characterPlans = plan.characterSymbiosisRelease.map((item) => ({
    item,
    words: markdownWordCount(characterSymbiosisToMarkdown(data.project, plan, item)),
  }));
  const allReady = wholeWords > 75 && regions.every((item) => item.words > 75) && characterPlans.length === regions.length;

  const importCharacterPlan = async (regionId: string) => {
    setBusyRegionId(regionId);
    setImportError(null);
    try {
      const response = await fetch("/api/character-release/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regionId }),
      });
      const payload = await response.json().catch(() => ({ error: "导入角色发行失败。" })) as { taskId?: string; error?: string };
      if (!response.ok || !payload.taskId) throw new Error(payload.error || "导入角色发行失败。");
      router.push(`/character-release?taskId=${encodeURIComponent(payload.taskId)}`);
    } catch (error) {
      setImportError({ regionId, message: error instanceof Error ? error.message : String(error) });
      setBusyRegionId("");
    }
  };

  return <div className="page-enter">
    <header className="page-header">
      <div><p className="page-kicker">DELIVERY / APPROVED PACKAGE</p><h1 className="page-title">最终发行策略，<br />按交付对象拆分。</h1><p className="page-description">下载完整或分区域发行方案，也可以把单区域三月七共生方案直接交给角色发行工作区。</p></div>
      <div className={styles.exportMeta}><div><span className="mono">STRATEGY FILES</span><strong>{regions.length + 1}</strong></div><div><span className="mono">CHARACTER FILES</span><strong>{characterPlans.length}</strong></div><span className={allReady ? styles.ready : styles.blocked}>{allReady ? "最终版本可交付" : "交付内容不完整"}</span></div>
    </header>

    <section className="section">
      <div className={styles.archiveBar}>
        <div><span className="mono">COMPLETE PACKAGE / ZIP</span><strong>一次下载全部最终方案</strong><p>完整发行策略、各区域独立策略和角色共生方案均来自同一人工确认版本。</p></div>
        <div className={styles.archiveActions}><a className="button" download href="/api/plan/export/character-archive"><DownloadSimple size={16} /> 角色共生 ZIP</a><a className="button button-primary" download href="/api/plan/export/archive"><DownloadSimple size={16} /> 发行策略 ZIP</a></div>
      </div>
    </section>

    <section className="section">
      <div className="section-heading"><div><h2 className="section-title"><span className="section-index">04-A</span>完整全球发行方案</h2><p className="section-note">包含全球主轴、全部区域策略、角色关系发行、角色共生方案与来源清单。</p></div></div>
      <article className={styles.masterFile}>
        <div className={styles.fileIndex}>00</div><div><span className="mono">MASTER DOCUMENT</span><h3>{data.project.gameName} · {data.project.versionName}</h3><p>{plan.regions.length} 个区域统一汇总，适合归档与跨团队交付。</p></div>
        <div className={styles.fileQuality}><Check size={16} weight="bold" /><span>{wholeWords.toLocaleString("zh-CN")} 词</span><small>最终确认版本</small></div>
        <a className="button button-primary" download href="/api/plan/export/strategy"><DownloadSimple size={16} /> 下载完整策略</a>
      </article>
    </section>

    <section className="section">
      <div className="section-heading"><div><h2 className="section-title"><span className="section-index">04-B</span>分区域发行方案</h2><p className="section-note">每份文件只保留对应区域的执行策略、节奏、预算、角色关系方案和区域来源。</p></div><span className={styles.packageCount}>{regions.length} REGIONAL FILES</span></div>
      <div className={styles.regionFiles}>{regions.map(({ region, words }, index) => <article className={styles.regionFile} key={region.regionId}>
        <span className={styles.fileIndex}>{String(index + 1).padStart(2, "0")}</span><div className={styles.regionIdentity}><span className="mono">REGIONAL STRATEGY</span><h3>{region.regionName}</h3></div><p>{region.coreJudgment}</p>
        <div className={styles.regionStats}><span>{region.timeline.length} 个节奏节点</span><span>{region.characterRelease.length} 个角色关系方案</span><strong>{words.toLocaleString("zh-CN")} 词</strong></div>
        <a className="button" download href={`/api/plan/export/strategy?regionId=${encodeURIComponent(region.regionId)}`}><DownloadSimple size={15} /> 下载 {region.regionName}</a>
      </article>)}</div>
    </section>

    <section className="section">
      <div className="section-heading"><div><h2 className="section-title"><span className="section-index">04-C</span>三月七角色共生方案</h2><p className="section-note">按区域下载独立 Markdown，或创建新的可追溯任务版本并进入角色发行控制台。</p></div><span className={styles.packageCount}>{characterPlans.length} CHARACTER FILES</span></div>
      <div className={styles.characterFiles}>{characterPlans.map(({ item, words }, index) => <article className={styles.characterFile} key={item.regionId}>
        <span className={styles.fileIndex}>{String(index + 1).padStart(2, "0")}</span><UserCircle size={28} weight="duotone" /><div className={styles.regionIdentity}><span className="mono">MARCH 7TH · REGION-SCOPED</span><h3>{item.regionName}</h3><p>{item.symbiosisObjective}</p></div>
        <div className={styles.regionStats}><span>{item.characterTasks.length} 个角色任务</span><strong>{words.toLocaleString("zh-CN")} 词</strong></div>
        <div className={styles.characterActions}><a className="button" download href={`/api/plan/export/character?regionId=${encodeURIComponent(item.regionId)}`}><DownloadSimple size={15} /> 下载 Markdown</a><button className="button button-primary" disabled={Boolean(busyRegionId)} onClick={() => void importCharacterPlan(item.regionId)}>{busyRegionId === item.regionId ? <><SpinnerGap className="spin" /> 导入中</> : <>导入角色发行 <ArrowRight size={15} /></>}</button></div>
        {importError?.regionId === item.regionId ? <p className={styles.importError} role="alert">{importError.message}</p> : null}
      </article>)}</div>
    </section>
  </div>;
}

function ExportGate({ title, text }: { title: string; text: string }) {
  return <div className="page-enter"><div className={styles.empty}><span className="mono">04 / EXPORT</span><FileText size={34} /><h1>{title}</h1><p>{text}</p><Link className="button button-primary" href="/plan"><ArrowLeft size={15} /> 返回发行方案</Link></div></div>;
}
