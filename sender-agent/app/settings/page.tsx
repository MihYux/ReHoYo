"use client";

import { useEffect, useState } from "react";
import { Check, CloudArrowUp, FloppyDisk, Key, ShieldCheck, Warning } from "@phosphor-icons/react";
import { useWorkspace } from "@/components/workspace-provider";
import styles from "./settings.module.css";

type PublicSettings = {
  glm: { configured: boolean; model: string; baseUrl: string };
  delivery: { configured: boolean; serviceUrl: string };
  updatedAt: string;
};

export default function SettingsPage() {
  const { refresh, request } = useWorkspace();
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [model, setModel] = useState("glm-5.2");
  const [baseUrl, setBaseUrl] = useState("https://open.bigmodel.cn/api/paas/v4");
  const [apiKey, setApiKey] = useState("");
  const [publishToken, setPublishToken] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);
  const [clearPublishToken, setClearPublishToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    request<PublicSettings>("/api/settings").then((value) => {
      setSettings(value);
      setModel(value.glm.model);
      setBaseUrl(value.glm.baseUrl);
    }).catch((error) => setNotice({ kind: "error", text: error.message }));
  }, [request]);

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      const next = await request<PublicSettings>("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          glm: { model, baseUrl, apiKey: apiKey || undefined, clearApiKey },
          delivery: { publishToken: publishToken || undefined, clearPublishToken },
        }),
      });
      setSettings(next);
      setApiKey("");
      setPublishToken("");
      setClearApiKey(false);
      setClearPublishToken(false);
      await refresh();
      setNotice({ kind: "success", text: "连接设置已仅保存在本机。" });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  return <div className="page-enter">
    <header className="page-header">
      <div><p className="page-kicker">EMPLOYEE ACCESS / LOCAL SECRETS</p><h1 className="page-title">在应用内配置研究与发布连接。</h1><p className="page-description">API Key 和发布令牌写入员工端本机数据目录，不进入项目文件、安装包或区域策略。</p></div>
      <div className={styles.security}><ShieldCheck size={30} weight="duotone" /><div><strong>LOCAL ONLY</strong><span>文件权限 0600 · 不返回明文</span></div></div>
    </header>
    {notice ? <div className={`notice ${notice.kind === "error" ? "notice-red" : "notice-cyan"}`}>{notice.kind === "error" ? <Warning size={19} /> : <Check size={19} />}<div className="notice-content"><strong>{notice.text}</strong></div></div> : null}
    <div className={styles.grid}>
      <section className={styles.card}>
        <header><Key size={24} weight="duotone" /><div><span>MARKET RESEARCH</span><h2>智谱 GLM</h2></div><i className={settings?.glm.configured ? styles.online : ""} /></header>
        <label><span>API Key</span><input type="password" autoComplete="off" value={apiKey} placeholder={settings?.glm.configured ? "已保存；留空保持不变" : "在此粘贴 API Key"} onChange={(event) => { setApiKey(event.target.value); setClearApiKey(false); }} /></label>
        <label><span>模型</span><input value={model} onChange={(event) => setModel(event.target.value)} /></label>
        <label><span>API 地址</span><input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} /></label>
        <label className={styles.clear}><input type="checkbox" checked={clearApiKey} onChange={(event) => setClearApiKey(event.target.checked)} /><span>清除已保存的智谱 API Key</span></label>
      </section>
      <section className={styles.card}>
        <header><CloudArrowUp size={24} weight="duotone" /><div><span>PET POLICY DELIVERY</span><h2>Cloudflare Worker</h2></div><i className={settings?.delivery.configured ? styles.online : ""} /></header>
        <label><span>策略服务</span><input value={settings?.delivery.serviceUrl || "https://rehoyo.ccwu.cc"} disabled /></label>
        <label><span>员工发布令牌</span><input type="password" autoComplete="off" value={publishToken} placeholder={settings?.delivery.configured ? "已保存；留空保持不变" : "粘贴 Worker 发布令牌"} onChange={(event) => { setPublishToken(event.target.value); setClearPublishToken(false); }} /></label>
        <label className={styles.clear}><input type="checkbox" checked={clearPublishToken} onChange={(event) => setClearPublishToken(event.target.checked)} /><span>清除已保存的发布令牌</span></label>
        <p>只有人工确认后的区域宠物策略会上传；研究资料、引用、预算和内部目标不会进入公开 KV。</p>
      </section>
    </div>
    <div className={styles.actions}><button className="button button-primary" onClick={() => void save()} disabled={busy}><FloppyDisk size={17} />{busy ? "保存中…" : "保存连接设置"}</button></div>
  </div>;
}
