/**
 * Unit tests for src/core/snapshot/digest.ts
 *
 * TC-007: 同一 tree の 2 つのスナップショットが同じ digest を生成する
 * TC-008: 実行 bit の変化で digest が変わる
 * TC-009: 空ディレクトリが identity の一部になる
 * TC-010: symlink はターゲット文字列で識別される
 * TC-046: snapshot digest が sha256: プレフィックス + 64 桁の hex 文字列
 * TC-047: digest.ts が fs および child_process を import しない
 * TC-048: exclusion の変更が snapshot digest を変化させる
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeFileContentDigest,
  computeSymlinkDigest,
  computeSnapshotDigest,
} from "../digest.js";
import type { SnapshotEntry } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── TC-046: digest format ────────────────────────────────────────────────────

describe("TC-046: computeSnapshotDigest format", () => {
  it("returns sha256: prefix + 64 hex chars", () => {
    const entries: SnapshotEntry[] = [
      { kind: "file", path: "a.txt", mode: "100644", contentDigest: "sha256:" + "a".repeat(64) },
    ];
    const digest = computeSnapshotDigest("1", [".git/"], entries);
    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("computeFileContentDigest returns sha256: + 64 hex", () => {
    const digest = computeFileContentDigest(new Uint8Array([1, 2, 3]));
    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("computeSymlinkDigest returns sha256: + 64 hex", () => {
    const digest = computeSymlinkDigest("../target");
    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

// ─── TC-007: identical entries produce identical digests ──────────────────────

describe("TC-007: identical snapshot entries produce identical digests", () => {
  it("same entries in same order produce same digest", () => {
    const entries: SnapshotEntry[] = [
      { kind: "file", path: "a.txt", mode: "100644", contentDigest: "sha256:" + "0".repeat(64) },
      { kind: "file", path: "b.txt", mode: "100755", contentDigest: "sha256:" + "1".repeat(64) },
    ];
    const d1 = computeSnapshotDigest("1", [".git/"], entries);
    const d2 = computeSnapshotDigest("1", [".git/"], entries);
    expect(d1).toBe(d2);
  });

  it("entry order does not affect digest (deterministic by path sort)", () => {
    const entry1: SnapshotEntry = {
      kind: "file", path: "a.txt", mode: "100644", contentDigest: "sha256:" + "0".repeat(64),
    };
    const entry2: SnapshotEntry = {
      kind: "file", path: "z.txt", mode: "100644", contentDigest: "sha256:" + "1".repeat(64),
    };
    const d1 = computeSnapshotDigest("1", [], [entry1, entry2]);
    const d2 = computeSnapshotDigest("1", [], [entry2, entry1]);
    expect(d1).toBe(d2);
  });
});

// ─── TC-008: executable bit changes affect digest ─────────────────────────────

describe("TC-008: executable bit change alters digest", () => {
  it("mode 100644 vs 100755 produces different digest", () => {
    const entries644: SnapshotEntry[] = [
      { kind: "file", path: "script.sh", mode: "100644", contentDigest: "sha256:" + "a".repeat(64) },
    ];
    const entries755: SnapshotEntry[] = [
      { kind: "file", path: "script.sh", mode: "100755", contentDigest: "sha256:" + "a".repeat(64) },
    ];
    const d1 = computeSnapshotDigest("1", [], entries644);
    const d2 = computeSnapshotDigest("1", [], entries755);
    expect(d1).not.toBe(d2);
  });
});

// ─── TC-009: empty directory is part of identity ──────────────────────────────

describe("TC-009: empty directory is part of snapshot identity", () => {
  it("adding an empty dir changes the digest", () => {
    const withoutDir: SnapshotEntry[] = [
      { kind: "file", path: "a.txt", mode: "100644", contentDigest: "sha256:" + "0".repeat(64) },
    ];
    const withDir: SnapshotEntry[] = [
      { kind: "file", path: "a.txt", mode: "100644", contentDigest: "sha256:" + "0".repeat(64) },
      { kind: "dir", path: "emptydir", mode: "40000" },
    ];
    const d1 = computeSnapshotDigest("1", [], withoutDir);
    const d2 = computeSnapshotDigest("1", [], withDir);
    expect(d1).not.toBe(d2);
  });
});

// ─── TC-010: symlink identified by target string ──────────────────────────────

describe("TC-010: symlink target string changes digest", () => {
  it("different symlink targets produce different digests", () => {
    const entries1: SnapshotEntry[] = [
      { kind: "symlink", path: "link", mode: "120000", contentDigest: computeSymlinkDigest("../a"), symlinkTarget: "../a" },
    ];
    const entries2: SnapshotEntry[] = [
      { kind: "symlink", path: "link", mode: "120000", contentDigest: computeSymlinkDigest("../b"), symlinkTarget: "../b" },
    ];
    const d1 = computeSnapshotDigest("1", [], entries1);
    const d2 = computeSnapshotDigest("1", [], entries2);
    expect(d1).not.toBe(d2);
  });
});

// ─── TC-048: exclusion changes affect digest ──────────────────────────────────

describe("TC-048: exclusion changes affect digest", () => {
  it("different exclusions produce different digests for same entries", () => {
    const entries: SnapshotEntry[] = [
      { kind: "file", path: "a.txt", mode: "100644", contentDigest: "sha256:" + "0".repeat(64) },
    ];
    const d1 = computeSnapshotDigest("1", [".git/"], entries);
    const d2 = computeSnapshotDigest("1", [], entries);
    expect(d1).not.toBe(d2);
  });
});

// ─── TC-047: digest.ts has no fs/child_process imports ───────────────────────

describe("TC-047: digest.ts does not import fs or child_process", () => {
  it("source file has no fs or child_process imports", () => {
    const srcPath = path.join(__dirname, "../digest.ts");
    const src = fs.readFileSync(srcPath, "utf-8");
    expect(src).not.toMatch(/from\s+['"]node:fs/);
    expect(src).not.toMatch(/from\s+['"]node:child_process/);
    expect(src).not.toMatch(/require\(['"]node:fs['"]\)/);
    expect(src).not.toMatch(/require\(['"]node:child_process['"]\)/);
  });
});
