/**
 * Unit tests for touched-files-recorder (TC-001 to TC-008).
 *
 * TC-001: assistant message の Read/Edit/Write からパスが抽出される
 * TC-002: 部分的 input の content_block_start は記録されない
 * TC-003: Grep / Glob / Bash は記録対象外
 * TC-004: worktree 外のパスは除外される
 * TC-005: change folder 配下のパスは除外される
 * TC-006: 同一パスは重複排除される
 * TC-007: 100 件で打ち切られる
 * TC-008: change folder の trailing slash 境界判定（specrunner/changes-archive/ を誤除外しない）
 */

import { describe, it, expect } from "vitest";
import * as path from "node:path";
import {
  extractTouchedFilesFromMessages,
  normalizeTouchedFilePath,
} from "../touched-files-recorder.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CWD = "/workspace/project";

/** Build a fake SDK `type: "assistant"` message with the given tool_use blocks. */
function makeAssistantMessage(
  toolBlocks: Array<{ name: string; input: Record<string, unknown> }>,
) {
  return {
    type: "assistant",
    message: {
      content: toolBlocks.map((b, i) => ({
        type: "tool_use",
        id: `tool-id-${i}`,
        name: b.name,
        input: b.input,
      })),
    },
  };
}

/** Build a fake SDK `type: "stream_event"` content_block_start with partial input. */
function makeContentBlockStart(toolName: string, partialInput: Record<string, unknown> = {}) {
  return {
    type: "stream_event",
    event: {
      type: "content_block_start",
      content_block: { type: "tool_use", name: toolName, input: partialInput },
    },
  };
}

// ---------------------------------------------------------------------------
// TC-001: assistant message の Read/Edit/Write からパスが抽出される
// ---------------------------------------------------------------------------

