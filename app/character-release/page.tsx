"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  ArrowRight, ChartLineUp, Check, CheckCircle, FileArrowUp, Globe, PaperPlaneTilt,
  Plus, ShieldCheck, Sparkle, SpinnerGap, Warning, X,
} from "@phosphor-icons/react";
import type {
  CharacterPlanRelease, CharacterRegionWorkspace, CharacterReleaseRegion,
  CharacterReleaseSnapshot, CharacterReleaseTask, CharacterReleaseTaskInput, ReleaseObjective,
} from "@/lib/character-release-types";
import styles from "./character-release.module.css";

type Step = "tasks" | "region" | "release" | "optimization";
type NewRegion = { code: string; name: string; language: string; timezone: string };
const steps: Array<{ id: Step; number: string; label: string; note: string; icon: typeof Globe }> = [
  { id: "tasks", number: "01", label: "版本任务", note: "同步并审核单区域方案", icon: FileArrowUp },
  { id: "region", number: "02", label: "区域数据", note: "确认授权与执行边界", icon: Globe },
  { id: "release", number: "03", label: "灰度发布", note: "设置比例并交付桌宠", icon: PaperPlaneTilt },
  { id: "optimization", number: "04", label: "效果优化", note: "查看关系健康信号", icon: ChartLineUp },
];

const blankTask = (): CharacterReleaseTaskInput => ({
  title: "", objective: "recall", theme: "", narrative: "", timeWindow: "", consentConfirmed: false,
  facts: [{ id: crypto.randomUUID(), label: "核心事实", value: "", source: "" }],
});

async function call<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const payload = await response.json().catch(() => ({ error: "请求失败" }));
  if (!response.ok) throw new Error(payload.error || "请求失败");
  return payload as T;
}

function taskInput(task: CharacterReleaseTask): CharacterReleaseTaskInput {
  return { id: task.id, title: task.title, objective: task.objective, theme: task.theme, narrative: task.narrative, timeWindow: task.timeWindow, consentConfirmed: task.consentConfirmed, facts: task.facts };
}

