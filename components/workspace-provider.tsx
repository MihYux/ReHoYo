"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { GenerationJob, ProjectSnapshot, RegionConfig, ResearchCitation, SourceDocument } from "@/lib/contracts";

export type WorkspaceData = {
  project: ProjectSnapshot;
  regions: RegionConfig[];
  sources: SourceDocument[];
  citations: ResearchCitation[];
  jobs: GenerationJob[];
  glm: { configured: boolean; model: string };
  providers: {
    glm: { configured: boolean; model: string };
  };
};

type WorkspaceContextValue = {
  data: WorkspaceData | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<WorkspaceData | null>;
  request: <T>(url: string, init?: RequestInit) => Promise<T>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const request = useCallback(async <T,>(url: string, init?: RequestInit) => {
    const response = await fetch(url, { ...init, cache: "no-store" });
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();
    if (!response.ok) {
      if (typeof payload === "string") throw new Error(payload);
      const details = Array.isArray(payload.violations)
        ? payload.violations.slice(0, 4).map((item: { message?: string }) => item.message).filter(Boolean)
        : [];
      throw new Error([payload.error || "请求失败", ...details].join("；"));
    }
    return payload as T;
  }, []);

  const refresh = useCallback(async () => {
    try {
      setError("");
      const next = await request<WorkspaceData>("/api/project/current");
      setData(next);
      return next;
    } catch (nextError) {
      setError((nextError as Error).message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => { void refresh(); }, [refresh]);
  const value = useMemo(() => ({ data, loading, error, refresh, request }), [data, loading, error, refresh, request]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("WorkspaceProvider is missing");
  return value;
}