describe("TC-001: Read/Edit/Write tool_use blocks in assistant messages yield extracted paths", () => {
  it("extracts file_path from Read, Edit, Write tool_use blocks in assistant messages", () => {
    const messages = [
      makeAssistantMessage([
        { name: "Read", input: { file_path: "src/core/foo.ts" } },
        { name: "Edit", input: { file_path: "src/core/bar.ts" } },
        { name: "Write", input: { file_path: "src/core/baz.ts" } },
      ]),
    ];

    const result = extractTouchedFilesFromMessages(messages, CWD);

    expect(result).toContain("src/core/foo.ts");
    expect(result).toContain("src/core/bar.ts");
    expect(result).toContain("src/core/baz.ts");
    expect(result).toHaveLength(3);
  });

  it("returns worktree-relative paths (not absolute)", () => {
    const messages = [
      makeAssistantMessage([
        { name: "Read", input: { file_path: path.join(CWD, "src/adapter/foo.ts") } },
      ]),
    ];

    const result = extractTouchedFilesFromMessages(messages, CWD);

    expect(result).toHaveLength(1);
    // Must be relative, not absolute
    expect(result[0]).toBe("src/adapter/foo.ts");
    expect(path.isAbsolute(result[0]!)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-002: 部分的 input の content_block_start は記録されない
// ---------------------------------------------------------------------------

describe("TC-002: content_block_start (partial input) is not recorded", () => {
  it("ignores stream_event content_block_start messages even when they have tool name Read", () => {
    const messages = [
      // This is a partial input stream_event — should be ignored
      makeContentBlockStart("Read", {}),
      makeContentBlockStart("Read", { file_path: "src/should-not-appear.ts" }),
    ];

    const result = extractTouchedFilesFromMessages(messages, CWD);

    expect(result).toHaveLength(0);
    expect(result).not.toContain("src/should-not-appear.ts");
  });

  it("extracts from assistant message but ignores content_block_start in mixed stream", () => {
    const messages = [
      // Partial stream_event (ignored)
      makeContentBlockStart("Read", {}),
      // Full assistant message (recorded)
      makeAssistantMessage([
        { name: "Read", input: { file_path: "src/core/real-file.ts" } },
      ]),
    ];

    const result = extractTouchedFilesFromMessages(messages, CWD);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe("src/core/real-file.ts");
  });
});

// ---------------------------------------------------------------------------
// TC-003: Grep / Glob / Bash は記録対象外
// ---------------------------------------------------------------------------

describe("TC-003: Grep / Glob / Bash tool blocks are not recorded", () => {
  it("ignores Grep, Glob, Bash tool_use blocks in assistant messages", () => {
    const messages = [
      makeAssistantMessage([
        { name: "Grep", input: { pattern: "foo", path: "src/" } },
        { name: "Glob", input: { pattern: "**/*.ts" } },
        { name: "Bash", input: { command: "cat src/foo.ts" } },
      ]),
    ];

    const result = extractTouchedFilesFromMessages(messages, CWD);

    expect(result).toHaveLength(0);
  });

  it("records Read/Write but ignores Grep in the same message", () => {
    const messages = [
      makeAssistantMessage([
        { name: "Read", input: { file_path: "src/keep.ts" } },
        { name: "Grep", input: { pattern: "foo" } },
        { name: "Write", input: { file_path: "src/keep2.ts" } },
      ]),
    ];

    const result = extractTouchedFilesFromMessages(messages, CWD);

    expect(result).toContain("src/keep.ts");
    expect(result).toContain("src/keep2.ts");
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// TC-004: worktree 外のパスは除外される
// ---------------------------------------------------------------------------

describe("TC-004: worktree-external paths are excluded", () => {
  it("excludes paths that resolve outside the worktree (.. prefix after relative normalization)", () => {
    const messages = [
      makeAssistantMessage([
        { name: "Read", input: { file_path: "/etc/passwd" } },
        { name: "Read", input: { file_path: path.join(CWD, "../other-project/foo.ts") } },
      ]),
    ];

    const result = extractTouchedFilesFromMessages(messages, CWD);

    expect(result).toHaveLength(0);
  });

  it("accepts paths inside the worktree", () => {
    const messages = [
      makeAssistantMessage([
        { name: "Read", input: { file_path: path.join(CWD, "src/inside.ts") } },
      ]),
    ];

    const result = extractTouchedFilesFromMessages(messages, CWD);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe("src/inside.ts");
  });
});

describe("TC-004 (normalizeTouchedFilePath): normalization utility excludes out-of-cwd paths", () => {
  it("returns null for absolute paths outside cwd", () => {
    const result = normalizeTouchedFilePath("/etc/passwd", CWD);
    expect(result).toBeNull();
  });

  it("returns null for paths that normalize to parent-relative", () => {
    const result = normalizeTouchedFilePath("../outside/foo.ts", CWD);
    expect(result).toBeNull();
  });

  it("returns relative path for paths inside cwd", () => {
    const result = normalizeTouchedFilePath(path.join(CWD, "src/foo.ts"), CWD);
    expect(result).toBe("src/foo.ts");
  });
});

// ---------------------------------------------------------------------------
// TC-005: change folder 配下のパスは除外される
// ---------------------------------------------------------------------------

describe("TC-005: change folder (specrunner/changes/) paths are excluded", () => {
  it("excludes paths under specrunner/changes/ from touchedFiles", () => {
    const messages = [
      makeAssistantMessage([
        { name: "Edit", input: { file_path: "specrunner/changes/my-change/design.md" } },
        { name: "Read", input: { file_path: "specrunner/changes/my-change/spec.md" } },
        { name: "Read", input: { file_path: "src/core/real.ts" } },
      ]),
    ];

    const result = extractTouchedFilesFromMessages(messages, CWD);

    expect(result).not.toContain("specrunner/changes/my-change/design.md");
    expect(result).not.toContain("specrunner/changes/my-change/spec.md");
    expect(result).toContain("src/core/real.ts");
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// TC-006: 同一パスは重複排除される
// ---------------------------------------------------------------------------

describe("TC-006: duplicate paths are deduplicated", () => {
  it("records a path only once even when touched by multiple tools", () => {
    const messages = [
      makeAssistantMessage([
        { name: "Read", input: { file_path: "src/core/shared.ts" } },
        { name: "Edit", input: { file_path: "src/core/shared.ts" } },
      ]),
      makeAssistantMessage([
        { name: "Write", input: { file_path: "src/core/shared.ts" } },
      ]),
    ];

    const result = extractTouchedFilesFromMessages(messages, CWD);

    const matches = result.filter((p) => p === "src/core/shared.ts");
    expect(matches).toHaveLength(1);
  });

  it("preserves insertion order with deduplication", () => {
    const messages = [
      makeAssistantMessage([
        { name: "Read", input: { file_path: "src/a.ts" } },
        { name: "Read", input: { file_path: "src/b.ts" } },
        { name: "Read", input: { file_path: "src/a.ts" } }, // duplicate
      ]),
    ];

    const result = extractTouchedFilesFromMessages(messages, CWD);

    expect(result).toEqual(["src/a.ts", "src/b.ts"]);
  });
});

// ---------------------------------------------------------------------------
// TC-007: 100 件で打ち切られる
// ---------------------------------------------------------------------------

describe("TC-007: result is capped at 100 files", () => {
  it("returns at most 100 unique paths when more than 100 are touched", () => {
    const toolBlocks = Array.from({ length: 110 }, (_, i) => ({
      name: "Read",
      input: { file_path: `src/file-${i.toString().padStart(3, "0")}.ts` },
    }));

    const messages = [makeAssistantMessage(toolBlocks)];
    const result = extractTouchedFilesFromMessages(messages, CWD);

    expect(result).toHaveLength(100);
    // First 100 files should be included (insertion order)
    expect(result[0]).toBe("src/file-000.ts");
    expect(result[99]).toBe("src/file-099.ts");
  });

  it("items beyond index 100 are discarded", () => {
    const toolBlocks = Array.from({ length: 105 }, (_, i) => ({
      name: "Read",
      input: { file_path: `src/file-${i.toString().padStart(3, "0")}.ts` },
    }));

    const messages = [makeAssistantMessage(toolBlocks)];
    const result = extractTouchedFilesFromMessages(messages, CWD);

    expect(result).toHaveLength(100);
    // Items 101-105 should not be present
    expect(result).not.toContain("src/file-100.ts");
    expect(result).not.toContain("src/file-104.ts");
  });
});

// ---------------------------------------------------------------------------
// TC-008: change folder の trailing slash 境界判定
// ---------------------------------------------------------------------------

describe("TC-008: change folder boundary uses trailing slash (specrunner/changes-archive/ is not excluded)", () => {
  it("does NOT exclude paths under specrunner/changes-archive/ (different prefix)", () => {
    const messages = [
      makeAssistantMessage([
        {
          name: "Read",
          input: { file_path: "specrunner/changes-archive/foo/bar.ts" },
        },
      ]),
    ];

    const result = extractTouchedFilesFromMessages(messages, CWD);

    expect(result).toContain("specrunner/changes-archive/foo/bar.ts");
    expect(result).toHaveLength(1);
  });

  it("still excludes paths directly under specrunner/changes/", () => {
    const messages = [
      makeAssistantMessage([
        { name: "Read", input: { file_path: "specrunner/changes/foo/tasks.md" } },
        { name: "Read", input: { file_path: "specrunner/changes-archive/foo/bar.ts" } },
      ]),
    ];

    const result = extractTouchedFilesFromMessages(messages, CWD);

    expect(result).not.toContain("specrunner/changes/foo/tasks.md");
    expect(result).toContain("specrunner/changes-archive/foo/bar.ts");
    expect(result).toHaveLength(1);
  });
});