export default function CharacterReleasePage() {
  const [data, setData] = useState<CharacterReleaseSnapshot | null>(null);
  const [step, setStep] = useState<Step>("tasks");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [draft, setDraft] = useState<CharacterReleaseTaskInput>(blankTask);
  const [rollout, setRollout] = useState(5);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [regionPanel, setRegionPanel] = useState(false);
  const [newRegion, setNewRegion] = useState({ code: "", name: "", language: "zh-CN", timezone: "Asia/Shanghai" });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    call<CharacterReleaseSnapshot>("/api/character-release").then(setData).catch((error) => setNotice({ kind: "error", text: error.message }));
  }, []);

  const region = data?.regions.find((item) => item.id === data.activeRegionId);
  const workspace = data && region ? data.workspaces[region.id] : null;
  const task = workspace?.tasks.find((item) => item.id === selectedTaskId) || workspace?.tasks[0] || null;
  const latestRelease = workspace?.releases.find((item) => item.taskId === task?.id) || null;

  useEffect(() => {
    const first = workspace?.tasks[0];
    setSelectedTaskId(first?.id || "");
    setDraft(first ? taskInput(first) : blankTask());
  }, [data?.activeRegionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const mutate = async (key: string, action: () => Promise<CharacterReleaseSnapshot>, success: string) => {
    setBusy(key); setNotice(null);
    try {
      const next = await action(); setData(next); setNotice({ kind: "success", text: success }); return next;
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : String(error) }); return null;
    } finally { setBusy(""); }
  };

  const chooseTask = (next: CharacterReleaseTask) => {
    setSelectedTaskId(next.id); setDraft(taskInput(next)); setNotice(null);
  };

  const switchRegion = (regionId: string) => mutate("region", () => call("/api/character-release/regions/active", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ regionId }),
  }), "已切换角色发行区域。").then(() => setRegionPanel(false));

  const syncPlan = async () => {
    if (!region) return;
    setBusy("sync"); setNotice(null);
    try {
      const result = await call<{ data: CharacterReleaseSnapshot; taskId: string }>("/api/character-release/sync", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ regionId: region.sourceRegionId }),
      });
      setData(result.data); setSelectedTaskId(result.taskId);
      const imported = result.data.workspaces[region.id].tasks.find((item) => item.id === result.taskId);
      if (imported) setDraft(taskInput(imported));
      setNotice({ kind: "success", text: `已同步${region.name}单区域角色共生 Markdown，并创建新的任务版本。` });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : String(error) }); }
    finally { setBusy(""); }
  };

  const importFile = async (file: File) => {
    if (!region) return;
    setBusy("import"); setNotice(null);
    const form = new FormData(); form.set("regionId", region.id); form.set("file", file);
    try {
      const result = await call<{ data: CharacterReleaseSnapshot; taskId: string }>("/api/character-release/import", { method: "POST", body: form });
      setData(result.data); setSelectedTaskId(result.taskId);
      const imported = result.data.workspaces[region.id].tasks.find((item) => item.id === result.taskId);
      if (imported) setDraft(taskInput(imported));
      setNotice({ kind: "success", text: `${file.name} 已导入为新的任务版本。` });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : String(error) }); }
    finally { setBusy(""); if (fileRef.current) fileRef.current.value = ""; }
  };

  const saveTask = async () => {
    if (!region) return;
    const next = await mutate("save", () => call("/api/character-release/tasks", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ regionId: region.id, input: draft }),
    }), draft.id ? "版本任务已更新。" : "版本任务已创建。");
    if (next) {
      const saved = draft.id ? next.workspaces[region.id].tasks.find((item) => item.id === draft.id) : next.workspaces[region.id].tasks[0];
      if (saved) chooseTask(saved);
    }
  };

  const publish = (exampleMode: boolean) => {
    if (!region || !task) return;
    return mutate(exampleMode ? "example" : "publish", () => call("/api/character-release/publish", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ regionId: region.id, taskId: task.id, rolloutPercent: rollout, exampleMode }),
    }), exampleMode ? "示例方案已按 100% 发布，并进入桌宠交付队列。" : `方案已按 ${rollout}% 灰度发布，并进入桌宠交付队列。`);
  };

  const content = step === "tasks"
    ? <TasksStep workspace={workspace} draft={draft} setDraft={setDraft} task={task} chooseTask={chooseTask} syncPlan={syncPlan} saveTask={saveTask} importFile={() => fileRef.current?.click()} busy={busy} />
    : step === "region"
      ? <RegionStep region={region} workspace={workspace} />
      : step === "release"
        ? <ReleaseStep task={task} regionName={region?.name || ""} stopped={Boolean(workspace?.emergencyStoppedAt)} rollout={rollout} setRollout={setRollout} publish={publish} busy={busy} />
        : <OptimizationStep task={task} regionName={region?.name || ""} release={latestRelease} />;

  const stepIndex = steps.findIndex((item) => item.id === step);
  return <div className={`page-enter ${styles.page}`}>
    <input ref={fileRef} className="sr-only" type="file" accept=".docx,.pdf,.md,.txt" onChange={(event) => event.target.files?.[0] && void importFile(event.target.files[0])} />
    <header className={styles.hero}>
      <div><p className="page-kicker">Character symbiosis / Stage 05</p><h1>三月七角色发行控制台</h1><p>把已审核的单区域角色共生方案交给三月七桌宠执行，并在每一次灰度前保留人工控制。</p></div>
      <div className={styles.context}>
        <button onClick={() => setRegionPanel(true)}><Globe weight="duotone" /><span><small>当前区域</small><b>{region?.name || "加载中"}</b></span><ArrowRight /></button>
        <button className={workspace?.emergencyStoppedAt ? styles.resume : styles.emergency} disabled={!region || Boolean(busy)} onClick={() => region && mutate("emergency", () => call("/api/character-release/emergency", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ regionId: region.id, enabled: !workspace?.emergencyStoppedAt }) }), workspace?.emergencyStoppedAt ? "区域发行已恢复。" : "区域发行已紧急暂停。") }><Warning weight="fill" />{workspace?.emergencyStoppedAt ? "恢复区域" : "紧急暂停"}</button>
      </div>
    </header>

    <nav className={styles.rail} aria-label="角色发行工作流">{steps.map(({ id, number, label, note, icon: Icon }, index) => <button key={id} className={step === id ? styles.active : index < stepIndex ? styles.complete : ""} onClick={() => setStep(id)}><span>{number}</span><Icon weight={step === id ? "fill" : "regular"} /><div><b>{label}</b><small>{note}</small></div>{index < stepIndex ? <CheckCircle weight="fill" /> : null}</button>)}</nav>

    {notice ? <div className={`${styles.toast} ${styles[notice.kind]}`}><span>{notice.text}</span><button onClick={() => setNotice(null)} aria-label="关闭提示"><X /></button></div> : null}
    {!data ? <div className={styles.loading}><SpinnerGap className="spin" />正在加载角色发行工作区</div> : <main className={styles.workspace}>{content}<div className={styles.next}><span>下一步</span><b>{stepIndex < steps.length - 1 ? steps[stepIndex + 1].label : "持续观察并优化"}</b>{stepIndex < steps.length - 1 ? <button className="button button-primary" onClick={() => setStep(steps[stepIndex + 1].id)}>继续到{steps[stepIndex + 1].label}<ArrowRight /></button> : null}</div></main>}
    {busy ? <div className={styles.busy}><SpinnerGap className="spin" />正在执行并写入审计记录</div> : null}
    {regionPanel && data ? <RegionDialog data={data} current={region?.id || ""} newRegion={newRegion} setNewRegion={setNewRegion} onSwitch={switchRegion} onClose={() => setRegionPanel(false)} onAdd={async () => { const next = await mutate("add-region", () => call("/api/character-release/regions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newRegion) }), "新区域已加入角色发行工作区。"); if (next) { setNewRegion({ code: "", name: "", language: "zh-CN", timezone: "Asia/Shanghai" }); setRegionPanel(false); } }} /> : null}
  </div>;
}

function TasksStep({ workspace, draft, setDraft, task, chooseTask, syncPlan, saveTask, importFile, busy }: {
  workspace: CharacterRegionWorkspace | null;
  draft: CharacterReleaseTaskInput;
  setDraft: Dispatch<SetStateAction<CharacterReleaseTaskInput>>;
  task: CharacterReleaseTask | null;
  chooseTask: (task: CharacterReleaseTask) => void;
  syncPlan: () => Promise<void>;
  saveTask: () => Promise<void>;
  importFile: () => void;
  busy: string;
}) {
  const tasks = workspace?.tasks || [];
  return <>
    <div className={styles.sectionLead}><div><span>区域方案入口</span><h2>每次同步都形成新的可追溯版本</h2><p>自动同步使用策略 ZIP 中当前区域对应的单份角色共生 Markdown；旧任务和发布记录不会被覆盖。</p></div><div><button className="button" onClick={importFile} disabled={Boolean(busy)}><FileArrowUp />手动导入</button><button className="button button-primary" onClick={syncPlan} disabled={Boolean(busy)}><Sparkle weight="fill" />同步当前区域</button></div></div>
    {tasks.length ? <div className={styles.taskStrip}>{tasks.map((item: CharacterReleaseTask) => <button key={item.id} className={item.id === task?.id ? styles.selected : ""} onClick={() => chooseTask(item)}><span>{item.status === "ready" ? "可发布" : "草稿"}</span><b>{item.title}</b><small>{item.sourceDocument?.name || item.updatedAt.slice(0, 10)}</small></button>)}</div> : null}
    <section className={styles.card}><div className={styles.cardHead}><div><span>任务定义</span><h3>{draft.id ? "审核版本任务" : "新建版本任务"}</h3></div>{task?.sourceDocument ? <code>{task.sourceDocument.checksum.slice(0, 12)}</code> : null}</div>
      <div className={styles.form}><label><span>任务名称</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label><span>发行目标</span><select value={draft.objective} onChange={(event) => setDraft({ ...draft, objective: event.target.value as ReleaseObjective })}><option value="preheat">版本预热</option><option value="launch">版本上线</option><option value="sustain">持续运营</option><option value="recall">玩家召回</option></select></label><label className={styles.wide}><span>共生发行主题</span><textarea value={draft.theme} onChange={(event) => setDraft({ ...draft, theme: event.target.value })} /></label><label className={styles.wide}><span>三月七叙事方式</span><textarea value={draft.narrative} onChange={(event) => setDraft({ ...draft, narrative: event.target.value })} /></label><label><span>时间窗口</span><input value={draft.timeWindow} onChange={(event) => setDraft({ ...draft, timeWindow: event.target.value })} /></label><label className={styles.consent}><input type="checkbox" checked={draft.consentConfirmed} onChange={(event) => setDraft({ ...draft, consentConfirmed: event.target.checked })} /><span>确认只使用玩家已授权的内容范围</span></label></div>
      <div className={styles.facts}>{draft.facts.map((fact, index) => <div key={fact.id}><input value={fact.label} onChange={(event) => setDraft({ ...draft, facts: draft.facts.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) })} /><input value={fact.value} onChange={(event) => setDraft({ ...draft, facts: draft.facts.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item) })} /><input value={fact.source} onChange={(event) => setDraft({ ...draft, facts: draft.facts.map((item, itemIndex) => itemIndex === index ? { ...item, source: event.target.value } : item) })} /></div>)}</div>
      <div className={styles.actions}><button className="button button-primary" onClick={saveTask} disabled={Boolean(busy)}><Check />保存版本任务</button></div>
    </section>
  </>;
}

function RegionStep({ region, workspace }: { region?: CharacterReleaseRegion; workspace: CharacterRegionWorkspace | null }) {
  if (!region) return null;
  const eligible = region.segments.reduce((sum, item) => sum + item.eligible, 0);
  const authorized = region.segments.reduce((sum, item) => sum + item.authorized, 0);
  const reachable = region.segments.reduce((sum, item) => sum + item.reachable, 0);
  return <><div className={styles.regionHero}><div><span>{region.code}</span><h2>{region.name}区域执行边界</h2><p>{region.language} · {region.timeZone} · 勿扰 {region.quietHours.start}–{region.quietHours.end}</p></div><ShieldCheck weight="duotone" /></div><div className={styles.kpis}><article><span>符合条件</span><b>{eligible.toLocaleString()}</b><small>聚合玩家样本</small></article><article><span>明确授权</span><b>{authorized.toLocaleString()}</b><small>{(authorized / eligible * 100).toFixed(1)}%</small></article><article><span>当前可达</span><b>{reachable.toLocaleString()}</b><small>已应用勿扰与频控</small></article><article className={styles.guard}><span>区域状态</span><b>{workspace?.emergencyStoppedAt ? "已暂停" : "安全"}</b><small>关系护栏有效</small></article></div><div className={styles.regionGrid}><section className={styles.card}><div className={styles.cardHead}><div><span>匿名聚合</span><h3>玩家分群</h3></div></div>{region.segments.map((item) => <div className={styles.segment} key={item.id}><div><b>{item.name}</b><small>排除 {item.excluded.toLocaleString()}</small></div><span>{item.reachable.toLocaleString()} 可达</span></div>)}</section><section className={styles.card}><div className={styles.cardHead}><div><span>执行网络</span><h3>共生式发行 AI</h3></div></div>{region.releaseAgents.map((agent) => <div className={styles.agent} key={agent.id}><i /><div><b>{agent.name}</b><small>{agent.description}</small></div><span>ON</span></div>)}</section></div></>;
}

function ReleaseStep({ task, regionName, stopped, rollout, setRollout, publish, busy }: {
  task: CharacterReleaseTask | null; regionName: string; stopped: boolean; rollout: number;
  setRollout: Dispatch<SetStateAction<number>>; publish: (exampleMode: boolean) => Promise<CharacterReleaseSnapshot | null> | undefined; busy: string;
}) {
  if (!task) return <Empty title="先准备一个版本任务" text="返回版本任务，同步当前区域的角色共生 Markdown 或手动导入方案。" />;
  return <><div className={styles.releaseSummary}><div><span>当前区域方案</span><h2>{task.title}</h2><p>{task.theme}</p></div><dl><div><dt>区域</dt><dd>{regionName}</dd></div><div><dt>来源</dt><dd>{task.sourceDocument?.name || "控制台创建"}</dd></div><div><dt>状态</dt><dd>{task.status === "ready" ? "可发布" : "草稿"}</dd></div></dl></div><section className={styles.card}><div className={styles.cardHead}><div><span>灰度控制</span><h3>设置本次发布比例</h3></div><strong className={styles.rolloutValue}>{rollout}%</strong></div><div className={styles.presets}>{[1, 5, 10, 25, 50, 100].map((value) => <button key={value} className={rollout === value ? styles.selected : ""} onClick={() => setRollout(value)}>{value}%</button>)}</div><input className={styles.range} type="range" min="1" max="100" value={rollout} onChange={(event) => setRollout(Number(event.target.value))} /><p className={styles.muted}>交付包会进入本地桌宠队列；三月七仍会独立检查玩家授权、勿扰时间、拒绝信号和频率限制。</p></section><div className={styles.publishActions}><button className="button button-primary" disabled={stopped || task.status !== "ready" || Boolean(busy)} onClick={() => publish(false)}><PaperPlaneTilt weight="fill" />按 {rollout}% 发布方案</button><button className={styles.example} disabled={stopped || task.status !== "ready" || Boolean(busy)} onClick={() => publish(true)}><Sparkle weight="fill" />示例发布 · 100%</button></div></>;
}

function OptimizationStep({ task, regionName, release }: { task: CharacterReleaseTask | null; regionName: string; release: CharacterPlanRelease | null }) {
  const report = useMemo(() => release ? simulated(release.deliveryId, release.rolloutPercent) : null, [release]);
  if (!task || !release || !report) return <Empty title="发布后生成效果视图" text="完成一次普通灰度或示例发布后，这里会显示稳定、可复核的模拟聚合指标。" />;
  return <><div className={styles.resultHero}><div><span>SIMULATED · 模拟聚合数据</span><h2>关系健康稳定，可以继续观察并逐步扩大</h2><p>三月七以低打扰方式执行“{task.title}”，当前没有触发拒绝、投诉或关系风险护栏。</p></div><dl><div><dt>区域</dt><dd>{regionName}</dd></div><div><dt>灰度</dt><dd>{release.rolloutPercent}%</dd></div><div><dt>观察</dt><dd>近 7 天</dd></div></dl></div><div className={styles.kpis}><article><span>灰度触达</span><b>{report.reached.toLocaleString()}</b><small>个角色实例</small></article><article><span>自然交流率</span><b>{report.conversation}%</b><small>较首日 +6.8%</small></article><article><span>版本体验意向</span><b>{report.intent}%</b><small>持续温和上升</small></article><article className={styles.guard}><span>关系健康分</span><b>{report.health}</b><small>安全 · 无护栏告警</small></article></div><div className={styles.chartGrid}><section className={styles.card}><div className={styles.cardHead}><div><span>七日趋势</span><h3>自然交流与体验意向</h3></div></div><div className={styles.bars}>{report.days.map((value: number, index: number) => <div key={index}><i style={{ height: `${value}%` }} /><span>D{index + 1}</span></div>)}</div></section><section className={styles.card}><div className={styles.cardHead}><div><span>玩家回应</span><h3>交流结果分布</h3></div></div><div className={styles.outcomes}>{[["自然接受", 68], ["继续询问", 17], ["暂时搁置", 12], ["明确拒绝", 3]].map(([label, value]) => <div key={label as string}><span>{label}</span><div><i style={{ width: `${value}%` }} /></div><b>{value}%</b></div>)}</div></section></div><p className={styles.disclaimer}>以上为由区域、任务、发布批次和灰度比例稳定生成的产品演示值，不代表真实玩家行为。</p></>;
}

function simulated(seed: string, rollout: number) { let hash = [...seed].reduce((sum, char) => Math.imul(sum ^ char.charCodeAt(0), 16777619), 2166136261) >>> 0; const unit = () => ((hash = Math.imul(hash ^ (hash >>> 13), 1274126177) >>> 0) / 4294967295); return { reached: Math.max(18, Math.round((4600 + unit() * 2800) * rollout / 100)), conversation: (27 + unit() * 9).toFixed(1), intent: (15 + unit() * 8).toFixed(1), health: Math.round(88 + unit() * 7), days: Array.from({ length: 7 }, (_, index) => Math.round(28 + index * 7 + unit() * 8)) }; }

function Empty({ title, text }: { title: string; text: string }) { return <div className={styles.empty}><Sparkle weight="duotone" /><h2>{title}</h2><p>{text}</p></div>; }

function RegionDialog({ data, current, newRegion, setNewRegion, onSwitch, onClose, onAdd }: {
  data: CharacterReleaseSnapshot; current: string; newRegion: NewRegion;
  setNewRegion: Dispatch<SetStateAction<NewRegion>>; onSwitch: (regionId: string) => Promise<void>;
  onClose: () => void; onAdd: () => Promise<void>;
}) { return <div className={styles.backdrop} onMouseDown={onClose}><div className={styles.dialog} onMouseDown={(event) => event.stopPropagation()}><header><div><span>区域工作区</span><h2>切换或添加区域</h2></div><button onClick={onClose}><X /></button></header><div className={styles.regionOptions}>{data.regions.map((item) => <button key={item.id} className={item.id === current ? styles.selected : ""} onClick={() => onSwitch(item.id)}><b>{item.code}</b><span>{item.name}<small>{item.language} · {item.timeZone}</small></span>{item.id === current ? <CheckCircle weight="fill" /> : null}</button>)}</div><div className={styles.newRegion}><h3>添加自定义区域</h3><div><input placeholder="名称" value={newRegion.name} onChange={(event) => setNewRegion({ ...newRegion, name: event.target.value })} /><input placeholder="代码" value={newRegion.code} onChange={(event) => setNewRegion({ ...newRegion, code: event.target.value })} /><input placeholder="主要语言" value={newRegion.language} onChange={(event) => setNewRegion({ ...newRegion, language: event.target.value })} /><input placeholder="时区" value={newRegion.timezone} onChange={(event) => setNewRegion({ ...newRegion, timezone: event.target.value })} /></div><button className="button button-primary" disabled={!newRegion.name.trim() || !newRegion.code.trim()} onClick={onAdd}><Plus />添加区域</button></div></div></div>; }
