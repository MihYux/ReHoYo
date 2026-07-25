"use client";

import { Children, cloneElement, isValidElement, useEffect, useId, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactElement } from "react";
import Link from "next/link";
import { ArrowRight, ArrowSquareOut, CaretDown, Check, CloudArrowUp, FileDoc, Info, Sparkle, Trash, UploadSimple, Warning } from "@phosphor-icons/react";
import type { AutofillField, ProjectAutofillResponse, ProjectInput, VersionBrief } from "@/lib/contracts";
import { EMPTY_PROJECT } from "@/lib/contracts";
import { AUTOFILL_FIELD_LABELS, mergeAutofillSuggestions } from "@/lib/autofill";
import { StatusBadge } from "@/components/workspace-shell";
import { useWorkspace } from "@/components/workspace-provider";
import styles from "./brief.module.css";

const PLATFORM_OPTIONS = ["PC", "iOS", "Android", "PlayStation 5", "Xbox Series"];

const TOOL_LABELS: Record<ProjectAutofillResponse["toolTrace"][number]["tool"], string> = {
  read_current_form: "读取当前录入",
  list_uploaded_documents: "检查上传资料",
  search_internal_documents: "检索内部文档",
  web_search_public_facts: "核验公开事实",
  get_current_date: "读取当前日期",
};

