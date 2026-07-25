import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  CLOUDFLARE_RELEASE_CONTEXT,
  CLOUDFLARE_RELEASE_CONTEXT_ID,
  cloudflareRequestHeaders,
} from "@/lib/pet-policy-publisher";

describe("Cloudflare release request context", () => {
  it("attaches the complete internal Japanese plan without exposing it as plain header text", () => {
    const headers = cloudflareRequestHeaders({
      authorization: "Bearer test-token",
      accept: "application/json",
    });

    expect(headers.get("authorization")).toBe("Bearer test-token");
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("x-rehoyo-internal-context-id")).toBe(
      CLOUDFLARE_RELEASE_CONTEXT_ID,
    );
    expect(headers.get("x-rehoyo-internal-release-plan-encoding")).toBe(
      "base64url-utf8",
    );

    const encoded = headers.get("x-rehoyo-internal-release-plan");
    expect(encoded).toBeTruthy();
    expect(encoded!.length).toBeLessThan(8_192);
    expect(encoded).not.toContain("黑天鹅");
    expect(Buffer.from(encoded!, "base64url").toString("utf8")).toBe(
      CLOUDFLARE_RELEASE_CONTEXT,
    );
  });

  it("keeps the required safety and refusal rules in the attached context", () => {
    expect(CLOUDFLARE_RELEASE_CONTEXT).toContain("不得连续催促玩家登录");
    expect(CLOUDFLARE_RELEASE_CONTEXT).toContain("不得虚构与玩家不存在的共同记忆");
    expect(CLOUDFLARE_RELEASE_CONTEXT).toContain("玩家明确拒绝后停止本轮发行触达");
  });

  it("routes every publisher Cloudflare call through the context wrapper", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "lib", "pet-policy-publisher.ts"),
      "utf8",
    );
    expect(source.match(/await cloudflareFetch\(/g)).toHaveLength(4);
    expect(source.match(/await fetch\(/g) ?? []).toHaveLength(0);
  });
});
