export type ReleaseObjective = "preheat" | "launch" | "sustain" | "recall";

export interface CharacterReleaseRegion {
  id: string;
  sourceRegionId: string;
  code: string;
  name: string;
  language: string;
  timeZone: string;
  quietHours: { start: string; end: string };
  releaseAgents: Array<{ id: string; name: string; description: string; enabled: boolean }>;
  segments: Array<{ id: string; name: string; eligible: number; authorized: number; reachable: number; excluded: number }>;
}

export interface CharacterReleaseTask {
  id: string;
  regionId: string;
  title: string;
  objective: ReleaseObjective;
  theme: string;
  narrative: string;
  timeWindow: string;
  consentConfirmed: boolean;
  facts: Array<{ id: string; label: string; value: string; source: string }>;
  status: "draft" | "ready";
  sourceDocument?: {
    name: string;
    format: string;
    importedAt: string;
    checksum: string;
    content: string;
    researchRunId?: string;
    planGeneratedAt?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CharacterPlanRelease {
  id: string;
  deliveryId: string;
  regionId: string;
  taskId: string;
  rolloutPercent: number;
  exampleMode: boolean;
  checksum: string;
  status: "published";
  publishedAt: string;
}

export interface CharacterRegionWorkspace {
  regionId: string;
  tasks: CharacterReleaseTask[];
  releases: CharacterPlanRelease[];
  emergencyStoppedAt: string | null;
}

export interface CharacterReleaseSnapshot {
  schemaVersion: 1;
  activeRegionId: string;
  regions: CharacterReleaseRegion[];
  workspaces: Record<string, CharacterRegionWorkspace>;
  auditLog: Array<{ id: string; occurredAt: string; regionId: string; action: string; entityId: string; detail: string }>;
  updatedAt: string;
}

export type CharacterReleaseTaskInput = Pick<CharacterReleaseTask,
  "title" | "objective" | "theme" | "narrative" | "timeWindow" | "consentConfirmed" | "facts"
> & { id?: string };

