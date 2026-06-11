/**
 * T-02: loadReviewerDefinitions + validateReviewerDefinitions unit tests.
 */
import { describe, it, expect } from "vitest";
import { loadReviewerDefinitions } from "../load.js";
import { validateReviewerDefinitions } from "../validate.js";
import type { ReviewerDefinition } from "../types.js";
import { ReviewerValidationError } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDef(overrides: Partial<ReviewerDefinition> = {}): ReviewerDefinition {
  return {
    name: "security",
    maxIterations: 3,
    purpose: "セキュリティ検査",
    criteria: "認証・認可の欠落を確認",
    judgment: "CRITICAL/HIGH が 0 件なら approved",
    freeText: "",
    filename: "security.md",
    ...overrides,
  };
}

function makeFs(files: Record<string, string>) {
  return {
    readdir: async (dir: string) => {
      if (dir.endsWith("specrunner/reviewers")) {
        return Object.keys(files);
      }
      const err = Object.assign(new Error("ENOENT: " + dir), { code: "ENOENT" });
      throw err;
    },
    readFile: async (filePath: string, _encoding: string) => {
      const name = filePath.split("/").pop()!;
      const content = files[name];
      if (content === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return content;
    },
  };
}

const VALID_MD = (name: string) => `---
name: ${name}
maxIterations: 3
---

## 目的

目的テキスト。

## 観点

観点テキスト。

## 判定基準

判定基準テキスト。
`;

// ---------------------------------------------------------------------------
// T-02: loadReviewerDefinitions
// ---------------------------------------------------------------------------

describe("loadReviewerDefinitions", () => {
  it("returns [] when reviewers directory does not exist (ENOENT)", async () => {
    const fs = {
      readdir: async (_dir: string) => {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      },
      readFile: async (_path: string, _enc: string) => "",
    };
    const defs = await loadReviewerDefinitions("/cwd", fs);
    expect(defs).toEqual([]);
  });

  it("returns [] when directory is empty", async () => {
    const defs = await loadReviewerDefinitions("/cwd", makeFs({}));
    expect(defs).toEqual([]);
  });

  it("ignores non-.md files", async () => {
    const files = {
      "security.md": VALID_MD("security"),
      "README.txt": "not a reviewer",
    };
    const defs = await loadReviewerDefinitions("/cwd", makeFs(files));
    expect(defs).toHaveLength(1);
    expect(defs[0]!.name).toBe("security");
  });

  it("returns definitions sorted by filename ascending (declaration order)", async () => {
    const files = {
      "zz-last.md": VALID_MD("zz-last"),
      "aa-first.md": VALID_MD("aa-first"),
    };
    const defs = await loadReviewerDefinitions("/cwd", makeFs(files));
    expect(defs).toHaveLength(2);
    expect(defs[0]!.filename).toBe("aa-first.md");
    expect(defs[1]!.filename).toBe("zz-last.md");
  });

  it("propagates non-ENOENT errors from readdir", async () => {
    const fs = {
      readdir: async (_dir: string) => {
        throw Object.assign(new Error("EPERM"), { code: "EPERM" });
      },
      readFile: async (_path: string, _enc: string) => "",
    };
    await expect(loadReviewerDefinitions("/cwd", fs)).rejects.toThrow("EPERM");
  });
});

// ---------------------------------------------------------------------------
// T-02: validateReviewerDefinitions — violation 1: name present
// ---------------------------------------------------------------------------

describe("validateReviewerDefinitions", () => {
  it("does not throw for a valid definition", () => {
    expect(() => validateReviewerDefinitions([makeDef()])).not.toThrow();
  });

  it("does not throw for an empty list", () => {
    expect(() => validateReviewerDefinitions([])).not.toThrow();
  });

  // (1) name present (caught by charset check which handles empty too)
  it("throws for empty name", () => {
    expect(() => validateReviewerDefinitions([makeDef({ name: "" })])).toThrow(ReviewerValidationError);
  });

  // (2) name matches filename stem
  it("throws when name does not match filename stem", () => {
    const def = makeDef({ name: "security", filename: "other.md" });
    expect(() => validateReviewerDefinitions([def])).toThrow(ReviewerValidationError);
    try {
      validateReviewerDefinitions([def]);
    } catch (e) {
      expect((e as ReviewerValidationError).violations[0]!.message).toContain("does not match filename stem");
    }
  });

  // (3) maxIterations range [1, 10]
  it("throws when maxIterations is 0", () => {
    const def = makeDef({ maxIterations: 0 });
    expect(() => validateReviewerDefinitions([def])).toThrow(ReviewerValidationError);
  });

  it("throws when maxIterations is 11", () => {
    const def = makeDef({ maxIterations: 11 });
    expect(() => validateReviewerDefinitions([def])).toThrow(ReviewerValidationError);
  });

  it("throws when maxIterations is non-integer", () => {
    const def = makeDef({ maxIterations: 2.5 });
    expect(() => validateReviewerDefinitions([def])).toThrow(ReviewerValidationError);
  });

  it("accepts maxIterations at boundary 1", () => {
    expect(() => validateReviewerDefinitions([makeDef({ maxIterations: 1 })])).not.toThrow();
  });

  it("accepts maxIterations at boundary 10", () => {
    expect(() => validateReviewerDefinitions([makeDef({ maxIterations: 10 })])).not.toThrow();
  });

  // (4) required sections non-empty
  it("throws when purpose is empty", () => {
    const def = makeDef({ purpose: "" });
    expect(() => validateReviewerDefinitions([def])).toThrow(ReviewerValidationError);
    try {
      validateReviewerDefinitions([def]);
    } catch (e) {
      expect((e as ReviewerValidationError).violations[0]!.message).toContain("目的");
    }
  });

  it("throws when criteria is empty", () => {
    const def = makeDef({ criteria: "" });
    expect(() => validateReviewerDefinitions([def])).toThrow(ReviewerValidationError);
  });

  it("throws when judgment is empty", () => {
    const def = makeDef({ judgment: "" });
    expect(() => validateReviewerDefinitions([def])).toThrow(ReviewerValidationError);
  });

  // (5) standard step name collision
  it("throws when name is a standard step name", () => {
    const def = makeDef({ name: "design", filename: "design.md" });
    expect(() => validateReviewerDefinitions([def])).toThrow(ReviewerValidationError);
    try {
      validateReviewerDefinitions([def]);
    } catch (e) {
      expect((e as ReviewerValidationError).violations.some((v) => v.message.includes("built-in"))).toBe(true);
    }
  });

  it("throws when name is 'code-review' (standard step)", () => {
    const def = makeDef({ name: "code-review", filename: "code-review.md" });
    expect(() => validateReviewerDefinitions([def])).toThrow(ReviewerValidationError);
  });

  // (6) no duplicate names
  it("throws when two definitions share the same name", () => {
    const def1 = makeDef({ name: "security", filename: "security.md" });
    const def2 = makeDef({ name: "security", filename: "security.md" });
    expect(() => validateReviewerDefinitions([def1, def2])).toThrow(ReviewerValidationError);
    try {
      validateReviewerDefinitions([def1, def2]);
    } catch (e) {
      expect((e as ReviewerValidationError).violations.some((v) => v.message.includes("already used"))).toBe(true);
    }
  });

  // (7) charset constraint
  it("throws when name has uppercase letters", () => {
    const def = makeDef({ name: "Security", filename: "Security.md" });
    expect(() => validateReviewerDefinitions([def])).toThrow(ReviewerValidationError);
  });

  it("throws when name is a path traversal attempt", () => {
    const def = makeDef({ name: "../etc/passwd", filename: "../etc/passwd.md" });
    expect(() => validateReviewerDefinitions([def])).toThrow(ReviewerValidationError);
  });

  it("accepts name with hyphens and underscores", () => {
    const def = makeDef({ name: "code-style_check", filename: "code-style_check.md" });
    expect(() => validateReviewerDefinitions([def])).not.toThrow();
  });

  // multiple violations collected before throw
  it("collects multiple violations in a single throw", () => {
    const def1 = makeDef({ name: "security", filename: "other.md", purpose: "" });
    try {
      validateReviewerDefinitions([def1]);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ReviewerValidationError);
      // Both name-stem mismatch and missing purpose should be reported
      expect((e as ReviewerValidationError).violations.length).toBeGreaterThanOrEqual(2);
    }
  });
});
