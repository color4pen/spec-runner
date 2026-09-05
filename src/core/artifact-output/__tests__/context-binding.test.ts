/**
 * Unit tests for context.ts and revision-binding.ts
 *
 * TC-035: reviewer context が candidate revision と変更サマリーを保持する
 * TC-036: 履歴が存在しないことが空文字ではなく明示文言で表現される
 * TC-063: context の履歴セクションが空文字でなく明示文言である
 * TC-064: revision binding が snapshot 不能のとき `bound` を返さない
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { buildSnapshotContext } from "../context.js";
import { runBoundToCandidateRevision } from "../revision-binding.js";

// ─── TC-035 / TC-036 / TC-063: context builder ───────────────────────────────

describe("TC-035/TC-036/TC-063: buildSnapshotContext", () => {
  it("includes baseline and candidate digests", () => {
    const ctx = buildSnapshotContext({
      baselineDigest: "sha256:" + "a".repeat(64),
      candidateDigest: "sha256:" + "b".repeat(64),
      changes: [],
    });
    expect(ctx.contextBlock).toContain("sha256:" + "a".repeat(64));
    expect(ctx.contextBlock).toContain("sha256:" + "b".repeat(64));
  });

  it("history section is non-empty and contains 'no revision history'", () => {
    const ctx = buildSnapshotContext({
      baselineDigest: "sha256:" + "a".repeat(64),
      candidateDigest: "sha256:" + "b".repeat(64),
      changes: [],
    });
    expect(ctx.data.historySection).not.toBe("");
    expect(ctx.data.historySection.toLowerCase()).toContain("no revision history");
  });

  it("context block contains change path list", () => {
    const ctx = buildSnapshotContext({
      baselineDigest: "sha256:" + "a".repeat(64),
      candidateDigest: "sha256:" + "b".repeat(64),
      changes: [
        { path: "src/foo.ts", change: "added", kind: "file", mode: "100644" },
        { path: "src/bar.ts", change: "deleted", previousKind: "file" },
      ],
    });
    expect(ctx.contextBlock).toContain("src/foo.ts");
    expect(ctx.contextBlock).toContain("src/bar.ts");
  });

  it("context data changedPaths contains path:change format", () => {
    const ctx = buildSnapshotContext({
      baselineDigest: "sha256:" + "a".repeat(64),
      candidateDigest: "sha256:" + "b".repeat(64),
      changes: [
        { path: "README.md", change: "modified", kind: "file", mode: "100644" },
      ],
    });
    expect(ctx.data.changedPaths.some((p) => p.includes("README.md"))).toBe(true);
  });
});

// ─── TC-064: revision binding with unavailable snapshot ───────────────────────

describe("TC-064: revision binding fails when snapshot is unavailable", () => {
  it("returns unavailable (not bound) when directory does not exist", async () => {
    const nonexistentDir = "/nonexistent-path-that-does-not-exist-12345";
    const result = await runBoundToCandidateRevision(nonexistentDir, async () => "result");
    expect(result.kind).toBe("unavailable");
    expect(result.kind).not.toBe("bound");
  });
});

// ─── Revision drift detection ─────────────────────────────────────────────────

describe("Revision drift detection", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "rev-bind-test-"));
    await fs.writeFile(path.join(tempDir, "a.txt"), "initial");
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns bound when candidate is not changed during execution", async () => {
    const result = await runBoundToCandidateRevision(
      tempDir,
      async () => "no-change",
    );
    expect(result.kind).toBe("bound");
    if (result.kind === "bound") {
      expect(result.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(result.result).toBe("no-change");
    }
  });

  it("returns revision-drift when candidate changes during execution", async () => {
    const result = await runBoundToCandidateRevision(
      tempDir,
      async () => {
        // Mutate the candidate during execution
        await fs.writeFile(path.join(tempDir, "new-file.txt"), "injected");
        return "mutated";
      },
    );
    expect(result.kind).toBe("revision-drift");
    if (result.kind === "revision-drift") {
      expect(result.before).not.toBe(result.after);
    }
  });
});

// ─── Import needed for beforeEach/afterEach ────────────────────────────────────
import { beforeEach, afterEach } from "vitest";
