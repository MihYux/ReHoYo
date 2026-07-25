"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowSquareOut, ArrowsInSimple, ArrowsOutSimple, CaretDown, CaretUp, Check, CircleNotch, GlobeHemisphereEast, Info, MagnifyingGlass, Plus, Warning } from "@phosphor-icons/react";
import type { RegionAnalysis, RegionConfig, RegionResearchBatch, ResearchClaim } from "@/lib/contracts";
import { useWorkspace } from "@/components/workspace-provider";
import { StatusBadge } from "@/components/workspace-shell";
import RegionIntelligenceViewport from "@/components/region-intelligence-viewport";
import styles from "./regions.module.css";

const phaseLabels: Record<string, string> = {
  queued: "等待调度",
  searching: "检索公开信号",
  verifying: "验证页面与日期",
  quality_check: "运行质量门",
  synthesizing: "综合区域判断",
  provisional_synthesis: "生成临时差异矩阵",
  saving: "校验并保存",
  quality_passed: "质量门通过",
  evidence_gap: "待补充",
  blocked: "已阻断",
  retry_wait: "退避后重试",
  failed: "研究失败",
};

const dimensions: Array<{ key: keyof Pick<RegionAnalysis, "playerSignals" | "marketEnvironment" | "sentimentAndCompetition" | "culturalMoments">; label: string; code: string }> = [
  { key: "playerSignals", label: "当地玩家信号", code: "PLAYER" },
  { key: "marketEnvironment", label: "市场环境", code: "MARKET" },
  { key: "sentimentAndCompetition", label: "舆情与竞品", code: "SENTIMENT" },
  { key: "culturalMoments", label: "文化节点", code: "CULTURE" },
];

const differentiationRoleLabels = {
  audience: "玩家动机",
  channel: "渠道生态",
  culture: "文化时机",
  constraint: "发行约束",
  contrast: "区域对照",
} as const;

const confidenceLabels = { high: "高可信", medium: "中可信", low: "待验证" } as const;

