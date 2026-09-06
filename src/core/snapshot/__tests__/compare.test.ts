/**
 * Unit tests for src/core/snapshot/compare.ts
 *
 * TC-014: 変更集合が unavailable のとき空配列にならない
 * TC-015: 追加・変更・削除がすべて正しく導出される
 * TC-016: バイナリ変更が変更集合に現れる
 * TC-017: mode のみの変更が modified として現れ、両 mode が記録される
 * TC-018: ファイル移動が delete + add として表現され rename entry が生成されない
 * TC-051: exclusion が異なる 2 つの snapshot の比較が unavailable を返す
 * TC-052: compare.ts が fs および child_process を import しない
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveChangeSet } from "../compare.js";
import type { DirectorySnapshot, SnapshotEntry } from "../types.js";
import { computeSnapshotDigest } from "../digest.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeSnapshot(
  entries: SnapshotEntry[],
  exclusions: readonly string[] = [".git/"],
): DirectorySnapshot {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const digest = computeSnapshotDigest("1", exclusions, sorted);
  return {
    schemaVersion: "1",
    exclusions,
    entries: sorted,
    digest,
  };
}

const fileEntry = (p: string, digest: string, mode = "100644"): SnapshotEntry => ({
  kind: "file",
  path: p,
  mode,
  contentDigest: digest,
  size: 10,
});

const symlinkEntry = (p: string, target: string): SnapshotEntry => ({
  kind: "symlink",
  path: p,
  mode: "120000",
  contentDigest: "sha256:" + "0".repeat(64),
  symlinkTarget: target,
});

// ─── TC-015: add / modify / delete ───────────────────────────────────────────

describe("TC-015: added, modified, deleted all derived", () => {
  it("added: present in candidate, not in baseline", () => {
    const base = makeSnapshot([fileEntry("existing.txt", "sha256:" + "a".repeat(64))]);
    const cand = makeSnapshot([
      fileEntry("existing.txt", "sha256:" + "a".repeat(64)),
      fileEntry("new.txt", "sha256:" + "b".repeat(64)),
    ]);
    const result = deriveChangeSet(base, cand);
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.changes.some((c) => c.path === "new.txt" && c.change === "added")).toBe(true);
    }
  });

  it("deleted: present in baseline, not in candidate", () => {
    const base = makeSnapshot([
      fileEntry("a.txt", "sha256:" + "a".repeat(64)),
      fileEntry("to-delete.txt", "sha256:" + "b".repeat(64)),
    ]);
    const cand = makeSnapshot([fileEntry("a.txt", "sha256:" + "a".repeat(64))]);
    const result = deriveChangeSet(base, cand);
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.changes.some((c) => c.path === "to-delete.txt" && c.change === "deleted")).toBe(true);
    }
  });

  it("modified: same path, different digest", () => {
    const base = makeSnapshot([fileEntry("a.txt", "sha256:" + "a".repeat(64))]);
    const cand = makeSnapshot([fileEntry("a.txt", "sha256:" + "b".repeat(64))]);
    const result = deriveChangeSet(base, cand);
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.changes.some((c) => c.path === "a.txt" && c.change === "modified")).toBe(true);
    }
  });

  it("output is sorted by path byte order", () => {
    const base = makeSnapshot([]);
    const cand = makeSnapshot([
      fileEntry("z.txt", "sha256:" + "z".repeat(64)),
      fileEntry("a.txt", "sha256:" + "a".repeat(64)),
    ]);
    const result = deriveChangeSet(base, cand);
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      const paths = result.changes.map((c) => c.path);
      expect(paths).toEqual([...paths].sort());
    }
  });
});

// ─── TC-016: binary file change appears in change set ────────────────────────

describe("TC-016: binary change appears in change set", () => {
  it("binary file modification is tracked as modified (digest-based, not content-based)", () => {
    const base = makeSnapshot([fileEntry("bin.dat", "sha256:" + "1".repeat(64))]);
    const cand = makeSnapshot([fileEntry("bin.dat", "sha256:" + "2".repeat(64))]);
    const result = deriveChangeSet(base, cand);
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.changes.some((c) => c.path === "bin.dat" && c.change === "modified")).toBe(true);
    }
  });
});

// ─── TC-017: mode-only change ────────────────────────────────────────────────

describe("TC-017: mode-only change is modified with both modes", () => {
  it("mode change produces modified with mode and previousMode", () => {
    const digest = "sha256:" + "a".repeat(64);
    const base = makeSnapshot([fileEntry("script.sh", digest, "100644")]);
    const cand = makeSnapshot([fileEntry("script.sh", digest, "100755")]);
    const result = deriveChangeSet(base, cand);
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      const entry = result.changes.find((c) => c.path === "script.sh");
      expect(entry?.change).toBe("modified");
      expect(entry?.mode).toBe("100755");
      expect(entry?.previousMode).toBe("100644");
    }
  });
});

// ─── TC-018: move = delete + add, no rename ──────────────────────────────────

describe("TC-018: moved file appears as delete + add, not rename", () => {
  it("same content at different paths → deleted + added", () => {
    const digest = "sha256:" + "a".repeat(64);
    const base = makeSnapshot([fileEntry("old/path.txt", digest)]);
    const cand = makeSnapshot([fileEntry("new/path.txt", digest)]);
    const result = deriveChangeSet(base, cand);
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      const deleted = result.changes.find((c) => c.path === "old/path.txt");
      const added = result.changes.find((c) => c.path === "new/path.txt");
      expect(deleted?.change).toBe("deleted");
      expect(added?.change).toBe("added");
      // No rename entry exists
      expect(result.changes.some((c) => (c as { rename?: boolean }).rename === true)).toBe(false);
    }
  });
});

// ─── Kind change: file → symlink ─────────────────────────────────────────────

describe("Kind change: file → symlink", () => {
  it("produces deleted (old kind) + added (new kind)", () => {
    const base = makeSnapshot([fileEntry("item", "sha256:" + "a".repeat(64))]);
    const cand = makeSnapshot([symlinkEntry("item", "./target")]);
    const result = deriveChangeSet(base, cand);
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      const deleted = result.changes.find((c) => c.path === "item" && c.change === "deleted");
      const added = result.changes.find((c) => c.path === "item" && c.change === "added");
      expect(deleted?.previousKind).toBe("file");
      expect(added?.kind).toBe("symlink");
      expect(added?.previousKind).toBe("file");
    }
  });
});

// ─── TC-051: exclusion mismatch → unavailable ────────────────────────────────

describe("TC-051: exclusion mismatch returns unavailable", () => {
  it("different exclusions → unavailable (not empty changes)", () => {
    const base = makeSnapshot([], [".git/"]);
    const cand = makeSnapshot([], []);
    const result = deriveChangeSet(base, cand);
    expect(result.kind).toBe("unavailable");
  });

  it("same exclusions → success", () => {
    const base = makeSnapshot([], [".git/"]);
    const cand = makeSnapshot([], [".git/"]);
    const result = deriveChangeSet(base, cand);
    expect(result.kind).toBe("success");
  });
});

// ─── TC-014: unavailable ≠ empty array ────────────────────────────────────────

describe("TC-014: unavailable change set is not reported as empty", () => {
  it("exclusion mismatch returns unavailable, not empty changes array", () => {
    const base = makeSnapshot([], [".git/"]);
    const cand = makeSnapshot([], []);
    const result = deriveChangeSet(base, cand);
    // Must NOT be { kind: "success", changes: [] }
    expect(result.kind).toBe("unavailable");
    // The "unavailable" discriminant carries a reason string
    if (result.kind === "unavailable") {
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });
});

// ─── TC-052: compare.ts has no fs/child_process imports ──────────────────────

describe("TC-052: compare.ts does not import fs or child_process", () => {
  it("source file has no fs or child_process imports", () => {
    const srcPath = path.join(__dirname, "../compare.ts");
    const src = fs.readFileSync(srcPath, "utf-8");
    expect(src).not.toMatch(/from\s+['"]node:fs/);
    expect(src).not.toMatch(/from\s+['"]node:child_process/);
  });
});
