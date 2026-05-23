/**
 * Unit tests for resolveStepRules (T-02, T-11)
 */
import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { resolveStepRules, type RulesResolveFs } from "../../../src/core/step/rules-resolve.js";

describe("resolveStepRules — file ordering", () => {
  it("returns file contents in numeric prefix ascending order (3 files)", async () => {
    const fs: RulesResolveFs = {
      readdir: async (_dir) => ["03-c.md", "01-a.md", "02-b.md"],
      readFile: async (_filePath, _enc) => {
        const name = path.basename(_filePath);
        if (name === "01-a.md") return "content-a";
        if (name === "02-b.md") return "content-b";
        if (name === "03-c.md") return "content-c";
        return "";
      },
    };

    const result = await resolveStepRules("design", "/project", fs);
    expect(result).toEqual(["content-a", "content-b", "content-c"]);
  });

  it("mixed numeric prefixes: 01-a.md, 10-b.md, 02-c.md → [a, c, b]", async () => {
    const fs: RulesResolveFs = {
      readdir: async (_dir) => ["10-b.md", "01-a.md", "02-c.md"],
      readFile: async (_filePath, _enc) => {
        const name = path.basename(_filePath);
        if (name === "01-a.md") return "a";
        if (name === "02-c.md") return "c";
        if (name === "10-b.md") return "b";
        return "";
      },
    };

    const result = await resolveStepRules("design", "/project", fs);
    expect(result).toEqual(["a", "c", "b"]);
  });

  it("files without numeric prefix are sorted to the end", async () => {
    const fs: RulesResolveFs = {
      readdir: async (_dir) => ["no-prefix.md", "01-a.md"],
      readFile: async (_filePath, _enc) => {
        const name = path.basename(_filePath);
        if (name === "01-a.md") return "content-a";
        if (name === "no-prefix.md") return "content-no-prefix";
        return "";
      },
    };

    const result = await resolveStepRules("design", "/project", fs);
    expect(result).toEqual(["content-a", "content-no-prefix"]);
  });
});

describe("resolveStepRules — directory not found", () => {
  it("returns empty array when directory does not exist (ENOENT)", async () => {
    const fs: RulesResolveFs = {
      readdir: async (_dir) => {
        const err = new Error("ENOENT: no such file or directory") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      },
      readFile: async () => "",
    };

    const result = await resolveStepRules("design", "/project", fs);
    expect(result).toEqual([]);
  });
});

describe("resolveStepRules — file extension filtering", () => {
  it("ignores non-.md files (.txt, .json)", async () => {
    const fs: RulesResolveFs = {
      readdir: async (_dir) => ["01-a.md", "02-b.txt", "03-c.json", "04-d.md"],
      readFile: async (_filePath, _enc) => {
        const name = path.basename(_filePath);
        if (name === "01-a.md") return "content-a";
        if (name === "04-d.md") return "content-d";
        return "";
      },
    };

    const result = await resolveStepRules("design", "/project", fs);
    expect(result).toEqual(["content-a", "content-d"]);
  });
});

describe("resolveStepRules — path construction", () => {
  it("calls readdir with path.join(cwd, specrunner/rules/<stepName>)", async () => {
    let capturedDir: string | undefined;
    const fs: RulesResolveFs = {
      readdir: async (dir) => {
        capturedDir = dir;
        return [];
      },
      readFile: async () => "",
    };

    await resolveStepRules("implementer", "/my/project", fs);
    expect(capturedDir).toBe(path.join("/my/project", "specrunner/rules/implementer"));
  });
});

// T-11: worktree environment test
describe("resolveStepRules — worktree environment", () => {
  it("resolves rules from a worktree-style cwd path", async () => {
    const worktreeCwd = "/home/user/.git/specrunner-worktrees/per-step-rule-followup-8ea29110";
    const expectedDir = path.join(worktreeCwd, "specrunner/rules/design");
    let capturedDir: string | undefined;
    let capturedFilePath: string | undefined;

    const fs: RulesResolveFs = {
      readdir: async (dir) => {
        capturedDir = dir;
        return ["01-style.md"];
      },
      readFile: async (filePath, _enc) => {
        capturedFilePath = filePath;
        return "style content";
      },
    };

    const result = await resolveStepRules("design", worktreeCwd, fs);

    expect(capturedDir).toBe(expectedDir);
    expect(capturedFilePath).toBe(path.join(worktreeCwd, "specrunner/rules/design/01-style.md"));
    expect(result).toEqual(["style content"]);
  });
});
