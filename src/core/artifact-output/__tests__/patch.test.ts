/**
 * Unit tests for src/core/artifact-output/patch.ts
 *
 * TC-059: 新規ファイルの diff が正しい unified diff フォーマット
 * TC-060: バイナリ変更が patch に omitted として分類される
 * TC-061: 削除ファイルが patch に inclusion:deletion として分類される
 * TC-062: 512 KiB 超のファイルが omitted:size として分類される
 */
import { describe, it, expect } from "vitest";
import { buildPatch, PATCH_MAX_FILE_SIZE_BYTES } from "../patch.js";
import type { ChangeEntry } from "../../snapshot/compare.js";

// ─── Mock readFile ────────────────────────────────────────────────────────────

function makeReadFile(
  files: Map<string, Uint8Array | null>,
): (absPath: string) => Promise<Uint8Array | null> {
  return async (absPath: string) => files.get(absPath) ?? null;
}

function textBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function binaryBytes(): Uint8Array {
  // Contains NUL byte → classified as binary
  return new Uint8Array([0x00, 0x01, 0x02, 0x03, 0xFF]);
}

// ─── TC-059: new file unified diff format ────────────────────────────────────

describe("TC-059: new file patch has correct unified diff format", () => {
  it("added file has @@ -0,0 +1,N @@ hunk", async () => {
    const changes: readonly ChangeEntry[] = [
      { path: "new.txt", change: "added", kind: "file", mode: "100644" },
    ];
    const candidateRoot = "/cand";
    const baselineRoot = "/base";
    const fileContent = "line1\nline2\nline3\n";

    const fileMap = new Map<string, Uint8Array | null>();
    fileMap.set("/cand/new.txt", textBytes(fileContent));
    fileMap.set("/base/new.txt", null); // Does not exist in baseline

    const result = await buildPatch(changes, candidateRoot, baselineRoot, makeReadFile(fileMap));

    const entry = result.entries.find((e) => e.path === "new.txt");
    expect(entry?.classification).toBe("included");
    expect(result.patchText).toContain("@@ -0,0 +1,");
    expect(result.patchText).toContain("+line1");
    expect(result.patchText).toContain("+line2");
    expect(result.patchText).toContain("+line3");
  });

  it("patch text starts with diff header for added file", async () => {
    const changes: readonly ChangeEntry[] = [
      { path: "added.txt", change: "added", kind: "file", mode: "100644" },
    ];

    const fileMap = new Map<string, Uint8Array | null>();
    fileMap.set("/cand/added.txt", textBytes("content\n"));
    fileMap.set("/base/added.txt", null);

    const result = await buildPatch(changes, "/cand", "/base", makeReadFile(fileMap));
    // patch.ts uses the path directly without a/ b/ prefixes for new files
    expect(result.patchText).toContain("--- /dev/null");
    expect(result.patchText).toContain("+++ added.txt");
  });

  it("modified file has --- and +++ headers for the same path", async () => {
    const changes: readonly ChangeEntry[] = [
      { path: "mod.txt", change: "modified", kind: "file", mode: "100644" },
    ];

    const fileMap = new Map<string, Uint8Array | null>();
    fileMap.set("/cand/mod.txt", textBytes("new content\n"));
    fileMap.set("/base/mod.txt", textBytes("old content\n"));

    const result = await buildPatch(changes, "/cand", "/base", makeReadFile(fileMap));
    // patch.ts passes path directly as oldPath and newPath
    expect(result.patchText).toContain("--- mod.txt");
    expect(result.patchText).toContain("+++ mod.txt");
  });
});

// ─── TC-060: binary changes are omitted ──────────────────────────────────────

describe("TC-060: binary file changes are omitted from patch", () => {
  it("binary addition is classified as omitted:binary", async () => {
    const changes: readonly ChangeEntry[] = [
      { path: "image.png", change: "added", kind: "file", mode: "100644" },
    ];

    const fileMap = new Map<string, Uint8Array | null>();
    fileMap.set("/cand/image.png", binaryBytes());
    fileMap.set("/base/image.png", null);

    const result = await buildPatch(changes, "/cand", "/base", makeReadFile(fileMap));
    const entry = result.entries.find((e) => e.path === "image.png");
    expect(entry?.classification).toBe("omitted:binary");
  });

  it("binary modification is classified as omitted:binary", async () => {
    const changes: readonly ChangeEntry[] = [
      { path: "data.bin", change: "modified", kind: "file", mode: "100644" },
    ];

    const fileMap = new Map<string, Uint8Array | null>();
    fileMap.set("/cand/data.bin", new Uint8Array([0x00, 0xFF, 0x01]));
    fileMap.set("/base/data.bin", new Uint8Array([0x00, 0xFE, 0x01]));

    const result = await buildPatch(changes, "/cand", "/base", makeReadFile(fileMap));
    const entry = result.entries.find((e) => e.path === "data.bin");
    expect(entry?.classification).toBe("omitted:binary");
  });

  it("binary deletion is classified as omitted:binary-deletion", async () => {
    const changes: readonly ChangeEntry[] = [
      { path: "old.bin", change: "deleted", previousKind: "file" },
    ];

    const fileMap = new Map<string, Uint8Array | null>();
    fileMap.set("/base/old.bin", binaryBytes());
    fileMap.set("/cand/old.bin", null);

    const result = await buildPatch(changes, "/cand", "/base", makeReadFile(fileMap));
    const entry = result.entries.find((e) => e.path === "old.bin");
    expect(entry?.classification).toBe("omitted:binary-deletion");
  });
});

