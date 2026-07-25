"use client";

import Link from "next/link";
import { ArrowLeft, Check, DownloadSimple, FileText } from "@phosphor-icons/react";
import { useWorkspace } from "@/components/workspace-provider";
import { markdownWordCount, planToMarkdown, regionPlanToMarkdown } from "@/lib/markdown";
import styles from "./export.module.css";

export default function ExportPage() {
  const { data } = useWorkspace();
  if (!data) return null;
  const plan = data.project.plan;
  if (!plan) return <div className="page-enter"><div className={styles.empty}><span className="mono">04 / EXPORT</span><FileText size={34} /><h1>发行策略尚未完成</h1><p>完成第 3 步后，这里会生成一份完整策略和全部区域的独立 Markdown 文件。</p><Link className="button button-primary" href="/plan"><ArrowLeft size={15} /> 返回发行方案</Link></div></div>;

  const wholeWords = markdownWordCount(planToMarkdown(data.project, plan, data.citations));
  const regions = plan.regions.map((region) => ({
    region,
    words: markdownWordCount(regionPlanToMarkdown(data.project, plan, region, data.citations)),
  }));
  const allReady = wholeWords > 75 && regions.every((item) => item.words > 75);

  return <div className="page-enter">
    <header className="page-header">
      <div><p className="page-kicker">DELIVERY / MARKDOWN PACKAGE</p><h1 className="page-title">发行策略，<br />按使用对象拆分。</h1><p className="page-description">下载 1 份完整发行策略，以及 {regions.length} 份可独立交付的区域 Markdown。每份文件均超过 75 个中英文词元。</p></div>
      <div className={styles.exportMeta}><div><span className="mono">FILES</span><strong>{regions.length + 1}</strong></div><div><span className="mono">FORMAT</span><strong>.MD</strong></div><span className={allReady ? styles.ready : styles.blocked}>{allReady ? "全部可导出" : "内容不足"}</span></div>
    </header>

    <section className="section">
      <div className={styles.archiveBar}>
        <div>
          <span className="mono">COMPLETE PACKAGE / ZIP</span>
          <strong>一次下载全部 {regions.length + 1} 份 Markdown</strong>
          <p>包含 1 份完整发行策略与 {regions.length} 份区域独立策略。</p>
        </div>
        <div className={styles.archiveActions}>
          <a className="button" download href="/api/plan/export/character-archive">
            <DownloadSimple size={16} /> 下载角色共生 ZIP
          </a>
          <a className="button button-primary" download href="/api/plan/export/archive">
            <DownloadSimple size={16} /> 下载全部 ZIP
          </a>
        </div>
      </div>
    </section>

    <section className="section">
      <div className="section-heading"><div><h2 className="section-title"><span className="section-index">04-A</span>完整发行策略</h2><p className="section-note">包含全球主轴、全部区域、角色关系型发行、角色共生发行与来源清单。</p></div></div>
      <article className={styles.masterFile}>
        <div className={styles.fileIndex}>00</div>
        <div><span className="mono">MASTER DOCUMENT</span><h3>{data.project.gameName} · {data.project.versionName}</h3><p>{plan.regions.length} 个区域统一汇总，适合整体审核、归档与跨团队交付。</p></div>
        <div className={styles.fileQuality}><Check size={16} weight="bold" /><span>{wholeWords.toLocaleString("zh-CN")} 词</span><small>已超过 75 词</small></div>
        <a className="button button-primary" download href="/api/plan/export/strategy"><DownloadSimple size={16} /> 下载完整策略</a>
      </article>
    </section>

    <section className="section">
      <div className="section-heading"><div><h2 className="section-title"><span className="section-index">04-B</span>区域独立文件</h2><p className="section-note">每份只保留本区域执行策略、角色任务、文化边界与本区域来源，避免区域数据混用。</p></div><span className={styles.packageCount}>{regions.length} REGIONAL FILES</span></div>
      <div className={styles.regionFiles}>
        {regions.map(({ region, words }, index) => <article className={styles.regionFile} key={region.regionId}>
          <span className={styles.fileIndex}>{String(index + 1).padStart(2, "0")}</span>
          <div className={styles.regionIdentity}><span className="mono">REGIONAL STRATEGY</span><h3>{region.regionName}</h3></div>
          <p>{region.coreJudgment}</p>
          <div className={styles.regionStats}><span>{region.timeline.length} 节点</span><span>{region.characterRelease.length} 角色方案</span><strong>{words.toLocaleString("zh-CN")} 词</strong></div>
          <a className="button" download href={`/api/plan/export/strategy?regionId=${encodeURIComponent(region.regionId)}`}><DownloadSimple size={15} /> 下载 {region.regionName}</a>
        </article>)}
      </div>
    </section>
  </div>;
}