function lines(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function humanFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function BriefPage() {
  const { data, refresh, request } = useWorkspace();
  const [form, setForm] = useState<ProjectInput>(EMPTY_PROJECT);
  const [brief, setBriefState] = useState<VersionBrief | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [autofillStage, setAutofillStage] = useState("");
  const [autofillSummary, setAutofillSummary] = useState<{
    response: ProjectAutofillResponse;
    appliedFields: AutofillField[];
    preservedFields: AutofillField[];
    missingFields: AutofillField[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!data) return;
    setForm({
      gameName: data.project.gameName,
      versionName: data.project.versionName,
      launchDate: data.project.launchDate,
      platforms: data.project.platforms,
      campaignStartWeek: data.project.campaignStartWeek,
      campaignEndWeek: data.project.campaignEndWeek,
      objective: data.project.objective,
      sellingPoints: data.project.sellingPoints,
      contentAssets: data.project.contentAssets,
      businessGoal: data.project.businessGoal,
      totalBudget: data.project.totalBudget,
      kpis: data.project.kpis,
      characterProfiles: data.project.characterProfiles,
      constraints: data.project.constraints,
      budgetConfirmed: data.project.budgetConfirmed,
      evidenceMode: data.project.evidenceMode,
      planningAsOfDate: data.project.planningAsOfDate,
      planningAsOfConfirmed: data.project.planningAsOfConfirmed,
    });
    setBriefState(data.project.brief);
  }, [data]);

  const completion = useMemo(() => {
    const checks = [form.gameName, form.versionName, form.launchDate, form.objective, form.sellingPoints.length, form.contentAssets.length, form.businessGoal];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [form]);

  if (!data) return null;

  async function action(name: string, run: () => Promise<unknown>, success: string) {
    setBusy(name); setError(""); setMessage("");
    try {
      await run();
      await refresh();
      setMessage(success);
    } catch (nextError) {
      setError((nextError as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function saveForm() {
    await action("save", () => request("/api/project/current", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }), "录入信息已保存");
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const body = new FormData();
    Array.from(files).forEach((file) => body.append("files", file));
    await action("upload", () => request("/api/sources", { method: "POST", body }), "文件已上传并完成本地解析");
  }

  async function autofillForm() {
    setBusy("autofill"); setError(""); setMessage(""); setAutofillSummary(null); setAutofillStage("读取资料");
    const timers = [
      window.setTimeout(() => setAutofillStage("检索公开信息"), 1300),
      window.setTimeout(() => setAutofillStage("整理字段"), 3600),
    ];
    try {
      const response = await request<ProjectAutofillResponse>("/api/brief/autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const merged = mergeAutofillSuggestions(form, response);
      setForm(merged.project);
      setAutofillSummary({
        response: merged.response,
        appliedFields: merged.appliedFields,
        preservedFields: merged.preservedFields,
        missingFields: merged.missingFields,
      });
      setMessage(`AI 已填写 ${merged.appliedFields.length} 项，请检查后保存`);
    } catch (nextError) {
      setError((nextError as Error).message);
    } finally {
      timers.forEach((timer) => window.clearTimeout(timer));
      setAutofillStage("");
      setBusy("");
    }
  }

  function openFilePicker() {
    if (!busy) fileInputRef.current?.click();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    if (!busy && event.dataTransfer.files.length) void upload(event.dataTransfer.files);
  }

  function handleDropKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openFilePicker();
    }
  }

  async function generateBrief() {
    await saveForm();
    await action("generate", () => request("/api/brief/generate", { method: "POST" }), "版本简报已生成并通过输入校验");
  }

  async function startCloudParse(sourceId: string) {
    setBusy(`cloud-${sourceId}`); setError(""); setMessage("");
    try {
      const result = await request<{ jobId: string }>(`/api/sources/${sourceId}/parse`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cloud: true, confirm: true }) });
      await new Promise((resolve) => window.setTimeout(resolve, 1800));
      await request(`/api/jobs/${result.jobId}`);
      await refresh();
      setMessage("云解析任务已创建，可随时检查进度");
    } catch (nextError) { setError((nextError as Error).message); }
    finally { setBusy(""); }
  }

  async function checkCloudJob(jobId: string) {
    await action(`job-${jobId}`, () => request(`/api/jobs/${jobId}`), "已更新云解析进度");
  }

  const hasAutofillContext = data.sources.some((source) => source.extractedLength > 0)
    || Boolean(form.gameName.trim())
    || Boolean(form.versionName.trim());
  const canAutofill = data.glm.configured && hasAutofillContext && !busy;
  const autofillDisabledReason = !data.glm.configured
    ? "请先配置 ZHIPU_API_KEY"
    : !hasAutofillContext
      ? "请先上传可解析资料，或填写游戏名称或版本名称"
      : busy
        ? "请等待当前操作完成"
        : "";
  const usedEvidenceIds = new Set(autofillSummary?.response.suggestions.flatMap((suggestion) => suggestion.evidenceIds) || []);
  const usedEvidence = autofillSummary?.response.evidence.filter((item) => usedEvidenceIds.has(item.id)) || [];

  return (
    <div className="page-enter">
      <header className="page-header">
        <div>
          <p className="page-kicker">VERSION INTELLIGENCE / INPUT</p>
          <h1 className="page-title">先让系统准确理解<br />这次版本为何重要。</h1>
          <p className="page-description">录入目标、卖点、资产与经营预期，并用内部文档补足上下文。结构化摘要审核通过后，才会进入区域研究。</p>
        </div>
        <div className={styles.headerReading}>
          <div><span className="mono">INPUT COMPLETENESS</span><strong>{completion}%</strong></div>
          <div className={styles.progressTrack}><span style={{ width: `${completion}%` }} /></div>
          <StatusBadge status={data.project.briefStatus} />
        </div>
      </header>

      {!data.glm.configured ? (
        <div className="notice notice-amber">
          <Warning size={19} />
          <div className="notice-content"><strong>GLM 尚未配置</strong><span>录入与本地解析仍可使用；生成前请在 <code>.env.local</code> 中设置 <code>ZHIPU_API_KEY</code>。</span></div>
        </div>
      ) : null}
      {error ? <div className="notice notice-red"><Warning size={19} /><div className="notice-content"><strong>操作未完成</strong><span>{error}</span></div></div> : null}
      {message ? <div className="notice notice-cyan"><Check size={19} /><div className="notice-content"><strong>{message}</strong><span>下游内容不会在未经确认的情况下被覆盖。</span></div></div> : null}

      <section className="section">
        <div className="section-heading">
          <div><h2 className="section-title"><span className="section-index">01-A</span>内部资料</h2><p className="section-note">先提供版本文档和经营表格，再让 AI 补全空白录入。原文件默认仅保存在本机。</p></div>
          <div className="page-actions">
            <button className="button" type="button" onClick={openFilePicker} disabled={Boolean(busy)}><UploadSimple size={16} /> {busy === "upload" ? "解析中…" : "选择文件"}</button>
            <button className="button button-cyan" type="button" onClick={() => void autofillForm()} disabled={!canAutofill} title={autofillDisabledReason}>
              {busy === "autofill" ? <><span className="spin" aria-hidden="true">◌</span>{autofillStage}</> : <><Sparkle size={16} weight="fill" />AI 自动填写</>}
            </button>
          </div>
        </div>
        <div
          className={`${styles.dropZone} ${dragActive ? styles.dropZoneActive : ""} ${busy ? styles.dropZoneDisabled : ""}`}
          role="button"
          tabIndex={busy ? -1 : 0}
          aria-disabled={Boolean(busy)}
          aria-describedby="upload-boundary"
          onClick={openFilePicker}
          onKeyDown={handleDropKeyDown}
          onDragEnter={(event) => { event.preventDefault(); if (!busy) setDragActive(true); }}
          onDragOver={(event) => { event.preventDefault(); if (!busy) setDragActive(true); }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false); }}
          onDrop={handleDrop}
        >
          <UploadSimple size={25} weight="light" />
          <strong>{busy === "upload" ? "正在解析上传资料" : dragActive ? "松开即可上传并解析" : "拖入版本文档或经营表格"}</strong>
          <span id="upload-boundary">PDF / Word / Excel / CSV / Markdown / TXT<br />最多 20 个文件，总计 100MB</span>
          <input ref={fileInputRef} className="sr-only" type="file" multiple accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.md,.txt" disabled={Boolean(busy)} onChange={(event) => { const input = event.currentTarget; void upload(input.files).finally(() => { input.value = ""; }); }} />
        </div>
        {data.sources.length ? (
          <div className={styles.fileTable}>
            {data.sources.map((source) => { const cloudJob = data.jobs.find((job) => job.scopeId === source.id && job.type === "cloud_parse" && job.status === "processing"); return <div className={styles.fileRow} key={source.id}>
              <FileDoc size={19} weight="duotone" />
              <div className={styles.fileName}><strong>{source.name}</strong><span>{humanFileSize(source.size)} · {source.extractedLength.toLocaleString()} 字符</span></div>
              <span className={`status ${source.status === "parsed" ? "status-approved" : source.status === "needs_cloud" ? "status-stale" : source.status === "failed" ? "status-failed" : "status-processing"}`}>{source.status === "parsed" ? "已解析" : source.status === "needs_cloud" ? "需云解析" : source.status === "failed" ? "失败" : "处理中"}</span>
              {source.status === "needs_cloud" ? <button className="button button-small" onClick={() => { if (window.confirm("此操作会将原文件发送至智谱文件解析服务。是否继续？")) void startCloudParse(source.id); }}><CloudArrowUp size={15} /> 云解析</button> : cloudJob ? <button className="button button-small" onClick={() => void checkCloudJob(cloudJob.id)}>检查进度</button> : <span />}
              <button className="button button-quiet icon-button" aria-label={`删除 ${source.name}`} onClick={() => { if (window.confirm(`确认删除“${source.name}”？`)) void action(`delete-${source.id}`, () => request(`/api/sources/${source.id}`, { method: "DELETE" }), "文件已删除"); }}><Trash size={16} /></button>
            </div>; })}
          </div>
        ) : null}
        <div className={styles.dataBoundary}><Info size={16} /><span>本地提取文本会发送给 GLM。只有扫描 PDF、旧版 DOC 或本地解析不足的文件，经确认后才上传原文件进行云解析。</span></div>
        {autofillSummary ? (
          <details className={styles.autofillSummary}>
            <summary>
              <div><Check size={17} /><strong>已填写 {autofillSummary.appliedFields.length} 项</strong><span>保留已有内容 {autofillSummary.preservedFields.length} 项，仍缺少 {autofillSummary.missingFields.length} 项</span></div>
              <CaretDown size={15} aria-hidden="true" />
            </summary>
            <div className={styles.autofillDetails}>
              <div className={styles.autofillColumns}>
                <div><span className="mono">FILLED FIELDS</span><p>{autofillSummary.appliedFields.length ? autofillSummary.appliedFields.map((field) => AUTOFILL_FIELD_LABELS[field]).join("、") : "没有足够证据可自动填写"}</p></div>
                <div><span className="mono">STILL NEEDED</span><p>{autofillSummary.missingFields.length ? autofillSummary.missingFields.map((field) => AUTOFILL_FIELD_LABELS[field]).join("、") : "结构化录入已完整"}</p></div>
              </div>
              {autofillSummary.response.warnings.length ? <div className={styles.autofillWarnings}>{autofillSummary.response.warnings.map((warning) => <span key={warning}>{warning}</span>)}</div> : null}
              <div className={styles.autofillEvidenceGrid}>
                <div><span className="mono">TOOL TRACE</span>{autofillSummary.response.toolTrace.map((trace, index) => <div className={styles.traceRow} key={`${trace.tool}-${index}`}><strong>{TOOL_LABELS[trace.tool]}</strong><span>{trace.resultCount} 项</span><small>{trace.label}</small></div>)}</div>
                <div><span className="mono">EVIDENCE</span>{usedEvidence.length ? usedEvidence.map((item) => item.kind === "web" ? <a className={styles.evidenceRow} href={item.url} target="_blank" rel="noreferrer" key={item.id}><span className="mono">{item.id}</span><strong>{item.title}</strong><ArrowSquareOut size={13} /></a> : <div className={styles.evidenceRow} key={item.id}><span className="mono">{item.id}</span><strong>{item.title}</strong><small>{item.locator}</small></div>) : <p className={styles.noEvidence}>没有使用可回填的证据。</p>}</div>
              </div>
              <div className={styles.saveReminder}><Info size={15} /><span>AI 结果尚未保存。请检查下方字段，然后点击“保存录入”。</span></div>
            </div>
          </details>
        ) : null}
      </section>

      <section className="section">
        <div className="section-heading">
          <div><h2 className="section-title"><span className="section-index">01-B</span>版本基础信息</h2><p className="section-note">AI 只补充空白字段。关键业务事实仍由你检查并确认保存。</p></div>
          <button className="button" onClick={() => void saveForm()} disabled={Boolean(busy)}>{busy === "save" ? "保存中…" : "保存录入"}</button>
        </div>

        <div className={styles.formSurface}>
          <div className={styles.formGrid}>
            <Field label="游戏名称" required><input className="input" value={form.gameName} onChange={(e) => setForm({ ...form, gameName: e.target.value })} placeholder="例如：星穹远征" /></Field>
            <Field label="版本名称" required><input className="input" value={form.versionName} onChange={(e) => setForm({ ...form, versionName: e.target.value })} placeholder="例如：2.7「逆光航路」" /></Field>
            <Field label="计划上线日期"><input className="input mono" type="date" value={form.launchDate} onChange={(e) => setForm({ ...form, launchDate: e.target.value })} /></Field>
            <Field label="研究证据模式"><select className="select" value={form.evidenceMode} onChange={(e) => setForm({ ...form, evidenceMode: e.target.value as typeof form.evidenceMode })}><option value="campaign_cutoff">历史规划快照（按资料冻结日）</option><option value="latest">最新公开证据（演示 / 当前判断）</option></select></Field>
            <div className={styles.weekPair}>
              <Field label="预热起点"><select className="select mono" value={form.campaignStartWeek} onChange={(e) => setForm({ ...form, campaignStartWeek: Number(e.target.value) })}>{[-12,-10,-8,-6,-4].map((week) => <option key={week} value={week}>T{week}</option>)}</select></Field>
              <Field label="长尾终点"><select className="select mono" value={form.campaignEndWeek} onChange={(e) => setForm({ ...form, campaignEndWeek: Number(e.target.value) })}>{[2,4,6,8,12].map((week) => <option key={week} value={week}>T+{week}</option>)}</select></Field>
            </div>
            <div className={styles.spanTwo}><Field label="发行平台"><div className={styles.checkGrid}>{PLATFORM_OPTIONS.map((platform) => <label key={platform} className={styles.checkItem}><input type="checkbox" checked={form.platforms.includes(platform)} onChange={(e) => setForm({ ...form, platforms: e.target.checked ? [...form.platforms, platform] : form.platforms.filter((item) => item !== platform) })} /><span>{platform}</span></label>)}</div></Field></div>
            <div className={styles.spanTwo}><Field label="版本目标" required hint="描述这次版本需要让玩家理解、感受或采取的关键行动。"><textarea className="textarea" value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} placeholder="例如：通过新主线与角色关系推进，提升回流玩家的版本认知和首周参与。" /></Field></div>
            <LineField label="核心卖点" value={form.sellingPoints} onChange={(value) => setForm({ ...form, sellingPoints: value })} placeholder="每行一个卖点" />
            <LineField label="可用内容资产" value={form.contentAssets} onChange={(value) => setForm({ ...form, contentAssets: value })} placeholder="PV、角色立绘、实机片段、音乐、开发者访谈…" />
            <Field label="经营目标"><textarea className="textarea" value={form.businessGoal} onChange={(e) => setForm({ ...form, businessGoal: e.target.value })} placeholder="新增、回流、收入、活跃或品牌目标" /></Field>
            <Field label="总预算（可留空）" hint="留空时，方案只给预算比例区间。"><input className="input" value={form.totalBudget} onChange={(e) => setForm({ ...form, totalBudget: e.target.value })} placeholder="例如：人民币 1,200 万" /></Field>
            <LineField label="核心 KPI" value={form.kpis} onChange={(value) => setForm({ ...form, kpis: value })} placeholder="每行一个 KPI 与目标" />
            <LineField label="角色资料" value={form.characterProfiles} onChange={(value) => setForm({ ...form, characterProfiles: value })} placeholder="角色名｜玩家关系｜口吻｜本版本变化" />
            <div className={styles.spanTwo}><Field label="品牌 / IP 限制"><textarea className="textarea" value={form.constraints} onChange={(e) => setForm({ ...form, constraints: e.target.value })} placeholder="禁用表达、剧透边界、联动限制、审校要求…" /></Field></div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <div><h2 className="section-title"><span className="section-index">01-C</span>AI 版本简报</h2><p className="section-note">系统从结构化录入与内部资料形成只读事实基线，并自动运行输入校验。</p></div>
          <div className="page-actions">
            <button className="button button-primary" onClick={() => void generateBrief()} disabled={Boolean(busy) || !data.glm.configured}>{busy === "generate" ? <><span className="spin">◌</span> 生成中</> : <><Sparkle size={16} weight="fill" /> {brief ? "重新生成" : "生成版本简报"}</>}</button>
          </div>
        </div>
        {brief ? (
          <div className={styles.briefSurface}>
            <div className={styles.briefLead}><span className="mono">EXECUTIVE SUMMARY · DATA FREEZE {brief.dataFreezeDate}</span><p>{brief.executiveSummary}</p></div>
            <div className={styles.briefGrid}>
              <BriefList title="版本目标" items={brief.goals} />
              <BriefList title="核心卖点" items={brief.sellingPoints} />
              <BriefList title="资产清单" items={brief.assetInventory} />
              <BriefList title="经营预期" items={brief.businessExpectations} />
              <BriefList title="角色关系" items={brief.characterProfiles} />
              <BriefList title="限制与风险" items={brief.constraints} />
            </div>
            <div className={styles.approvalBar}>
              <div><Info size={18} /><span>版本简报与区域报告均不可人工改写；人工只在最终方案聊天中要求代理修改文档。</span></div>
              {data.project.briefStatus === "approved" ? <Link href="/regions" className="button button-cyan">进入区域判断 <ArrowRight size={16} /></Link> : <StatusBadge status={data.project.briefStatus} />}
            </div>
          </div>
        ) : <div className="empty-state"><Sparkle size={26} color="#27b7ca" /><h3>等待形成统一事实基线</h3><p>先保存版本信息并上传可用资料；系统会生成只读简报并自动检查。</p></div>}
      </section>

      <section className={styles.dangerZone}>
        <div><strong>重置当前项目</strong><span>删除本地文件、录入信息、区域研究和发行方案。</span></div>
        <button className="button button-danger" onClick={() => setResetOpen(true)}>重置项目</button>
      </section>

      {resetOpen ? <div className={styles.modalBackdrop} role="presentation"><div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="reset-title"><h2 id="reset-title">确认重置当前项目</h2><p>此操作无法从应用内恢复。请输入 <code>RESET</code> 继续。</p><input className="input mono" autoFocus value={resetText} onChange={(e) => setResetText(e.target.value)} /><div className="page-actions"><button className="button" onClick={() => { setResetOpen(false); setResetText(""); }}>取消</button><button className="button button-danger" disabled={resetText !== "RESET" || Boolean(busy)} onClick={() => void action("reset", () => request("/api/project/current", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: resetText }) }), "当前项目已重置").then(() => { setResetOpen(false); setResetText(""); })}>永久重置</button></div></div></div> : null}
    </div>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  const generatedId = useId();
  const controlId = `field-${generatedId.replace(/:/g, "")}`;
  const labelId = `${controlId}-label`;
  const hintId = `${controlId}-hint`;
  const onlyChild = Children.only(children);
  const nativeControl = isValidElement(onlyChild)
    && typeof onlyChild.type === "string"
    && ["input", "textarea", "select"].includes(onlyChild.type);
  const control = isValidElement(onlyChild)
    ? cloneElement(onlyChild as ReactElement<{ id?: string; "aria-labelledby"?: string; "aria-describedby"?: string }>, nativeControl
      ? { id: controlId, "aria-describedby": hint ? hintId : undefined }
      : { "aria-labelledby": labelId, "aria-describedby": hint ? hintId : undefined })
    : onlyChild;
  return <div className="field"><label id={labelId} htmlFor={nativeControl ? controlId : undefined}>{label}{required ? <span className={styles.required}> *</span> : null}</label>{hint ? <span id={hintId} className="field-hint">{hint}</span> : null}{control}</div>;
}

function LineField({ label, value, onChange, placeholder }: { label: string; value: string[]; onChange: (value: string[]) => void; placeholder: string }) {
  return <Field label={label} hint="每行一项"><textarea className="textarea" value={value.join("\n")} onChange={(e) => onChange(lines(e.target.value))} placeholder={placeholder} /></Field>;
}

function BriefList({ title, items }: { title: string; items: string[] }) {
  return <div className={styles.briefBlock}><h3>{title}</h3>{items.map((item) => <p key={item}>{item}</p>)}</div>;
}
