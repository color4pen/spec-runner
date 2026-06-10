/**
 * TC-001..TC-007, TC-013: workflow 不変条件 guard テスト
 *
 * Asserts three invariants on .github/workflows/*.yml:
 * 1. publish.yml has no token auth refs; OIDC config is complete.
 * 2. All `uses:` lines are SHA-pinned with a comment (no @vN tag refs).
 * 3. ci.yml push trigger has paths-ignore; pull_request trigger has no paths constraints.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const WORKFLOWS_DIR = path.resolve(__dirname, "../.github/workflows");

async function readWorkflow(name: string): Promise<string> {
  return fs.readFile(path.join(WORKFLOWS_DIR, name), "utf-8");
}

async function allWorkflowFiles(): Promise<string[]> {
  const entries = await fs.readdir(WORKFLOWS_DIR);
  return entries.filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
}

describe("TC-001/TC-002: publish.yml — OIDC 認証構成", () => {
  it("TC-001: NODE_AUTH_TOKEN / NPM_TOKEN への参照が存在しない", async () => {
    const content = await readWorkflow("publish.yml");
    expect(content).not.toContain("NODE_AUTH_TOKEN");
    expect(content).not.toContain("NPM_TOKEN");
  });

  it("TC-002: id-token: write が維持されている", async () => {
    const content = await readWorkflow("publish.yml");
    expect(content).toContain("id-token: write");
  });

  it("TC-002: npm publish --provenance が維持されている", async () => {
    const content = await readWorkflow("publish.yml");
    expect(content).toContain("npm publish --provenance");
  });

  it("TC-007: npm install -g npm@latest 相当の step が npm publish より前に存在する", async () => {
    const content = await readWorkflow("publish.yml");
    expect(content).toContain("npm install -g npm@latest");
    const npmUpdateIdx = content.indexOf("npm install -g npm@latest");
    const npmPublishIdx = content.indexOf("npm publish --provenance");
    expect(npmUpdateIdx).toBeGreaterThanOrEqual(0);
    expect(npmPublishIdx).toBeGreaterThanOrEqual(0);
    expect(npmUpdateIdx).toBeLessThan(npmPublishIdx);
  });
});

describe("TC-003/TC-004: 全 workflow — コメント付き SHA pin", () => {
  // uses: <owner>/<repo>@<40-char hex> # <tag>
  const SHA_PIN_RE = /uses:\s+\S+@[0-9a-f]{40}\s+#\s+\S+/;
  // tag refs like @v4, @v2, @v1 etc.
  const TAG_REF_RE = /@v\d/;

  it("TC-003: 全 uses: 行がコメント付き SHA 参照の形式である", async () => {
    const files = await allWorkflowFiles();
    const violations: string[] = [];

    for (const file of files) {
      const content = await readWorkflow(file);
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        const trimmed = line.trim();
        if (!trimmed.startsWith("uses:")) continue;
        if (!SHA_PIN_RE.test(trimmed)) {
          violations.push(`${file}:${i + 1}: ${trimmed}`);
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `Found uses: lines that are not SHA-pinned with comment:\n${violations.map((v) => `  ${v}`).join("\n")}`
      );
    }
    expect(violations.length).toBe(0);
  });

  it("TC-004: @vN タグ参照が全 workflow にゼロである", async () => {
    const files = await allWorkflowFiles();
    const violations: string[] = [];

    for (const file of files) {
      const content = await readWorkflow(file);
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        const trimmed = line.trim();
        if (!trimmed.startsWith("uses:")) continue;
        if (TAG_REF_RE.test(trimmed.split("#")[0] ?? "")) {
          violations.push(`${file}:${i + 1}: ${trimmed}`);
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `Found @vN tag references in uses: lines (must be SHA-pinned):\n${violations.map((v) => `  ${v}`).join("\n")}`
      );
    }
    expect(violations.length).toBe(0);
  });
});

describe("TC-005/TC-006/TC-013: ci.yml — push/pull_request trigger", () => {
  it("TC-005: push trigger に paths-ignore があり specrunner/changes/** を含む", async () => {
    const content = await readWorkflow("ci.yml");
    expect(content).toContain("paths-ignore:");
    expect(content).toContain("specrunner/changes/**");
  });

  it("TC-006/TC-013: pull_request trigger に paths / paths-ignore が存在しない", async () => {
    const content = await readWorkflow("ci.yml");

    // Parse the pull_request section: everything from "pull_request:" to end of on: block
    // Strategy: split by lines and inspect context around "pull_request:"
    const lines = content.split("\n");
    const prIdx = lines.findIndex((l) => l.trim() === "pull_request:");
    expect(prIdx).toBeGreaterThanOrEqual(0);

    // Collect lines belonging to the pull_request: block (until next top-level key or end)
    const prBlock: string[] = [];
    for (let i = prIdx + 1; i < lines.length; i++) {
      const line = lines[i] ?? "";
      // A line with content at indent level 0 or 2 (same level as pull_request) means new key
      if (line.match(/^\S/) || line.match(/^  \S/) && !line.match(/^    /)) break;
      prBlock.push(line);
    }

    const prBlockText = prBlock.join("\n");
    expect(prBlockText).not.toContain("paths-ignore:");
    expect(prBlockText).not.toContain("paths:");
  });
});
