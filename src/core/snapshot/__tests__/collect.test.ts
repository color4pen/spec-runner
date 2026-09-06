/**
 * Unit tests for src/core/snapshot/collect.ts
 *
 * TC-011: 読み取れないファイルがあるとスナップショットが unavailable になる
 * TC-012: 非対応の entry kind があるとスナップショットが unavailable になる
 * TC-013: source root 外を指す symlink があるとスナップショットが unavailable になる
 * TC-049: .git/ がデフォルト exclusion として適用され snapshot.exclusions に記録される
 * TC-050: collectSnapshot が entries を path byte 昇順で返す
 */
import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { collectSnapshot } from "../collect.js";

// ─── Temp directory helpers ───────────────────────────────────────────────────

const tempDirs: string[] = [];

async function mktemp(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "snapshot-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch { /* best-effort */ }
  }
});

// ─── TC-049: .git/ exclusion ─────────────────────────────────────────────────

describe("TC-049: .git/ default exclusion", () => {
  it("excludes .git/ by default and records it in exclusions", async () => {
    const root = await mktemp();
    await fs.mkdir(path.join(root, ".git"));
    await fs.writeFile(path.join(root, ".git", "config"), "git config");
    await fs.writeFile(path.join(root, "a.txt"), "hello");

    const result = await collectSnapshot(root);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.snapshot.exclusions).toContain(".git/");
      const gitEntry = result.snapshot.entries.find((e) => e.path.startsWith(".git"));
      expect(gitEntry).toBeUndefined();
      const aEntry = result.snapshot.entries.find((e) => e.path === "a.txt");
      expect(aEntry).toBeDefined();
    }
  });
});

// ─── TC-050: entries sorted by path ──────────────────────────────────────────

describe("TC-050: entries are sorted by path byte order", () => {
  it("returns entries in path byte ascending order", async () => {
    const root = await mktemp();
    // Create files in non-alphabetical order
    await fs.writeFile(path.join(root, "z.txt"), "z");
    await fs.writeFile(path.join(root, "a.txt"), "a");
    await fs.writeFile(path.join(root, "m.txt"), "m");

    const result = await collectSnapshot(root);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      const paths = result.snapshot.entries.map((e) => e.path);
      const sorted = [...paths].sort();
      expect(paths).toEqual(sorted);
    }
  });
});

// ─── TC-011: unreadable file → unavailable ────────────────────────────────────

describe("TC-011: unreadable file makes snapshot unavailable", () => {
  it("snapshot is unavailable when a file cannot be read", async () => {
    const root = await mktemp();
    await fs.writeFile(path.join(root, "readable.txt"), "ok");
    await fs.writeFile(path.join(root, "unreadable.txt"), "secret");

    // Remove read permission from the file
    await fs.chmod(path.join(root, "unreadable.txt"), 0o000);

    // Only fails as non-root
    const result = await collectSnapshot(root);
    try {
      if (process.getuid && process.getuid() !== 0) {
        expect(result.kind).toBe("unavailable");
        if (result.kind === "unavailable") {
          expect(result.failures.some((f) => f.path === "unreadable.txt")).toBe(true);
        }
      } else {
        // Root can read any file — skip this assertion
        console.warn("Skipping unreadable file test: running as root");
      }
    } finally {
      // Restore permission for cleanup
      await fs.chmod(path.join(root, "unreadable.txt"), 0o644).catch(() => {});
    }
  });
});

// ─── TC-013: symlink escape → unavailable ────────────────────────────────────

describe("TC-013: symlink escaping root makes snapshot unavailable", () => {
  it("symlink pointing outside root causes unavailable", async () => {
    const root = await mktemp();
    // Create a symlink pointing to /etc/passwd (outside root)
    await fs.symlink("/etc/passwd", path.join(root, "escape.link"));

    const result = await collectSnapshot(root);
    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") {
      expect(result.failures.some((f) => f.reason === "symlink-escape")).toBe(true);
    }
  });

  it("relative symlink pointing outside root causes unavailable", async () => {
    const root = await mktemp();
    // ../outside is relative and escapes the root
    await fs.symlink("../../outside", path.join(root, "escape.link"));

    const result = await collectSnapshot(root);
    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") {
      expect(result.failures.some((f) => f.reason === "symlink-escape")).toBe(true);
    }
  });

  it("relative symlink staying inside root is OK", async () => {
    const root = await mktemp();
    await fs.writeFile(path.join(root, "target.txt"), "target");
    await fs.symlink("target.txt", path.join(root, "link.txt"));

    const result = await collectSnapshot(root);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      const link = result.snapshot.entries.find((e) => e.path === "link.txt");
      expect(link).toBeDefined();
      expect(link?.kind).toBe("symlink");
      expect(link?.symlinkTarget).toBe("target.txt");
    }
  });
});

// ─── TC-012: unsupported kind → unavailable ───────────────────────────────────

describe("TC-012: unsupported entry kind makes snapshot unavailable", () => {
  it("FIFO / named pipe causes unavailable", async () => {
    const root = await mktemp();
    const fifoPath = path.join(root, "my.fifo");

    // Create a FIFO using the system call (requires Linux/Mac)
    const { execSync } = await import("node:child_process");
    try {
      execSync(`mkfifo "${fifoPath}"`, { stdio: "ignore" });
    } catch {
      // mkfifo not available — skip
      console.warn("Skipping FIFO test: mkfifo not available");
      return;
    }

    const result = await collectSnapshot(root);
    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") {
      expect(result.failures.some((f) => f.reason === "unsupported-kind")).toBe(true);
    }
  });
});

// ─── Normal tree snapshot ─────────────────────────────────────────────────────

describe("Normal tree snapshot", () => {
  it("collects files, symlinks, and empty dirs", async () => {
    const root = await mktemp();
    await fs.writeFile(path.join(root, "a.txt"), "hello");
    await fs.writeFile(path.join(root, "bin.sh"), "#!/bin/sh");
    await fs.chmod(path.join(root, "bin.sh"), 0o755);
    await fs.mkdir(path.join(root, "emptydir"));
    await fs.symlink("a.txt", path.join(root, "link.txt"));

    const result = await collectSnapshot(root);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      const { entries, digest } = result.snapshot;
      expect(entries.some((e) => e.path === "a.txt" && e.kind === "file")).toBe(true);
      expect(entries.some((e) => e.path === "bin.sh" && e.mode === "100755")).toBe(true);
      expect(entries.some((e) => e.path === "emptydir" && e.kind === "dir")).toBe(true);
      expect(entries.some((e) => e.path === "link.txt" && e.kind === "symlink")).toBe(true);
      expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
  });

  it("does not throw for any valid directory input", async () => {
    const root = await mktemp();
    await expect(collectSnapshot(root)).resolves.toBeDefined();
  });
});