// ─── TC-061: deleted file included in patch ───────────────────────────────────

describe("TC-061: deleted file patch includes the deletion", () => {
  it("text deletion is classified as included:deletion", async () => {
    const changes: readonly ChangeEntry[] = [
      { path: "deleted.txt", change: "deleted", previousKind: "file" },
    ];

    const fileMap = new Map<string, Uint8Array | null>();
    fileMap.set("/base/deleted.txt", textBytes("line to remove\n"));
    fileMap.set("/cand/deleted.txt", null);

    const result = await buildPatch(changes, "/cand", "/base", makeReadFile(fileMap));
    const entry = result.entries.find((e) => e.path === "deleted.txt");
    expect(entry?.classification).toBe("included:deletion");
  });

  it("text deletion patch has +++ /dev/null", async () => {
    const changes: readonly ChangeEntry[] = [
      { path: "gone.txt", change: "deleted", previousKind: "file" },
    ];

    const fileMap = new Map<string, Uint8Array | null>();
    fileMap.set("/base/gone.txt", textBytes("old content\n"));
    fileMap.set("/cand/gone.txt", null);

    const result = await buildPatch(changes, "/cand", "/base", makeReadFile(fileMap));
    // patch.ts passes path directly; deletion has oldPath=path, newPath=/dev/null
    expect(result.patchText).toContain("+++ /dev/null");
    expect(result.patchText).toContain("--- gone.txt");
  });
});

// ─── TC-062: files over 512 KiB are omitted:size ─────────────────────────────

describe("TC-062: large files are omitted from patch", () => {
  it("file over 512 KiB is classified as omitted:size", async () => {
    const changes: readonly ChangeEntry[] = [
      { path: "huge.txt", change: "modified", kind: "file", mode: "100644" },
    ];

    // Create a large text file (just over the limit)
    const largeContent = new Uint8Array(PATCH_MAX_FILE_SIZE_BYTES + 1);
    // Fill with printable chars (no NUL so it's "text")
    largeContent.fill(0x41); // 'A'

    const fileMap = new Map<string, Uint8Array | null>();
    fileMap.set("/cand/huge.txt", largeContent);
    fileMap.set("/base/huge.txt", textBytes("small\n"));

    const result = await buildPatch(changes, "/cand", "/base", makeReadFile(fileMap));
    const entry = result.entries.find((e) => e.path === "huge.txt");
    expect(entry?.classification).toBe("omitted:size");
  });

  it("file exactly at 512 KiB limit is included", async () => {
    const changes: readonly ChangeEntry[] = [
      { path: "boundary.txt", change: "added", kind: "file", mode: "100644" },
    ];

    // Exactly at the limit
    const content = new Uint8Array(PATCH_MAX_FILE_SIZE_BYTES);
    content.fill(0x41); // 'A' — text

    const fileMap = new Map<string, Uint8Array | null>();
    fileMap.set("/cand/boundary.txt", content);
    fileMap.set("/base/boundary.txt", null);

    const result = await buildPatch(changes, "/cand", "/base", makeReadFile(fileMap));
    const entry = result.entries.find((e) => e.path === "boundary.txt");
    expect(entry?.classification).toBe("included");
  });

  it("PATCH_MAX_FILE_SIZE_BYTES is 512 KiB (524288)", () => {
    expect(PATCH_MAX_FILE_SIZE_BYTES).toBe(512 * 1024);
  });
});

// ─── Symlink and non-applicable entries ──────────────────────────────────────

describe("Non-applicable: directories and symlinks are not-applicable in patch", () => {
  it("directory change is not-applicable", async () => {
    const changes: readonly ChangeEntry[] = [
      { path: "somedir", change: "added", kind: "dir", mode: "040000" },
    ];

    const fileMap = new Map<string, Uint8Array | null>();

    const result = await buildPatch(changes, "/cand", "/base", makeReadFile(fileMap));
    const entry = result.entries.find((e) => e.path === "somedir");
    expect(entry?.classification).toBe("not-applicable");
  });

  it("symlink change is not-applicable", async () => {
    const changes: readonly ChangeEntry[] = [
      { path: "link.txt", change: "added", kind: "symlink", mode: "120000" },
    ];

    const fileMap = new Map<string, Uint8Array | null>();

    const result = await buildPatch(changes, "/cand", "/base", makeReadFile(fileMap));
    const entry = result.entries.find((e) => e.path === "link.txt");
    expect(entry?.classification).toBe("not-applicable");
  });
});
