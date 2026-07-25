import { NextResponse } from "next/server";
import { GlmError } from "@/lib/glm";
import { GovernanceError } from "@/lib/governance";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function apiError(error: unknown) {
  const status = error instanceof GovernanceError ? 409 : error instanceof GlmError ? error.status : 400;
  const message = error instanceof Error ? error.message : "请求处理失败";
  return NextResponse.json({ error: message, ...(error instanceof GovernanceError ? { violations: error.violations } : {}) }, { status });
}
