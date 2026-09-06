/**
 * Unit tests for src/core/artifact-output/materialize.ts
 *
 * TC-055: materialize が snapshot の entry を候補 workspace に複製する
 * TC-056: materialize が symlink を follow せずに再作成する
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { materializeCandidate } from "../materialize.js";
import { collectSnapshot } from "../../snapshot/collect.js";
import type { DirectorySnapshot } from "../../snapshot/types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let tempDirs: string[] = [];

async function mktemp(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

beforeEach(() => {
  tempDirs = [];
});

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch { /* best-effort */ }
  }
});

async function buildSnapshot(dir: string): Promise<DirectorySnapshot> {
  const result = await collectSnapshot(dir, { exclusions: [".git/"] });
  if (result.kind !== "ok") {
    throw new Error(`Snapshot failed: ${result.reason}`);
  }
  return result.snapshot;
}

// ─── TC-055: snapshot entries are replicated ──────────────────────────────────

describe("TC-055: materializeCandidate replicates snapshot entries to candidate workspace", () => {
  it("plain files are copied to candidate root", async () => {
    const sourceDir = await mktemp("mat-src-");
    const candidateDir = await mktemp("mat-cand-");

    await fs.writeFile(path.join(sourceDir, "hello.txt"), "Hello, world!");
    await fs.writeFile(path.join(sourceDir, "sub.txt"), "sub content");

    const snapshot = await buildSnapshot(sourceDir);
    await materializeCandidate(sourceDir, candidateDir, snapshot);

    const helloContent = await fs.readFile(path.join(candidateDir, "hello.txt"), "utf-8");
    const subContent = await fs.readFile(path.join(candidateDir, "sub.txt"), "utf-8");
    expect(helloContent).toBe("Hello, world!");
    expect(subContent).toBe("sub content");
  });

  it("subdirectory files are created with their relative paths", async () => {
    const sourceDir = await mktemp("mat-src-");
    const candidateDir = await mktemp("mat-cand-");

    await fs.mkdir(path.join(sourceDir, "subdir"), { recursive: true });
    await fs.writeFile(path.join(sourceDir, "subdir", "nested.txt"), "nested content");

    const snapshot = await buildSnapshot(sourceDir);
    await materializeCandidate(sourceDir, candidateDir, snapshot);

    const content = await fs.readFile(path.join(candidateDir, "subdir", "nested.txt"), "utf-8");
    expect(content).toBe("nested content");
  });

  it("preserves file contents byte-for-byte", async () => {
    const sourceDir = await mktemp("mat-src-");
    const candidateDir = await mktemp("mat-cand-");

    const binaryData = Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE, 0xFD]);
    await fs.writeFile(path.join(sourceDir, "binary.dat"), binaryData);

    const snapshot = await buildSnapshot(sourceDir);
    await materializeCandidate(sourceDir, candidateDir, snapshot);

    const result = await fs.readFile(path.join(candidateDir, "binary.dat"));
    expect(Buffer.from(result)).toEqual(binaryData);
  });

  it("executable bit is preserved (mode 100755 → 100755)", async () => {
    const sourceDir = await mktemp("mat-src-");
    const candidateDir = await mktemp("mat-cand-");

    await fs.writeFile(path.join(sourceDir, "script.sh"), "#!/bin/sh\necho hello\n");
    await fs.chmod(path.join(sourceDir, "script.sh"), 0o755);

    const snapshot = await buildSnapshot(sourceDir);
    await materializeCandidate(sourceDir, candidateDir, snapshot);

    const stat = await fs.stat(path.join(candidateDir, "script.sh"));
    // Check executable bit is set (owner execute at minimum)
    expect(stat.mode & 0o100).toBe(0o100); // owner execute bit
  });

  it("non-executable files have mode 100644 in candidate", async () => {
    const sourceDir = await mktemp("mat-src-");
    const candidateDir = await mktemp("mat-cand-");

    await fs.writeFile(path.join(sourceDir, "data.txt"), "data");
    await fs.chmod(path.join(sourceDir, "data.txt"), 0o644);

    const snapshot = await buildSnapshot(sourceDir);
    await materializeCandidate(sourceDir, candidateDir, snapshot);

    const stat = await fs.stat(path.join(candidateDir, "data.txt"));
    // Owner execute bit should NOT be set
    expect(stat.mode & 0o100).toBe(0);
  });

  it("empty directories are created in candidate", async () => {
    const sourceDir = await mktemp("mat-src-");
    const candidateDir = await mktemp("mat-cand-");

    await fs.mkdir(path.join(sourceDir, "emptydir"), { recursive: true });
    await fs.writeFile(path.join(sourceDir, "placeholder.txt"), "exists");

    const snapshot = await buildSnapshot(sourceDir);
    await materializeCandidate(sourceDir, candidateDir, snapshot);

    const stat = await fs.stat(path.join(candidateDir, "emptydir"));
    expect(stat.isDirectory()).toBe(true);
  });
});

// ─── TC-056: symlinks are recreated as symlinks, not followed ─────────────────

describe("TC-056: materializeCandidate recreates symlinks without following them", () => {
  it("symlink in source becomes a symlink in candidate", async () => {
    const sourceDir = await mktemp("mat-sym-src-");
    const candidateDir = await mktemp("mat-sym-cand-");

    await fs.writeFile(path.join(sourceDir, "target.txt"), "target content");
    await fs.symlink("target.txt", path.join(sourceDir, "link.txt"));

    const snapshot = await buildSnapshot(sourceDir);
    await materializeCandidate(sourceDir, candidateDir, snapshot);

    // link.txt in candidate should be a symlink
    const linkStat = await fs.lstat(path.join(candidateDir, "link.txt"));
    expect(linkStat.isSymbolicLink()).toBe(true);

    // The symlink target should be 'target.txt'
    const linkTarget = await fs.readlink(path.join(candidateDir, "link.txt"));
    expect(linkTarget).toBe("target.txt");
  });

  it("symlink target is not read/followed during materialization", async () => {
    const sourceDir = await mktemp("mat-sym-src-");
    const candidateDir = await mktemp("mat-sym-cand-");

    // Create a dangling symlink (target does not exist)
    await fs.symlink("nonexistent-target.txt", path.join(sourceDir, "dangling.link"));

    const snapshot = await buildSnapshot(sourceDir);
    // Should not throw even though symlink target doesn't exist
    await expect(materializeCandidate(sourceDir, candidateDir, snapshot)).resolves.not.toThrow();

    // The dangling symlink should be recreated in candidate
    const linkStat = await fs.lstat(path.join(candidateDir, "dangling.link"));
    expect(linkStat.isSymbolicLink()).toBe(true);
  });

  it("source file is not modified during materialization", async () => {
    const sourceDir = await mktemp("mat-src-");
    const candidateDir = await mktemp("mat-cand-");

    const originalContent = "original source content";
    await fs.writeFile(path.join(sourceDir, "a.txt"), originalContent);

    const snapshot = await buildSnapshot(sourceDir);
    await materializeCandidate(sourceDir, candidateDir, snapshot);

    // Source should be unchanged
    const sourceContent = await fs.readFile(path.join(sourceDir, "a.txt"), "utf-8");
    expect(sourceContent).toBe(originalContent);
  });
});
