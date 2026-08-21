/**
 * dependabot.yml 不変条件テスト
 *
 * .github/dependabot.yml の設定を parse して、以下の不変条件を固定する:
 * - package-ecosystem が "bun" に設定されている
 * - schedule.interval が "weekly" である
 * - allow に @anthropic-ai/claude-agent-sdk が含まれる
 * - auto-merge キーが存在しない（auto-merge は設定しない方針）
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const DEPENDABOT_PATH = path.resolve(process.cwd(), ".github/dependabot.yml");

describe("dependabot.yml 不変条件", () => {
  it("dependabot.yml が存在する", async () => {
    const stat = await fs.stat(DEPENDABOT_PATH);
    expect(stat.isFile()).toBe(true);
  });

  it("package-ecosystem が bun に設定されている", async () => {
    const content = await fs.readFile(DEPENDABOT_PATH, "utf-8");
    expect(content).toContain('package-ecosystem: "bun"');
  });

  it("スケジュールが weekly である", async () => {
    const content = await fs.readFile(DEPENDABOT_PATH, "utf-8");
    expect(content).toContain("weekly");
  });

  it("allow に LLM SDK 3 依存が含まれる", async () => {
    const content = await fs.readFile(DEPENDABOT_PATH, "utf-8");
    expect(content).toContain('dependency-name: "@anthropic-ai/claude-agent-sdk"');
    expect(content).toContain('dependency-name: "@anthropic-ai/sdk"');
    expect(content).toContain('dependency-name: "@openai/codex-sdk"');
  });

  it("auto-merge キーが存在しない", async () => {
    const content = await fs.readFile(DEPENDABOT_PATH, "utf-8");
    expect(content).not.toContain("auto-merge:");
  });
});
