"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowCounterClockwise, ArrowSquareOut, ArrowsInSimple, ArrowsOutSimple, CaretDown, CaretUp, Check, Database, DownloadSimple, Funnel, Info, MagnifyingGlass, PaperPlaneRight, Robot, Sparkle, UserCircle, Warning } from "@phosphor-icons/react";
import type { CharacterReleasePlan, GenerationJob, PlanAgentRunRecord, PlanAgentStreamEvent, PlanGenerationPreview, RegionConfig, RegionReleasePlan, RegionalCharacterSymbiosisPlan, ReleasePlan, ResearchCitation } from "@/lib/contracts";
import { useWorkspace } from "@/components/workspace-provider";
import { StatusBadge } from "@/components/workspace-shell";
import { SafeMarkdown } from "@/components/safe-markdown";
import styles from "./plan.module.css";

function toLines(value: string) { return value.split("\n").map((item) => item.trim()).filter(Boolean); }

function requiresFreshGeneration(message: string) {
  return /版本或区域内容已经变化|区域集合已经变化|不能继续旧草稿|请重新生成|生成期间.*发生变化/.test(message);
}

export default function PlanPage() {
  const { data, refresh, request } = useWorkspace();
  const [plan, setPlan] = useState<ReleasePlan | null>(null);
  const [activeRegionId, setActiveRegionId] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [autoSaveState, setAutoSaveState] = useState("已同步");
  const [generationJobId, setGenerationJobId] = useState("");
  const [generationJob, setGenerationJob] = useState<GenerationJob | null>(null);
  const [generationPreview, setGenerationPreview] = useState<PlanGenerationPreview | null>(null);
  const [generationPollVersion, setGenerationPollVersion] = useState(0);
  const [agentHistory, setAgentHistory] = useState<PlanAgentRunRecord[]>([]);
  const [agentHighlight, setAgentHighlight] = useState("");
  const [documentFocus, setDocumentFocus] = useState<"global" | "region">("region");
  const globalAxisRef = useRef<HTMLElement>(null);
  const regionalPlanRef = useRef<HTMLDivElement>(null);
  const highlightTimerRef = useRef(0);
  const selectedRegions = useMemo(() => data?.regions.filter((region) => region.selected) || [], [data]);
  const ready = selectedRegions.length > 0 && selectedRegions.every((region) => region.status === "quality_passed" && region.analysis && !region.analysis.differentiation?.provisional);
  const restartRequired = generationJob?.status === "failed"
    && (requiresFreshGeneration(generationJob.error) || requiresFreshGeneration(error));

  useEffect(() => { if (data) { setPlan(data.project.plan); setDirty(false); setAutoSaveState("已同步"); } }, [data]);
  useEffect(() => {
    if (!data || generationJobId) return;
    const planJobs = [...data.jobs]
      .filter((job) => job.type === "plan")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const resumable = planJobs.find((job) => job.status === "queued" || job.status === "processing")
      || (data.project.planStatus === "failed" ? planJobs.find((job) => job.status === "failed") : undefined);
    if (resumable) setGenerationJobId(resumable.id);
  }, [data, generationJobId]);
  useEffect(() => {
    if (!generationJobId) return;
    let cancelled = false;
    let timer = 0;
    const poll = async () => {
      try {
        const payload = await request<{ job: GenerationJob; preview: PlanGenerationPreview }>(`/api/jobs/${generationJobId}`);
        if (cancelled) return;
        setGenerationJob(payload.job);
        setGenerationPreview(payload.preview);
        if (payload.job.status === "queued" || payload.job.status === "processing") {
          setBusy("generate");
          timer = window.setTimeout(() => void poll(), 1000);
          return;
        }
        setBusy("");
        if (payload.job.status === "completed") {
          setMessage("全球发行方案已生成，实时草稿已转为可编辑文档。");
          await refresh();
        } else {
          setError(payload.job.error || "发行方案生成失败，已完成的实时草稿仍然保留。");
        }
      } catch (nextError) {
        if (cancelled) return;
        setBusy("");
        setError((nextError as Error).message);
      }
    };
    void poll();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [generationJobId, generationPollVersion, refresh, request]);
  useEffect(() => { if (!activeRegionId && plan?.regions[0]) setActiveRegionId(plan.regions[0].regionId); }, [activeRegionId, plan]);
  useEffect(() => {
    if (!plan) return;
    let cancelled = false;
    void request<{ records: PlanAgentRunRecord[] }>("/api/plan/agent?limit=20")
      .then((payload) => { if (!cancelled) setAgentHistory(payload.records); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [plan, request]);
  useEffect(() => {
    if (!dirty || !plan || busy) return;
    setAutoSaveState("等待自动保存");
    const timer = window.setTimeout(async () => {
      try {
        setAutoSaveState("自动保存中");
        await request("/api/plan", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(plan) });
        setDirty(false);
        setAutoSaveState(`已自动保存 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`);
      } catch (nextError) {
        setAutoSaveState("自动保存失败");
        setError((nextError as Error).message);
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [busy, dirty, plan, request]);
  useEffect(() => () => window.clearTimeout(highlightTimerRef.current), []);
  const activeIndex = plan?.regions.findIndex((region) => region.regionId === activeRegionId) ?? -1;
  const activeRegion = activeIndex >= 0 ? plan?.regions[activeIndex] : plan?.regions[0];

  if (!data) return null;

  async function action(name: string, run: () => Promise<unknown>, success: string) {
    setBusy(name); setError(""); setMessage("");
    try { await run(); await refresh(); setMessage(success); }
    catch (nextError) { setError((nextError as Error).message); }
    finally { setBusy(""); }
  }

  async function startGeneration() {
    setBusy("generate");
    setError("");
    setMessage("");
    try {
      const resumeJobId = generationJob?.status === "failed" && generationPreview && !restartRequired ? generationJob.id : "";
      const payload = await request<{ jobId: string; job: GenerationJob; preview: PlanGenerationPreview }>("/api/plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resumeJobId ? { resumeJobId } : {}),
      });
      setGenerationJobId(payload.jobId);
      setGenerationJob(payload.job);
      setGenerationPreview(payload.preview);
      setGenerationPollVersion((value) => value + 1);
    } catch (nextError) {
      const nextMessage = (nextError as Error).message;
      setBusy("");
      setError(nextMessage);
      if (requiresFreshGeneration(nextMessage)) {
        setGenerationJob((current) => current ? { ...current, status: "failed", error: nextMessage } : current);
      }
    }
  }

  function setPlanDraft(next: ReleasePlan) {
    setPlan(next);
    setDirty(true);
  }

  function updateRegion(next: RegionReleasePlan) {
    if (!plan) return;
    setPlanDraft({ ...plan, regions: plan.regions.map((region) => region.regionId === next.regionId ? next : region) });
  }

  function scrollTo(element: HTMLElement | null) {
    element?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }

  function selectRegion(regionId: string) {
    setActiveRegionId(regionId);
    setDocumentFocus("region");
    window.requestAnimationFrame(() => scrollTo(regionalPlanRef.current));
  }

  function applyAgentPlan(next: ReleasePlan, highlightKey: string) {
    setPlan(next);
    setDirty(false);
    setAutoSaveState(`AI 已保存 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`);
    setAgentHighlight(highlightKey);
    window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => setAgentHighlight(""), 1_250);
    const parts = highlightKey.split(":");
    if (parts[0] === "global") { setDocumentFocus("global"); scrollTo(globalAxisRef.current); }
    if (parts[0] === "region" || parts[0] === "character") {
      setActiveRegionId(parts[1]);
      setDocumentFocus("region");
      window.requestAnimationFrame(() => scrollTo(regionalPlanRef.current));
    }
  }

  return (
    <div className={`page-enter ${styles.planPage}`}>
      <header className="page-header">
        <div>
          <p className="page-kicker">GLOBAL RELEASE / ORCHESTRATION</p>
          <h1 className="page-title">一个全球主轴，<br />多种当地表达。</h1>
          <p className="page-description">把已审核的区域判断转化为素材、社媒、KOL、买量与联动计划，并让角色关系成为长期触达的一部分。</p>
        </div>
        <div className={styles.planMeta}>
          <div><span className="mono">CAMPAIGN WINDOW</span><strong>T{data.project.campaignStartWeek} → T+{data.project.campaignEndWeek}</strong></div>
          <div><span className="mono">REGIONS</span><strong>{selectedRegions.length}</strong></div>
          <StatusBadge status={data.project.planStatus} />
        </div>
      </header>

      {!ready ? <div className={styles.gate}><div className={styles.gateMark}>03</div><div><p className="page-kicker">GATED BY REGIONAL QUALITY</p><h2>等待所有区域自动质量通过</h2><p>当前质量通过 {selectedRegions.filter((item) => item.status === "quality_passed").length} / {selectedRegions.length} 个区域。临时综合与证据缺口不能进入最终方案。</p><Link className="button button-primary" href="/regions">返回区域判断</Link></div></div> : <>
        {!data.glm.configured ? <div className="notice notice-amber"><Warning size={19} /><div className="notice-content"><strong>需要配置 GLM 才能生成方案</strong><span>已有方案仍可编辑与导出。</span></div></div> : null}
        {error ? <div className="notice notice-red"><Warning size={19} /><div className="notice-content"><strong>{restartRequired ? "需要重新生成" : "方案未完成"}</strong><span>{error}</span></div></div> : null}
        {!error && data.project.planStatus === "failed" && !generationJobId ? <div className="notice notice-red"><Warning size={19} /><div className="notice-content"><strong>上一次生成已经失败</strong><span>旧版同步请求没有留下可恢复的进度。现在重新生成会建立持久化任务，并实时保存每个完成章节。</span></div></div> : null}
        {message ? <div className="notice notice-cyan"><Check size={19} /><div className="notice-content"><strong>{message}</strong><span>手工修改已保留在当前工作区。</span></div></div> : null}

        <section className="section">
          <div className="section-heading">
            <div><h2 className="section-title"><span className="section-index">03-A</span>全球发行方案</h2><p className="section-note">完整生成会重建全球主轴和全部区域；区域重生成只返回候选项，确认后才替换。<span className={styles.autoSave}> · {autoSaveState}</span></p></div>
            <div className="page-actions">{plan ? <><a className="button" href="/api/plan/export"><DownloadSimple size={16} /> 导出 Markdown</a><Link className="button button-primary" href="/export">进入策略导出</Link></> : <button className="button button-primary" disabled={Boolean(busy) || !data.glm.configured} onClick={() => void startGeneration()}>{busy === "generate" ? `${generationJob?.progress ?? 0}% 生成中` : <><Sparkle size={16} weight="fill" /> {restartRequired ? "重新生成" : data.project.planStatus === "failed" && generationPreview?.completedSections ? `继续生成 ${generationPreview.completedSections}/${generationPreview.totalSections}` : data.project.planStatus === "failed" ? "重新生成" : "生成发行方案"}</>}</button>}</div>
          </div>

          {generationPreview && generationJob && generationJob.status !== "completed" ? <LivePlanPreview job={generationJob} preview={generationPreview} /> : null}

          {plan ? <>
            <fieldset className={styles.editorFieldset} disabled={busy === "agent"}>
              <section ref={globalAxisRef} id="global-axis" className={`${styles.globalAxis} ${documentFocus === "global" ? styles.sectionFocused : ""}`}>
                <div className={styles.docEyebrow}><span className="mono">00 / GLOBAL AXIS</span><span>{new Date(plan.generatedAt).toLocaleString("zh-CN")}</span></div>
                <AutoTextarea ariaLabel="全球主轴" className={`${styles.globalAxisText} ${agentHighlight === "global:globalAxis" ? styles.agentFieldFlash : ""}`} value={plan.globalAxis} onChange={(value) => setPlanDraft({ ...plan, globalAxis: value })} />
                <div className={styles.globalGrid}>
                  <ListEditor title="全球原则" items={plan.globalPrinciples} onChange={(items) => setPlanDraft({ ...plan, globalPrinciples: items })} autoGrow highlight={agentHighlight === "global:globalPrinciples"} />
                  <ListEditor title="共同行动节点" items={plan.commonMoments} onChange={(items) => setPlanDraft({ ...plan, commonMoments: items })} autoGrow highlight={agentHighlight === "global:commonMoments"} />
                  <ListEditor title="全球 KPI" items={plan.globalKpis} onChange={(items) => setPlanDraft({ ...plan, globalKpis: items })} autoGrow highlight={agentHighlight === "global:globalKpis"} />
                </div>
              </section>
            </fieldset>

            <div ref={regionalPlanRef} id="regional-plan" className={styles.planWorkspace}>
              <nav className={styles.contentsRail} aria-label="发行方案文档目录">
                <span className={styles.railLabel}>DOCUMENT MAP</span>
                <button className={documentFocus === "global" ? styles.contentsActive : ""} onClick={() => { setDocumentFocus("global"); scrollTo(globalAxisRef.current); }}><span className="mono">00</span>全球主轴</button>
                {plan.regions.map((region, index) => <button key={region.regionId} className={documentFocus === "region" && activeRegion?.regionId === region.regionId ? styles.contentsActive : ""} onClick={() => selectRegion(region.regionId)}><span className="mono">{String(index + 1).padStart(2, "0")}</span>{region.regionName}</button>)}
                <div className={styles.documentStats}><span>全部来源</span><strong>{data.citations.length}</strong><span>方案引用</span><strong>{plan.sourceIds.length}</strong><span>角色共生区域</span><strong>{plan.characterSymbiosisRelease.length}</strong></div>
              </nav>

              <article className={`${styles.document} ${documentFocus === "region" ? styles.sectionFocused : ""}`}>
                <fieldset className={styles.editorFieldset} disabled={busy === "agent"}>
                  {activeRegion ? <RegionPlanEditor region={activeRegion} onChange={updateRegion} highlightKey={agentHighlight} /> : null}
                  {activeRegion ? <CharacterSymbiosisView item={plan.characterSymbiosisRelease.find((entry) => entry.regionId === activeRegion.regionId)} /> : null}
                </fieldset>
                <div className={styles.approvalBar}><div><Info size={18} /><span>最终审核只确认当前文档版本，不会触发任何发布、投放或外部联络。</span></div>{data.project.planStatus === "approved" ? <span className={styles.approvedText}><Check size={17} weight="bold" /> 方案已审核</span> : <button className="button button-cyan" onClick={() => void action("approve", () => request("/api/plan/approve", { method: "POST" }), "发行方案已完成最终审核")} disabled={Boolean(busy)}>确认最终方案</button>}</div>
              </article>

              <SourceIntelligenceRail citations={data.citations} regions={data.regions} plan={plan} activeRegionId={activeRegion?.regionId || ""} history={agentHistory} />
            </div>

            <PlanAgentConsole
              plan={plan}
              activeRegionId={activeRegion?.regionId || ""}
              configured={data.glm.configured}
              disabled={Boolean(busy) && busy !== "agent"}
              running={busy === "agent"}
              history={agentHistory}
              onRunningChange={(running) => setBusy(running ? "agent" : "")}
              onPatch={applyAgentPlan}
              onHistoryChange={setAgentHistory}
              onUndo={(nextPlan, record) => { setPlan(nextPlan); setDirty(false); setAgentHistory((items) => items.map((item) => item.runId === record.runId ? record : item)); setMessage("最近一次 AI 文档修改已撤销"); }}
              onRefresh={() => void refresh()}
            />
          </> : generationPreview ? null : <div className="empty-state"><Sparkle size={28} color="#27b7ca" /><h3>等待编排全球与区域动作</h3><p>系统会先确定统一主轴，再分别输出素材、社媒、KOL、买量、联动、周级节奏与角色关系发行。</p></div>}
        </section>
      </>}
    </div>
  );
}

const PLAN_PHASE_LABELS: Record<string, string> = {
  queued: "准备输入快照",
  global_axis: "生成全球主轴",
  regional_plans: "并行生成区域方案",
  assembling: "校验并汇总文档",
  completed: "生成完成",
  failed: "生成中断",
};

function LivePlanPreview({ job, preview }: { job: GenerationJob; preview: PlanGenerationPreview }) {
  const finished = new Set(preview.regions.map((region) => region.regionId));
  const activeNames = preview.regionOrder.filter((region) => preview.activeRegionIds.includes(region.id)).map((region) => region.name);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [selectedSection, setSelectedSection] = useState("global");
  useEffect(() => {
    const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - new Date(preview.startedAt).getTime()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [preview.startedAt]);
  const etaSeconds = Math.max(0, 30 - elapsedSeconds);
  const selectedRegion = preview.regions.find((region) => region.regionId === selectedSection);
  const selectedRegionIndex = selectedRegion ? preview.regionOrder.findIndex((region) => region.id === selectedRegion.regionId) : -1;
  return <section className={styles.livePreview} aria-live="polite" aria-busy={job.status === "queued" || job.status === "processing"}>
    <header className={styles.liveHeader}>
      <div>
        <span className="mono">LIVE DOCUMENT / {job.id.slice(0, 8).toUpperCase()}</span>
        <h3>发行方案实时草稿</h3>
        <p>{PLAN_PHASE_LABELS[preview.phase] || preview.phase}{activeNames.length ? ` · 正在处理 ${activeNames.join("、")}` : ""} · {etaSeconds > 0 ? `预计约 ${etaSeconds} 秒` : "正在完成结构校验"}</p>
      </div>
      <div className={styles.liveMetric}><strong>{job.progress}%</strong><span>{preview.completedSections} / {preview.totalSections} 章节</span></div>
    </header>
    <div className={styles.progressTrack} aria-label={`生成进度 ${job.progress}%`}><span style={{ width: `${job.progress}%` }} /></div>
    <div className={styles.liveBody}>
      <aside className={styles.liveOutline}>
        <span className={styles.railLabel}>BUILD QUEUE</span>
        <button type="button" disabled={!preview.global} aria-current={selectedSection === "global" ? "page" : undefined} onClick={() => setSelectedSection("global")} className={`${preview.global ? styles.outlineDone : preview.phase === "global_axis" ? styles.outlineActive : ""} ${selectedSection === "global" ? styles.outlineSelected : ""}`}><span>00</span><strong>全球主轴</strong><small>{preview.global ? "已写入" : preview.phase === "global_axis" ? "生成中" : "等待"}</small></button>
        {preview.regionOrder.map((region, index) => <button type="button" disabled={!finished.has(region.id)} aria-current={selectedSection === region.id ? "page" : undefined} onClick={() => setSelectedSection(region.id)} key={region.id} className={`${finished.has(region.id) ? styles.outlineDone : preview.activeRegionIds.includes(region.id) ? styles.outlineActive : ""} ${selectedSection === region.id ? styles.outlineSelected : ""}`}><span>{String(index + 1).padStart(2, "0")}</span><strong>{region.name}</strong><small>{finished.has(region.id) ? "已写入" : preview.activeRegionIds.includes(region.id) ? "生成中" : "等待"}</small></button>)}
      </aside>
      <article className={styles.liveDocument}>
        {selectedSection === "global" && preview.global ? <section className={styles.previewGlobal}>
          <span className="mono">00 / GLOBAL AXIS</span>
          <h4>{preview.global.globalAxis}</h4>
          <div className={styles.previewColumns}><PreviewList title="全球原则" items={preview.global.globalPrinciples} /><PreviewList title="共同行动节点" items={preview.global.commonMoments} /><PreviewList title="全球 KPI" items={preview.global.globalKpis} /></div>
        </section> : selectedRegion ? <section className={styles.previewRegion}>
          <div><span className="mono">{String(selectedRegionIndex + 1).padStart(2, "0")} / REGIONAL PLAN</span><h4>{selectedRegion.regionName}</h4></div>
          <p>{selectedRegion.coreJudgment}</p>
          <div className={styles.previewColumns}><PreviewList title="素材策略" items={selectedRegion.materialStrategy} /><PreviewList title="社媒与 KOL" items={[...selectedRegion.socialCadence, ...selectedRegion.kolPlan]} /><PreviewList title="买量与联动" items={[...selectedRegion.paidMedia, ...selectedRegion.partnerships]} /></div>
          <div className={styles.previewRegionFoot}><span>{selectedRegion.timeline.length} 个周级节点</span><span>{selectedRegion.characterRelease.length} 个角色关系方案</span><span>{selectedRegion.kpis.length} 个 KPI</span></div>
        </section> : <section className={styles.previewWaiting}><Sparkle size={24} /><span className="mono">COMPOSING 00 / GLOBAL AXIS</span><h4>正在建立全球统一主轴</h4><p>主轴完成后会立即出现在这里；区域章节随后逐一写入，不需要停留在本页。</p></section>}
      </article>
    </div>
    <footer className={styles.liveFooter}><span>草稿已持久化，刷新页面或重启应用后会从已完成章节继续。</span><span className="mono">UPDATED {new Date(preview.updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span></footer>
  </section>;
}

function PreviewList({ title, items }: { title: string; items: string[] }) {
  return <div><strong>{title}</strong>{items.length ? <ul>{items.slice(0, 5).map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}</ul> : <span>等待内容</span>}</div>;
}

function AutoTextarea({ value, onChange, className = "", ariaLabel }: { value: string; onChange: (value: string) => void; className?: string; ariaLabel: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);
  return <textarea readOnly ref={ref} rows={1} className={className} aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)} />;
}

function ListEditor({ title, items, onChange, autoGrow = false, highlight = false }: { title: string; items: string[]; onChange: (items: string[]) => void; autoGrow?: boolean; highlight?: boolean }) {
  const value = items.join("\n");
  return <div className={`${styles.listEditor} ${highlight ? styles.agentFieldFlash : ""}`}><h3>{title}</h3>{autoGrow ? <AutoTextarea ariaLabel={title} value={value} onChange={(next) => onChange(toLines(next))} /> : <textarea readOnly aria-label={title} value={value} onChange={(e) => onChange(toLines(e.target.value))} />}</div>;
}

function RegionPlanEditor({ region, onChange, highlightKey }: { region: RegionReleasePlan; onChange: (region: RegionReleasePlan) => void; highlightKey: string }) {
  const set = <K extends keyof RegionReleasePlan>(key: K, value: RegionReleasePlan[K]) => onChange({ ...region, [key]: value });
  return <section className={styles.regionSection}>
    <div className={styles.regionHeading}><div><span className="mono">REGIONAL PLAN / {region.regionName.toUpperCase()}</span><h2>{region.regionName}</h2></div><span className="mono">READ ONLY · CHANGE VIA AGENT CHAT</span></div>
    <div className={`${styles.coreJudgment} ${highlightKey === `region:${region.regionId}:coreJudgment` ? styles.agentFieldFlash : ""}`}><span className="mono">CORE JUDGMENT</span><textarea readOnly value={region.coreJudgment} onChange={(e) => set("coreJudgment", e.target.value)} /></div>
    <div className={styles.strategyGrid}><ListEditor title="素材策略" items={region.materialStrategy} onChange={(items) => set("materialStrategy", items)} highlight={highlightKey === `region:${region.regionId}:materialStrategy`} /><ListEditor title="社媒节奏" items={region.socialCadence} onChange={(items) => set("socialCadence", items)} highlight={highlightKey === `region:${region.regionId}:socialCadence`} /><ListEditor title="KOL 合作" items={region.kolPlan} onChange={(items) => set("kolPlan", items)} highlight={highlightKey === `region:${region.regionId}:kolPlan`} /><ListEditor title="买量" items={region.paidMedia} onChange={(items) => set("paidMedia", items)} highlight={highlightKey === `region:${region.regionId}:paidMedia`} /><ListEditor title="联动计划" items={region.partnerships} onChange={(items) => set("partnerships", items)} highlight={highlightKey === `region:${region.regionId}:partnerships`} /><ListEditor title="风险提示" items={region.riskNotes} onChange={(items) => set("riskNotes", items)} highlight={highlightKey === `region:${region.regionId}:riskNotes`} /></div>
    <div className={`${styles.timelineBlock} ${highlightKey === `region:${region.regionId}:timeline` ? styles.agentFieldFlash : ""}`}><h3>周级时间表</h3><textarea readOnly value={region.timeline.map((item) => `${item.week} | ${item.focus} | ${item.actions.join("；")}`).join("\n")} onChange={(e) => set("timeline", toLines(e.target.value).map((line) => { const [week = "", focus = "", actions = ""] = line.split("|").map((part) => part.trim()); return { week, focus, actions: actions.split(/[；;]/).map((item) => item.trim()).filter(Boolean) }; }))} /></div>
    <div className={styles.metricGrid}><ListEditor title="区域 KPI" items={region.kpis} onChange={(items) => set("kpis", items)} highlight={highlightKey === `region:${region.regionId}:kpis`} /><ListEditor title="预算配置" items={region.budget} onChange={(items) => set("budget", items)} highlight={highlightKey === `region:${region.regionId}:budget`} /></div>
    <div className={styles.characterSection}><div className={styles.characterHeader}><div><UserCircle size={21} weight="duotone" /><span><strong>AI 角色关系型发行</strong><small>仅生成长期触达方案与人工任务草案</small></span></div><span className={styles.noExecution}>NO EXECUTION CONNECTED</span></div>{region.characterRelease.length ? region.characterRelease.map((character, index) => <CharacterEditor key={`${character.character}-${index}`} regionId={region.regionId} index={index} character={character} highlightKey={highlightKey} onChange={(next) => set("characterRelease", region.characterRelease.map((item, itemIndex) => itemIndex === index ? next : item))} />) : <p className={styles.noCharacter}>当前区域没有可用角色方案。</p>}</div>
  </section>;
}

function CharacterEditor({ character, onChange, regionId, index, highlightKey }: { character: CharacterReleasePlan; onChange: (next: CharacterReleasePlan) => void; regionId: string; index: number; highlightKey: string }) {
  const highlighted = (field: keyof CharacterReleasePlan) => highlightKey === `character:${regionId}:${index}:${field}`;
  return <div className={styles.characterCard}>
    <div className={`${styles.characterIdentity} ${highlighted("character") || highlighted("relationshipStage") ? styles.agentFieldFlash : ""}`}><input readOnly aria-label="角色名称" size={Math.min(28, Math.max(4, Array.from(character.character).length + 1))} value={character.character} onChange={(e) => onChange({ ...character, character: e.target.value })} /><input readOnly aria-label="关系阶段" className={styles.relationshipInput} size={Math.min(24, Math.max(6, Array.from(character.relationshipStage).length + 1))} value={character.relationshipStage} onChange={(e) => onChange({ ...character, relationshipStage: e.target.value })} /></div>
    <div className={styles.characterLead}><label className={highlighted("audienceSegment") ? styles.agentFieldFlash : ""}>玩家分群<input readOnly value={character.audienceSegment} onChange={(e) => onChange({ ...character, audienceSegment: e.target.value })} /></label><label className={highlighted("objective") ? styles.agentFieldFlash : ""}>发行目标<textarea readOnly value={character.objective} onChange={(e) => onChange({ ...character, objective: e.target.value })} /></label></div>
    <div className={styles.characterGrid}><ListEditor title="口吻规则" items={character.voiceRules} onChange={(items) => onChange({ ...character, voiceRules: items })} highlight={highlighted("voiceRules")} /><ListEditor title="长期内容弧" items={character.contentArc} onChange={(items) => onChange({ ...character, contentArc: items })} highlight={highlighted("contentArc")} /><ListEditor title="资产依赖" items={character.assetDependencies} onChange={(items) => onChange({ ...character, assetDependencies: items })} highlight={highlighted("assetDependencies")} /><ListEditor title="示例话题" items={character.sampleTopics} onChange={(items) => onChange({ ...character, sampleTopics: items })} highlight={highlighted("sampleTopics")} /><ListEditor title="禁区" items={character.guardrails} onChange={(items) => onChange({ ...character, guardrails: items })} highlight={highlighted("guardrails")} /></div>
    <div className={`${styles.pipeEditor} ${highlighted("channels") ? styles.agentFieldFlash : ""}`}><label>渠道与频率 <span>每行：渠道 | 频率 | 角色作用</span></label><textarea readOnly value={character.channels.map((item) => `${item.channel} | ${item.frequency} | ${item.role}`).join("\n")} onChange={(e) => onChange({ ...character, channels: toLines(e.target.value).map((line) => { const [channel = "", frequency = "", role = ""] = line.split("|").map((part) => part.trim()); return { channel, frequency, role }; }) })} /></div>
    <div className={`${styles.pipeEditor} ${highlighted("tasks") ? styles.agentFieldFlash : ""}`}><label>任务草案 <span>每行：时间 | 动作 | 资产 | 成功信号</span></label><textarea readOnly value={character.tasks.map((item) => `${item.time} | ${item.action} | ${item.asset} | ${item.successSignal}`).join("\n")} onChange={(e) => onChange({ ...character, tasks: toLines(e.target.value).map((line) => { const [time = "", action = "", asset = "", successSignal = ""] = line.split("|").map((part) => part.trim()); return { time, action, asset, successSignal }; }) })} /></div>
  </div>;
}

function CharacterSymbiosisView({ item }: { item?: RegionalCharacterSymbiosisPlan }) {
  if (!item) return <section className={styles.characterSection}><p className={styles.noCharacter}>当前区域缺少角色共生发行方案，最终审核将被阻断。</p></section>;
  return <section className={styles.characterSection}>
    <div className={styles.characterHeader}><div><UserCircle size={21} weight="duotone" /><span><strong>角色共生发行方案 · {item.regionName}</strong><small>该区域模块会单独传给后续共生发行 Agent</small></span></div><span className={styles.noExecution}>REGION-SCOPED HANDOFF</span></div>
    <div className={styles.characterLead}><label>共生发行目标<textarea readOnly value={item.symbiosisObjective} /></label><label>目标玩家群体<textarea readOnly value={item.targetPlayerGroups.join("\n")} /></label></div>
    <div className={styles.characterGrid}><ListEditor title="角色可传递版本信息" items={item.characterSuitableVersionMessages} onChange={() => undefined} /><ListEditor title="沟通切入点与互动场景" items={item.communicationEntryPointsAndScenes} onChange={() => undefined} /><ListEditor title="触达时机与频率" items={item.recommendedTimingAndFrequency} onChange={() => undefined} /><ListEditor title="语气与文化注意" items={item.toneExpressionAndCulturalNotes} onChange={() => undefined} /><ListEditor title="禁止行为与风险边界" items={item.prohibitedBehaviorsAndRiskBoundaries} onChange={() => undefined} /><ListEditor title="预期效果与指标" items={item.expectedEffectsAndMetrics} onChange={() => undefined} /></div>
    {item.characterTasks.map((task, index) => <div className={styles.characterCard} key={`${task.character}-${index}`}><div className={styles.characterIdentity}><strong>{task.character}</strong><span>{task.playerSegment}</span></div><p>{task.objective}</p><div className={styles.characterGrid}><ListEditor title="版本信息与切口" items={[task.versionMessage, task.communicationAngle]} onChange={() => undefined} /><ListEditor title="场景与节奏" items={[task.interactionScene, `${task.timing}｜${task.frequency}`]} onChange={() => undefined} /><ListEditor title="文化与语气" items={[task.tone, ...task.culturalNotes]} onChange={() => undefined} /><ListEditor title="风险边界" items={[...task.prohibitedBehaviors, ...task.riskBoundaries]} onChange={() => undefined} /></div></div>)}
  </section>;
}

function Quality({ label, ready }: { label: string; ready: boolean }) { return <div className={styles.quality}><span>{label}</span>{ready ? <Check size={14} weight="bold" /> : <Warning size={14} />}</div>; }

const dimensionLabels: Record<ResearchCitation["dimension"], string> = { player: "玩家", market: "市场", sentiment: "舆情", culture: "文化", manual: "补充" };

function SourceIntelligenceRail({ citations, regions, plan, activeRegionId, history }: { citations: ResearchCitation[]; regions: RegionConfig[]; plan: ReleasePlan; activeRegionId: string; history: PlanAgentRunRecord[] }) {
  const [query, setQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");
  const [dimensionFilter, setDimensionFilter] = useState("all");
  const [originFilter, setOriginFilter] = useState("all");
  const agentUsed = useMemo(() => new Set(history.flatMap((record) => record.sourceIds)), [history]);
  const planUsed = useMemo(() => new Set(plan.sourceIds), [plan.sourceIds]);
  const regionNames = useMemo(() => new Map(regions.map((region) => [region.id, region.name])), [regions]);
  const publishers = useMemo(() => new Set(citations.map((source) => source.publisher).filter(Boolean)).size, [citations]);
  const activeCount = citations.filter((source) => source.regionId === activeRegionId).length;
  const coverage = (["player", "market", "sentiment", "culture"] as const).map((dimension) => ({
    dimension,
    count: citations.filter((source) => source.dimension === dimension && (!activeRegionId || source.regionId === activeRegionId)).length,
  }));
  const visible = citations.filter((source) => {
    const normalized = query.trim().toLowerCase();
    const matchesText = !normalized || `${source.id} ${source.title} ${source.publisher} ${source.snippet}`.toLowerCase().includes(normalized);
    const matchesRegion = regionFilter === "all" || regionFilter === "active" && source.regionId === activeRegionId || source.regionId === regionFilter;
    const matchesDimension = dimensionFilter === "all" || source.dimension === dimensionFilter;
    const origin = source.origin || (source.manual ? "manual" : "research");
    return matchesText && matchesRegion && matchesDimension && (originFilter === "all" || origin === originFilter);
  });
  return <aside className={styles.sourceRail} aria-label="来源智能" data-source-count={citations.length} data-source-visible={visible.length}>
    <header className={styles.sourceRailHeader}><div><span className="mono">SOURCE INTELLIGENCE</span><strong>{citations.length}</strong></div><Database size={19} /></header>
    <div className={styles.sourceStats}><div><span>当前区域</span><strong>{activeCount}</strong></div><div><span>方案引用</span><strong>{plan.sourceIds.length}</strong></div><div><span>媒体数量</span><strong>{publishers}</strong></div><div><span>Agent 使用</span><strong>{agentUsed.size}</strong></div></div>
    <div className={styles.dimensionCoverage} aria-label="当前区域研究维度覆盖">{coverage.map(({ dimension, count }) => <div key={dimension}><span>{dimensionLabels[dimension]}</span><strong>{count}</strong></div>)}</div>
    <div className={styles.qualityStack}><Quality label="全球主轴" ready={Boolean(plan.globalAxis)} /><Quality label="区域差异" ready={plan.regions.every((region) => Boolean(region.coreJudgment))} /><Quality label="角色关系发行" ready={plan.regions.every((region) => region.characterRelease.length > 0)} /></div>
    <div className={styles.sourceFilters}>
      <label><MagnifyingGlass size={13} /><input aria-label="搜索来源" placeholder="标题、媒体或来源编号" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div><Funnel size={12} /><select aria-label="来源区域" value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}><option value="all">全部区域</option><option value="active">当前区域</option>{regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}</select><select aria-label="来源维度" value={dimensionFilter} onChange={(event) => setDimensionFilter(event.target.value)}><option value="all">全部维度</option>{Object.entries(dimensionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label="来源类型" value={originFilter} onChange={(event) => setOriginFilter(event.target.value)}><option value="all">全部类型</option><option value="research">区域研究</option><option value="manual">人工补充</option><option value="agent">Agent 检索</option></select></div>
    </div>
    <div className={styles.sourceResultMeta}><span>{visible.length} 条匹配</span><span>{new Set(visible.map((source) => source.dimension)).size} 个维度</span></div>
    <div className={styles.sourceList}>
      {visible.map((source) => {
        const origin = source.origin || (source.manual ? "manual" : "research");
        return <a className={`${styles.sourceItem} ${agentUsed.has(source.id) ? styles.sourceAgentUsed : ""}`} href={source.url} target="_blank" rel="noreferrer" key={source.id}>
          <div><span className="mono">[{source.id}]</span>{agentUsed.has(source.id) ? <b>USED BY AGENT</b> : planUsed.has(source.id) ? <b>IN PLAN</b> : null}<ArrowSquareOut size={11} /></div>
          <strong>{source.title}</strong>
          <small>{regionNames.get(source.regionId) || "全球"} · {dimensionLabels[source.dimension]} · {origin === "agent" ? "Agent 检索" : origin === "manual" ? "人工补充" : source.publisher || "公开来源"}{source.publishedAt ? ` · ${source.publishedAt}` : ""}</small>
        </a>;
      })}
      {!visible.length ? <div className={styles.sourceEmpty}>没有匹配来源，调整筛选条件。</div> : null}
    </div>
    <div className={styles.executionBoundary}><Warning size={17} /><strong>执行边界</strong><p>本页面只修改方案文档，不连接发布、私信、投放或 KOL 联络。</p></div>
  </aside>;
}

function PlanAgentConsole({ plan, activeRegionId, configured, disabled, running, history, onRunningChange, onPatch, onHistoryChange, onUndo, onRefresh }: {
  plan: ReleasePlan;
  activeRegionId: string;
  configured: boolean;
  disabled: boolean;
  running: boolean;
  history: PlanAgentRunRecord[];
  onRunningChange: (running: boolean) => void;
  onPatch: (plan: ReleasePlan, highlightKey: string) => void;
  onHistoryChange: (records: PlanAgentRunRecord[]) => void;
  onUndo: (plan: ReleasePlan, record: PlanAgentRunRecord) => void;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState("等待指令");
  const [latestAction, setLatestAction] = useState("");
  const [activityOpen, setActivityOpen] = useState(true);
  const [pendingMessage, setPendingMessage] = useState<{ text: string; sentAt: string } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(true);
  const [undoing, setUndoing] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  useEffect(() => setPortalReady(true), []);
  useEffect(() => {
    setNotice(true);
    const timer = window.setTimeout(() => setNotice(false), 1_000);
    return () => window.clearTimeout(timer);
  }, [plan.generatedAt]);
  useEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript) return;
    transcript.scrollTo({ top: transcript.scrollHeight, behavior: "smooth" });
  }, [history, latestAction, pendingMessage]);

  const reloadHistory = async () => {
    const response = await fetch("/api/plan/agent?limit=20", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json() as { records: PlanAgentRunRecord[] };
    onHistoryChange(payload.records);
  };

  const handleEvent = (event: PlanAgentStreamEvent) => {
    if (event.type === "started") setLatestAction(`运行 ${event.runId.slice(-8).toUpperCase()} 已建立`);
    if (event.type === "phase") { setPhase(event.label); setLatestAction(event.label); }
    if (event.type === "source") setLatestAction(`检索来源 [${event.source.id}] ${event.source.title}`);
    if (event.type === "patch") { setLatestAction(`已修改：${event.patch.reason}`); onPatch(event.plan, event.highlightKey); }
    if (event.type === "done") {
      setPhase(event.record.patches.length ? "修改完成" : "已回复，文档未修改");
      onHistoryChange([event.record, ...history.filter((item) => item.runId !== event.record.runId)].slice(0, 20));
      setPendingMessage(null);
      setLatestAction("");
      onRefresh();
    }
    if (event.type === "error") { setError(event.message); setLatestAction("执行中断"); setPhase(event.partialApplied ? "部分修改已保存" : "修改失败"); }
  };

  const run = async () => {
    const message = prompt.trim();
    if (!message || running || disabled || !configured) return;
    setOpen(true);
    setError("");
    setPrompt("");
    setPendingMessage({ text: message, sentAt: new Date().toISOString() });
    setLatestAction("正在连接文档 Agent");
    setActivityOpen(true);
    setPhase("连接文档 Agent");
    onRunningChange(true);
    try {
      const response = await fetch("/api/plan/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, plan, activeRegionId }) });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({ error: "无法启动文档 Agent。" })) as { error?: string };
        throw new Error(payload.error || "无法启动文档 Agent。");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";
        for (const block of blocks) {
          const dataLine = block.split("\n").find((line) => line.startsWith("data: "));
          if (dataLine) handleEvent(JSON.parse(dataLine.slice(6)) as PlanAgentStreamEvent);
        }
        if (done) break;
      }
      await reloadHistory();
    } catch (nextError) {
      setError((nextError as Error).message);
      setLatestAction("连接失败");
      setPhase("连接失败");
    } finally {
      onRunningChange(false);
    }
  };

  const latestUndo = history.find((record) => record.patches.length > 0 && !record.undoneAt);
  const undo = async () => {
    if (!latestUndo || undoing || running) return;
    setUndoing(true);
    setError("");
    try {
      const response = await fetch(`/api/plan/agent/${latestUndo.runId}/undo`, { method: "POST" });
      const payload = await response.json() as { project?: { plan?: ReleasePlan }; record?: PlanAgentRunRecord; error?: string };
      if (!response.ok || !payload.project?.plan || !payload.record) throw new Error(payload.error || "无法撤销本次修改。");
      onUndo(payload.project.plan, payload.record);
      setPhase("最近一次修改已撤销");
      setLatestAction("已恢复 Agent 运行前的文档版本");
    } catch (nextError) {
      setError((nextError as Error).message);
    } finally {
      setUndoing(false);
    }
  };

  if (!portalReady) return null;
  return createPortal(<aside className={`${styles.agentDock} ${open ? styles.agentDockOpen : styles.agentDockCollapsed} ${expanded ? styles.agentDockExpanded : ""} ${notice ? styles.agentDockNotice : ""}`} aria-label="AI 发行文档 Agent" data-agent-pip="true" data-agent-mode={!open ? "minimized" : expanded ? "expanded" : "default"} data-agent-notice={notice ? "true" : "false"} data-agent-running={running ? "true" : "false"}>
    <header className={styles.agentPipHeader}>
      <div className={styles.agentPipTitle}><Robot size={17} weight="duotone" /><span><small className="mono">PLAN EDITOR AGENT</small><strong>AI 发行文档助手</strong></span></div>
      <div className={styles.agentPipControls}>
        <span className={styles.agentPhase}>{phase}</span>
        {open ? <button type="button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? "缩小 AI 文档 Agent" : "放大 AI 文档 Agent"} title={expanded ? "缩小" : "放大"}>{expanded ? <ArrowsInSimple size={15} /> : <ArrowsOutSimple size={15} />}</button> : null}
        <button type="button" onClick={() => { setOpen((value) => !value); if (open) setExpanded(false); }} aria-expanded={open} aria-label={open ? "收起 AI 文档 Agent" : "展开 AI 文档 Agent"} title={open ? "收起" : "展开"}>{open ? <CaretDown size={15} /> : <CaretUp size={15} />}</button>
      </div>
    </header>
    <div className={styles.agentPipContent} aria-hidden={!open}>
      <div className={styles.agentTranscript} aria-live="polite" ref={transcriptRef}>
        {history.slice(0, 6).reverse().map((record) => <div className={styles.agentHistoryItem} data-agent-history="true" key={record.runId}><span className="mono">{new Date(record.startedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span><p>{record.userMessage}</p><div className={styles.agentReply}><SafeMarkdown content={record.assistantSummary || record.error || `${record.patches.length} 项修改`} /></div></div>)}
        {pendingMessage ? <div className={`${styles.agentHistoryItem} ${styles.agentPendingItem}`} data-agent-pending-message="true"><span className="mono">{new Date(pendingMessage.sentAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span><p>{pendingMessage.text}</p><small>{error || "已发送，正在处理…"}</small></div> : null}
        {running ? <details className={styles.agentActivity} data-agent-activity="true" open={activityOpen} onToggle={(event) => setActivityOpen(event.currentTarget.open)}><summary><span><i />正在思考</span><CaretDown size={13} /></summary><p data-agent-latest-action="true">{latestAction || phase}</p></details> : null}
        {!history.length && !pendingMessage && !running ? <div className={styles.agentEmpty}><Robot size={21} /><p>用自然语言修改全球主轴、区域策略或角色发行。Agent 会优先读取现有来源。</p></div> : null}
      </div>
      {error ? <div className={styles.agentError}><Warning size={14} />{error}</div> : null}
      <div className={styles.agentCommand}>
        <div><span className="mono">{running ? "AGENT WORKING" : "MESSAGE THE DOCUMENT"}</span><textarea aria-label="AI 文档修改指令" rows={2} placeholder={configured ? "例如：将中国大陆方案调整为以时刻场景美术为核心" : "配置 ZHIPU_API_KEY 后可使用"} value={prompt} disabled={!configured || disabled || running} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void run(); } }} /></div>
      {latestUndo ? <button type="button" className={styles.agentUndo} onClick={() => void undo()} disabled={undoing || running} title="撤销最近一次 Agent 修改"><ArrowCounterClockwise size={16} /></button> : null}
      <button type="button" className={styles.agentSend} onClick={() => void run()} disabled={!configured || disabled || running || prompt.trim().length < 2} aria-label="发送文档修改指令"><PaperPlaneRight size={17} weight="fill" /></button>
      </div>
    </div>
  </aside>, document.body);
}