export default function RegionsPage() {
  const { data, refresh, request } = useWorkspace();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeId, setActiveId] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [compare, setCompare] = useState(searchParams.get("view") === "matrix");
  const [comparisonView, setComparisonView] = useState<"matrix" | "columns">(searchParams.get("view") === "columns" ? "columns" : "matrix");
  const [batchId, setBatchId] = useState(searchParams.get("batch") || "");
  const [batch, setBatch] = useState<RegionResearchBatch | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [graphPipOpen, setGraphPipOpen] = useState(true);
  const [graphPipExpanded, setGraphPipExpanded] = useState(true);
  const [graphPipIntro, setGraphPipIntro] = useState(true);
  const [graphPipPortalReady, setGraphPipPortalReady] = useState(false);
  const [evidenceFocus, setEvidenceFocus] = useState<{ id: string; sequence: number } | null>(null);
  const [custom, setCustom] = useState({ name: "", language: "", timezone: "", note: "" });
  const workspaceRevision = useRef("");
  const completedNavigation = useRef("");
  const evidenceSequence = useRef(0);
  const workspaceReady = Boolean(data);

  const selected = useMemo(() => data?.regions.filter((region) => region.selected) || [], [data]);
  const active = data?.regions.find((region) => region.id === activeId) || selected[0] || data?.regions[0];
  const analysis = active?.analysis || null;
  const sources = data?.citations.filter((source) => source.regionId === active?.id) || [];
  const activeBatchItem = batch?.items.find((item) => item.regionId === active?.id);
  const activeProviderStats = Object.values(activeBatchItem?.providerStats || {});
  const activeCachedCalls = activeProviderStats.reduce((sum, stats) => sum + (stats.cached || 0), 0);
  const activeUsesCache = batch?.executionMode !== "embedded_fixture" && Boolean(batch?.demoCacheReplay || activeCachedCalls > 0);
  const batchUsesCache = batch?.executionMode !== "embedded_fixture" && Boolean(batch?.demoCacheReplay || batch?.items.some((item) => Object.values(item.providerStats || {}).some((stats) => (stats.cached || 0) > 0)));

  useEffect(() => {
    if (!activeId && selected[0]) setActiveId(selected[0].id);
  }, [activeId, selected]);
  useEffect(() => { setGraphPipPortalReady(true); }, []);
  useEffect(() => {
    if (!workspaceReady || !graphPipPortalReady) return;
    setGraphPipOpen(true);
    setGraphPipExpanded(true);
    setGraphPipIntro(true);
    const timer = window.setTimeout(() => {
      setGraphPipIntro(false);
      setGraphPipExpanded(false);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [graphPipPortalReady, workspaceReady]);
  useEffect(() => {
    const minimize = () => {
      setGraphPipIntro(false);
      setGraphPipExpanded(false);
      setGraphPipOpen(false);
    };
    window.addEventListener("wheel", minimize, { passive: true });
    window.addEventListener("touchmove", minimize, { passive: true });
    document.addEventListener("scroll", minimize, { capture: true, passive: true });
    return () => {
      window.removeEventListener("wheel", minimize);
      window.removeEventListener("touchmove", minimize);
      document.removeEventListener("scroll", minimize, true);
    };
  }, []);
  useEffect(() => {
    const nextBatch = searchParams.get("batch") || "";
    if (nextBatch && nextBatch !== batchId) setBatchId(nextBatch);
    const nextView = searchParams.get("view");
    if (nextView === "matrix" || nextView === "columns") {
      setCompare(true);
      setComparisonView(nextView);
    }
  }, [batchId, searchParams]);
  useEffect(() => {
    if (!evidenceFocus || compare) return;
    let focusTimer = 0;
    const locateTimer = window.setTimeout(() => {
      const target = document.getElementById(`evidence-${evidenceFocus.id}`);
      if (!target) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center", inline: "nearest" });
      target.focus({ preventScroll: true });
      focusTimer = window.setTimeout(() => document.getElementById(`evidence-${evidenceFocus.id}`)?.focus({ preventScroll: true }), reduced ? 0 : 240);
    }, 40);
    const clearTimer = window.setTimeout(() => {
      setEvidenceFocus((current) => current?.sequence === evidenceFocus.sequence ? null : current);
    }, 2500);
    return () => { window.clearTimeout(locateTimer); window.clearTimeout(focusTimer); window.clearTimeout(clearTimer); };
  }, [activeId, compare, evidenceFocus]);

  useEffect(() => {
    if (!batchId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const next = await request<{ batch: RegionResearchBatch }>(`/api/regions/research-batch/${batchId}`);
        if (cancelled) return;
        setBatch(next.batch);
        const revision = `${next.batch.updatedAt}:${next.batch.status}:${next.batch.synthesisStatus}:${next.batch.qualityPassed}:${next.batch.evidenceGap}:${next.batch.failed}`;
        if (revision !== workspaceRevision.current) {
          workspaceRevision.current = revision;
          await refresh();
        }
        const synthesisReady = next.batch.synthesisStatus === "completed" || next.batch.synthesisStatus === "provisional";
        if (next.batch.status === "completed" && synthesisReady && completedNavigation.current !== next.batch.id) {
          completedNavigation.current = next.batch.id;
          setCompare(true);
          setComparisonView("matrix");
          router.replace(`/regions?view=matrix&batch=${next.batch.id}#region-matrix`, { scroll: false });
          requestAnimationFrame(() => {
            const target = document.getElementById("region-matrix");
            target?.focus({ preventScroll: true });
            target?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
          });
        }
        if (next.batch.status === "queued" || next.batch.status === "processing") timer = setTimeout(poll, 1000);
      } catch (nextError) {
        if (!cancelled) {
          setError((nextError as Error).message);
          timer = setTimeout(poll, 2000);
        }
      }
    };
    void poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [batchId, refresh, request, router]);

  if (!data) return null;

  async function action(name: string, run: () => Promise<unknown>, success: string) {
    setBusy(name); setError(""); setMessage("");
    try { await run(); await refresh(); setMessage(success); }
    catch (nextError) { setError((nextError as Error).message); }
    finally { setBusy(""); }
  }

  async function toggleRegion(region: RegionConfig) {
    await action(`toggle-${region.id}`, () => request(`/api/regions/${region.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selected: !region.selected }) }), region.selected ? `已移除 ${region.name}` : `已加入 ${region.name}`);
    if (!region.selected) setActiveId(region.id);
  }

  function revealEvidence(citationId: string, regionId: string) {
    evidenceSequence.current += 1;
    setActiveId(regionId);
    setCompare(false);
    setGraphPipOpen(false);
    setGraphPipExpanded(false);
    setGraphPipIntro(false);
    setEvidenceFocus({ id: citationId, sequence: evidenceSequence.current });
    if (compare) router.replace(batchId ? `/regions?batch=${batchId}` : "/regions", { scroll: false });
  }

  async function startBatch() {
    setBusy("batch"); setError(""); setMessage("");
    try {
      const result = await request<{ batch: RegionResearchBatch }>("/api/regions/research-batch", { method: "POST" });
      workspaceRevision.current = "";
      completedNavigation.current = "";
      setBatch(result.batch);
      setBatchId(result.batch.id);
      setCompare(false);
      router.replace(`/regions?batch=${result.batch.id}`, { scroll: false });
      await refresh();
      setMessage(result.batch.demoCacheReplay
        ? `输入未变化，已自动启动 ${result.batch.etaSeconds || 25} 秒历史检索缓存演示；不会调用搜索供应商或改写证据。`
        : `已启动 ${result.batch.total} 个区域的研究与自动质量检查`);
    } catch (nextError) {
      setError((nextError as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function retryBatch() {
    if (!batch) return;
    setBusy("retry-batch"); setError(""); setMessage("");
    try {
      const result = await request<{ batch: RegionResearchBatch }>(`/api/regions/research-batch/${batch.id}/retry`, { method: "POST" });
      setBatch(result.batch);
      workspaceRevision.current = "";
      setMessage(`已重新排队 ${batch.failed} 个失败区域`);
    } catch (nextError) {
      setError((nextError as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function replayDemoCache() {
    if (!batch || batch.status !== "completed") return;
    setBusy("demo-replay"); setError(""); setMessage("");
    try {
      const result = await request<{ batch: RegionResearchBatch }>(`/api/regions/research-batch/${batch.id}/demo-replay`, { method: "POST" });
      workspaceRevision.current = "";
      completedNavigation.current = "";
      setBatch(result.batch);
      setBatchId(result.batch.id);
      setCompare(false);
      router.replace(`/regions?batch=${result.batch.id}`, { scroll: false });
      setMessage("已启动 25 秒历史检索缓存演示；不会调用搜索供应商，也不会改写证据。 ");
    } catch (nextError) {
      setError((nextError as Error).message);
    } finally {
      setBusy("");
    }
  }

  const approvedCount = selected.filter((item) => item.status === "quality_passed").length;
  const batchRunning = batch?.status === "queued" || batch?.status === "processing";

  return (
    <div className="page-enter">
      <header className="page-header">
        <div>
          <p className="page-kicker">REGIONAL SIGNALS / EVIDENCE</p>
          <h1 className="page-title">同一个版本，<br />在不同区域意味着什么。</h1>
          <p className="page-description">把全球统一事实基线与当地玩家、市场、舆情和文化时点对照。每条判断都回到可检查的公开来源。</p>
        </div>
        <div className={styles.progressSummary}>
          <span className="mono">REGIONAL COVERAGE</span>
          <strong>{batch?.qualityPassed ?? approvedCount}<small> / {batch?.total ?? data?.regions.length ?? 0}</small></strong>
          <div>{batch?.status === "completed" ? "全区域研究已结束" : batchRunning ? "自适应研究正在运行" : "一次启动全部区域"}</div>
        </div>
      </header>

      {data.project.briefStatus !== "approved" ? (
        <div className={styles.gate}>
          <div className={styles.gateMark}>02</div>
          <div><p className="page-kicker">GATED BY VERSION BRIEF</p><h2>先确认版本事实基线</h2><p>区域判断只使用已审核的版本简报。返回上一步检查目标、卖点、资产和角色关系。</p><Link className="button button-primary" href="/brief">返回版本理解</Link></div>
        </div>
      ) : (
        <>
          <div className="notice notice-cyan"><GlobeHemisphereEast size={19} /><div className="notice-content"><strong>GAME COMMUNITY RESEARCH</strong><span className="mono">GLM {data.providers?.glm.configured ? `READY / ${data.providers.glm.model}` : "OFF"} · REDDIT · HOYOLAB · 米游社 · TAPTAP · 巴哈姆特 · PUBLIC GAME FORUMS</span></div></div>
          {!data.glm.configured ? <div className="notice notice-amber"><Warning size={19} /><div className="notice-content"><strong>需要配置 GLM 才能联网研究</strong><span>区域选择、人工来源和已有判断仍可查看。</span></div></div> : null}
          {error ? <div className="notice notice-red"><Warning size={19} /><div className="notice-content"><strong>研究未完成</strong><span>{error}</span></div></div> : null}
          {message ? <div className="notice notice-cyan"><Check size={19} /><div className="notice-content"><strong>{message}</strong><span>区域之间互不覆盖，可以单独重试。</span></div></div> : null}

          <section className="section">
            <div className="section-heading">
              <div><h2 className="section-title"><span className="section-index">02-A</span>发行区域</h2><p className="section-note">批次会锁定全部区域；合格结果自动通过质量门，证据不足则明确阻断。</p></div>
              <div className="page-actions"><button className="button" onClick={() => setCustomOpen(!customOpen)} disabled={Boolean(batchRunning)}><Plus size={15} /> 自定义区域</button><button className="button button-cyan" onClick={() => void startBatch()} disabled={Boolean(busy) || Boolean(batchRunning) || !data.glm.configured}>{batchRunning || busy === "batch" ? <><CircleNotch className={styles.spin} size={16} /> 全区域研究运行中</> : <><MagnifyingGlass size={16} /> 研究并检查全部 {data.regions.length} 个区域</>}</button></div>
            </div>
            <div className={styles.regionSelector}>
              {data.regions.map((region) => <button key={region.id} className={`${styles.regionChip} ${region.selected ? styles.regionSelected : ""}`} onClick={() => void toggleRegion(region)} disabled={Boolean(busy) || Boolean(batchRunning)}><span className="mono">{region.code.toUpperCase().slice(0, 5)}</span><strong>{region.name}</strong>{region.selected ? <Check size={15} weight="bold" /> : <Plus size={15} />}</button>)}
            </div>
            {customOpen ? <form className={styles.customForm} onSubmit={(e) => { e.preventDefault(); void action("custom", () => request("/api/regions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(custom) }), "自定义区域已创建").then(() => { setCustom({ name: "", language: "", timezone: "", note: "" }); setCustomOpen(false); }); }}><input className="input" required placeholder="区域名称" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} /><input className="input" placeholder="主要语言" value={custom.language} onChange={(e) => setCustom({ ...custom, language: e.target.value })} /><input className="input mono" placeholder="时区，例如 Europe/Paris" value={custom.timezone} onChange={(e) => setCustom({ ...custom, timezone: e.target.value })} /><input className="input" placeholder="研究备注" value={custom.note} onChange={(e) => setCustom({ ...custom, note: e.target.value })} /><button className="button button-primary" disabled={Boolean(busy)}>添加</button></form> : null}
          </section>

          {batch ? <div className={styles.batchStrip} aria-label="区域研究任务状态">
            {batch.items.map((item) => <button key={item.jobId} className={`${styles.batchItem} ${item.regionId === activeId ? styles.batchItemActive : ""} ${item.phase === "failed" ? styles.batchItemFailed : ""}`} onClick={() => setActiveId(item.regionId)}>
              <span className="mono">{String(item.progress).padStart(2, "0")}%</span><strong>{item.regionName}</strong><small>{phaseLabels[item.phase] || item.phase}{item.attempt ? ` · 第 ${item.attempt} 次` : ""}</small><i style={{ width: `${item.progress}%` }} />
            </button>)}
          </div> : null}

          {graphPipPortalReady ? createPortal(<aside
            className={`${styles.graphPip} ${graphPipOpen ? "" : styles.graphPipCollapsed} ${graphPipExpanded ? styles.graphPipExpanded : ""} ${graphPipIntro ? styles.graphPipIntro : ""}`}
            aria-label="02-B 区域情报节点图画中画"
            data-region-graph-pip="true"
            data-pip-mode={graphPipIntro ? "intro" : !graphPipOpen ? "minimized" : graphPipExpanded ? "expanded" : "default"}
          >
            <div className={styles.graphPipHeader}>
              <div className={styles.graphPipTitle}><span className="mono">02-B</span><strong>区域情报节点图</strong></div>
              <div className={styles.graphPipControls}>
                <span className={styles.graphPipProgress} aria-live="polite">{batch?.qualityPassed || data.regions.filter((region) => region.status === "quality_passed").length} / {batch?.total || data.regions.length}</span>
                {graphPipOpen ? <button type="button" onClick={() => { setGraphPipIntro(false); setGraphPipExpanded((value) => !value); }} aria-label={graphPipExpanded ? "缩小区域情报节点图" : "放大区域情报节点图"} title={graphPipExpanded ? "缩小" : "放大"}>{graphPipExpanded ? <ArrowsInSimple size={15} /> : <ArrowsOutSimple size={15} />}</button> : null}
                <button type="button" onClick={() => { setGraphPipIntro(false); setGraphPipOpen((value) => !value); if (graphPipOpen) setGraphPipExpanded(false); }} aria-expanded={graphPipOpen} aria-label={graphPipOpen ? "收起区域情报节点图" : "展开区域情报节点图"} title={graphPipOpen ? "收起" : "展开"}>{graphPipOpen ? <CaretDown size={15} /> : <CaretUp size={15} />}</button>
              </div>
            </div>
            <div className={styles.graphPipContent} aria-hidden={!graphPipOpen}>
              <RegionIntelligenceViewport regions={data.regions} citations={data.citations} batch={batch} compact={!graphPipExpanded} pictureInPicture expanded={graphPipExpanded} fullscreen={graphPipIntro} activeRegionId={activeId} onSelectRegion={(regionId) => setActiveId(regionId)} onSelectEvidence={revealEvidence} />
              {batch?.status === "processing" && batchUsesCache ? <span className="mono">已复用历史检索结果 · 页面验证中{batch.demoCacheReplay && batch.etaSeconds ? ` · ${batch.etaSeconds}s` : ""}</span> : null}
              {batch?.status === "processing" && !batchUsesCache ? <span className="mono">联网检索与页面验证中</span> : null}
              {batch?.status === "failed" || (batch?.status === "completed" && !compare) ? <div className={styles.graphPipActions}>
                {batch?.status === "failed" ? <button className="button button-cyan button-small" onClick={() => void retryBatch()} disabled={Boolean(busy)}><MagnifyingGlass size={14} /> 重试 {batch.failed} 个区域</button> : null}
                {batch?.status === "completed" && !batch.demoCacheReplay && batch.executionMode !== "embedded_fixture" ? <button className="button button-cyan button-small" onClick={() => void replayDemoCache()} disabled={Boolean(busy)}><MagnifyingGlass size={14} /> 25秒缓存演示</button> : null}
                {batch?.status === "completed" && !compare ? <button className="button button-small" onClick={() => { setCompare(true); setComparisonView("matrix"); router.replace(`/regions?view=matrix&batch=${batch.id}#region-matrix`, { scroll: false }); document.getElementById("region-matrix")?.scrollIntoView({ behavior: "smooth" }); }}>查看差异矩阵</button> : null}
              </div> : null}
            </div>
          </aside>, document.body) : null}

          {active ? (
            <section className="section">
              <div className="section-heading">
                <div><h2 className="section-title"><span className="section-index">区域深读</span>{active.name} · 发行判断</h2><p className="section-note">{active.language || "语言待补充"} · {active.timezone || "时区待补充"}{active.note ? ` · ${active.note}` : ""}</p></div>
                <div className="page-actions"><StatusBadge status={active.status} /></div>
              </div>
              {activeBatchItem?.phase === "evidence_gap" ? <div className="notice notice-cyan"><Info size={19} /><div className="notice-content"><strong>{activeUsesCache ? "历史研究结果已载入" : "研究完成，证据待补充"}</strong><span>已保留 {sources.length} 条通过验证的来源；未覆盖项显示为待补充，不作为系统错误展示。</span>{activeBatchItem.diagnostics?.length ? <details><summary>查看来源与验证详情</summary>{activeBatchItem.diagnostics.slice(0, 40).map((item, index) => <p key={`${item.url}:${index}`}><span className="mono">{item.provider || "verifier"} · R{item.round || "-"} · {item.dimension} · {item.status}</span> · {item.reason} · {/^(?:https?):\/\//i.test(item.url) ? <a href={item.url} target="_blank" rel="noreferrer">{item.url}</a> : <span className="mono">{item.url}</span>}</p>)}</details> : null}</div></div> : null}
              {activeBatchItem?.phase === "failed" ? <div className="notice notice-red"><Warning size={19} /><div className="notice-content"><strong>研究服务暂时不可用</strong><span>{activeBatchItem.error || "请稍后重新尝试。"}</span></div></div> : null}
              <div className={styles.analysisLayout}>
                <aside className={styles.regionRail}>
                  <div className={styles.railLabel}>发行区域</div>
                  {selected.map((region, index) => <button key={region.id} className={`${styles.regionRow} ${active.id === region.id ? styles.regionRowActive : ""}`} onClick={() => setActiveId(region.id)}><span className="mono">{String(index + 1).padStart(2, "0")}</span><span>{region.name}</span><StatusBadge status={region.status} /></button>)}
                </aside>
                <div className={styles.analysisDocument}>
                  {analysis ? <>
                    <div className={styles.analysisIntro}><div className={styles.introHeading}><span>区域核心差异</span><small>5 句结构化判断</small></div>{analysis.differentiation?.provisional ? <small>临时综合 · 等待区域：{analysis.differentiation.missingRegionIds.join(" · ")}</small> : null}<p>{analysis.differentiation?.paragraph || analysis.differentiators.join(" ")}</p></div>
                    {analysis.differentiation ? <><div className={styles.differentiationList}>{analysis.differentiation.sentences.map((sentence, index) => <article className={styles.differentiationItem} key={sentence.topicKey}><span className={styles.sentenceNumber}>{String(index + 1).padStart(2, "0")}</span><div className={styles.sentenceRole}><strong>{differentiationRoleLabels[sentence.role]}</strong><small>{sentence.topicKey}</small></div><div className={styles.sentenceBody}><p>{sentence.text}</p><div className={styles.snapshotList}><span>依据</span>{sentence.citationSnapshotIds.map((id) => <span className="mono" key={id}>{sources.find((source) => source.id === id)?.displayId || id}</span>)}</div></div></article>)}</div><div className={styles.qualitySummary}><div><span>已排除的共性主题</span><p>{analysis.differentiation.excludedCommonThemes.join(" · ") || "无"}</p></div><dl><div><dt>区域独特性</dt><dd>{Math.round(analysis.differentiation.quality.uniquenessScore * 100)}%</dd></div><div><dt>证据覆盖</dt><dd>{Math.round(analysis.differentiation.quality.evidenceCoverage * 100)}%</dd></div><div><dt>规则问题</dt><dd>{analysis.differentiation.quality.violations.length}</dd></div></dl></div></> : null}
                    {dimensions.map((dimension, sectionIndex) => <div className={styles.dimension} key={dimension.key}><div className={styles.dimensionHeader}><span className="mono">{String(sectionIndex + 1).padStart(2, "0")} / {dimension.code}</span><h3>{dimension.label}</h3></div><div className={styles.claims}>{analysis[dimension.key].map((claim, claimIndex) => <ClaimCard key={`${dimension.key}-${claimIndex}`} claim={claim} sources={sources} />)}</div></div>)}
                    <div className={styles.riskBlock}><span className="mono">发行风险边界</span>{analysis.risks.map((risk) => <p key={risk}>{risk}</p>)}</div>
                    <div className={styles.approvalBar}><div><Info size={18} /><span>区域报告不可人工编辑或批准；确定性与 AI 质量门全部通过后才可进入最终方案。</span></div>{active.status === "quality_passed" ? <span className={styles.approvedText}><Check size={17} weight="bold" /> 自动质量通过</span> : <StatusBadge status={active.status} />}</div>
                  </> : <div className="empty-state"><GlobeHemisphereEast size={28} color="#27b7ca" /><h3>{activeBatchItem?.phase === "evidence_gap" ? `${active.name} 已载入 ${sources.length} 条来源` : `尚未形成 ${active.name} 判断`}</h3><p>{activeBatchItem?.phase === "evidence_gap" ? "现有验证来源已保留，区域判断将在待补充项满足后自动形成。" : "系统将围绕四类问题发起搜索，并把公开来源固定到每条判断旁边。联网研究不会影响其他区域。"}</p></div>}
                </div>
                <aside className={styles.sourceRail}>
                  <div className={styles.sourceHeader}><span>证据来源</span><strong>{sources.length}<small> 条</small></strong></div>
                  <div className={styles.sourceList}>{sources.map((source) => {
                    const focused = evidenceFocus?.id === source.id;
                    const verificationLabel = source.verificationStatus === "verified" || source.verificationStatus === "manual" ? "已验证" : source.verificationStatus === "discovered" ? "待页面验证" : "验证未通过";
                    return <a id={`evidence-${source.id}`} data-evidence-id={source.id} data-evidence-flash={focused ? "true" : "false"} aria-current={focused ? "true" : undefined} key={`${source.regionId}:${source.id}:${focused ? evidenceFocus.sequence : 0}`} href={source.url} target="_blank" rel="noreferrer" className={`${styles.sourceCard} ${focused ? styles.sourceCardFlash : ""}`}><div><span className="mono">{source.displayId || source.id}</span><ArrowSquareOut size={13} /></div><strong>{source.title}</strong><p>{source.snippet}</p><small>{verificationLabel} · {source.publisher || "公开来源"}{source.verifiedPublishedAt ? ` · ${source.verifiedPublishedAt}` : " · 日期待确认"} · {source.localEvidence ? "本地资料" : "全球背景"}</small>{source.rejectionReason ? <em>{source.rejectionReason}</em> : null}</a>;
                  })}</div>
                </aside>
              </div>
            </section>
          ) : <div className="empty-state"><GlobeHemisphereEast size={28} /><h3>选择至少一个发行区域</h3><p>区域选择会决定研究范围与最终方案结构。</p></div>}

          {selected.some((region) => Boolean(region.analysis?.differentiation)) ? <Comparison
            regions={selected}
            highlightedRegionId={activeId}
            view={comparisonView}
            onViewChange={(nextView) => {
              setComparisonView(nextView);
              setCompare(true);
              router.replace(`/regions?view=${nextView}${batchId ? `&batch=${batchId}` : ""}#region-matrix`, { scroll: false });
            }}
          /> : null}

          {selected.length > 0 && approvedCount === selected.length && batch?.synthesisStatus === "completed" ? <div className={styles.nextStep}><div><span className="mono">REGIONAL QUALITY COMPLETE</span><strong>所有区域已通过自动质量门</strong><p>人工只在下一步通过最终方案聊天代理提出文档修改。</p></div><Link className="button button-cyan" href="/plan">进入最终方案聊天</Link></div> : null}
        </>
      )}
    </div>
  );
}

function ClaimCard({ claim, sources }: { claim: ResearchClaim; sources: Array<{ id: string; title: string; displayId?: string }> }) {
  return <div className={styles.claim}><p>{claim.text}</p><div className={styles.claimMeta}><span className={`${styles.confidence} ${styles[`confidence_${claim.confidence}`]}`}>{confidenceLabels[claim.confidence]}</span><span>{claim.claimScope === "regional" ? "区域证据" : "全球背景"}</span>{claim.citationIds.map((id) => <span key={id} className="mono" title={sources.find((source) => source.id === id)?.title || "来源编号"}>{sources.find((source) => source.id === id)?.displayId || id}</span>)}</div></div>;
}

function Comparison({ regions, highlightedRegionId, view, onViewChange }: { regions: RegionConfig[]; highlightedRegionId: string; view: "matrix" | "columns"; onViewChange: (view: "matrix" | "columns") => void }) {
  const dimensionsForTable = [
    { key: "playerSignals" as const, label: "玩家信号" },
    { key: "marketEnvironment" as const, label: "市场环境" },
    { key: "sentimentAndCompetition" as const, label: "舆情与竞品" },
    { key: "culturalMoments" as const, label: "文化节点" },
  ];
  const columns = { gridTemplateColumns: `150px repeat(${Math.max(1, regions.length)}, minmax(220px, 1fr))` };
  return <section id="region-matrix" tabIndex={-1} className="section">
    <div className="section-heading">
      <div><h2 className="section-title"><span className="section-index">02-C</span>跨区域差异矩阵</h2><p className="section-note">区域分析完成后自动显示。可按判断维度横向比较，或切换为逐区域分栏阅读。</p></div>
      <div className={styles.comparisonToggle} role="group" aria-label="跨区域差异展示方式">
        <button type="button" className={view === "matrix" ? styles.comparisonToggleActive : ""} aria-pressed={view === "matrix"} onClick={() => onViewChange("matrix")}><span className="mono">▦</span> 矩阵表</button>
        <button type="button" className={view === "columns" ? styles.comparisonToggleActive : ""} aria-pressed={view === "columns"} onClick={() => onViewChange("columns")}><span className="mono">▥</span> 区域分栏</button>
      </div>
    </div>
    {view === "matrix" ? <div className={styles.compareTable}><div className={styles.compareHeader} style={columns}><span>判断维度</span>{regions.map((region) => <strong className={region.id === highlightedRegionId ? styles.compareHighlight : ""} key={region.id}>{region.name}</strong>)}</div>{dimensionsForTable.map((dimension) => <div className={styles.compareRow} style={columns} key={dimension.key}><strong>{dimension.label}</strong>{regions.map((region) => <div className={region.id === highlightedRegionId ? styles.compareHighlight : ""} key={region.id}>{region.analysis?.[dimension.key]?.length ? region.analysis[dimension.key].slice(0, 2).map((claim, index) => <p key={index}>{claim.text}</p>) : <span className={styles.noData}>尚未研究</span>}</div>)}</div>)}<div className={styles.compareRow} style={columns}><strong>区域差异</strong>{regions.map((region) => <div className={region.id === highlightedRegionId ? styles.compareHighlight : ""} key={region.id}>{region.analysis?.differentiation?.paragraph ? <><p>{region.analysis.differentiation.paragraph}</p>{region.analysis.differentiation.provisional ? <small className="mono">临时综合</small> : null}</> : <span className={styles.noData}>尚未综合</span>}</div>)}</div></div> : <div className={styles.compareColumns}>{regions.map((region, index) => <article className={`${styles.compareColumn} ${region.id === highlightedRegionId ? styles.compareColumnActive : ""}`} key={region.id}><header><span className="mono">{String(index + 1).padStart(2, "0")} / {region.code.toUpperCase()}</span><h3>{region.name}</h3></header>{region.analysis?.differentiation ? <><p className={styles.compareColumnLead}>{region.analysis.differentiation.paragraph}</p><ol>{region.analysis.differentiation.sentences.map((sentence) => <li key={sentence.topicKey}><span>{differentiationRoleLabels[sentence.role]}</span><p>{sentence.text}</p></li>)}</ol></> : <span className={styles.noData}>尚未综合</span>}</article>)}</div>}
  </section>;
}
