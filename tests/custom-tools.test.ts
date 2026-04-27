import { describe, it, expect, beforeEach, vi } from "vitest";
import { registerCustomTool, getDefinitions, getHandler, resetRegistry } from "../src/core/tools/registry.js";
import { registerBranchTool } from "../src/core/tools/register-branch.js";
import { bootstrapTools } from "../src/core/tools/index.js";

beforeEach(() => {
  resetRegistry();
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

// TC-016: register_branch が registry 経由で登録される
describe("TC-016: register_branch registered via registry", () => {
  it("getDefinitions includes register_branch and getHandler returns function", () => {
    bootstrapTools();

    const definitions = getDefinitions();
    const found = definitions.find((d) => d.name === "register_branch");
    expect(found).toBeDefined();
    expect(found?.name).toBe("register_branch");

    const handler = getHandler("register_branch");
    expect(typeof handler).toBe("function");
  });
});

// TC-017: `name: "register_branch"` が register-branch.ts 以外に存在しない（grep）
describe("TC-017: register_branch string only in register-branch.ts", () => {
  it("grep check: name register_branch not in other source files", async () => {
    const { readdir, readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");

    const srcDir = fileURLToPath(new URL("../src", import.meta.url));
    const binDir = fileURLToPath(new URL("../bin", import.meta.url));

    async function collectFiles(dir: string): Promise<string[]> {
      const files: string[] = [];
      try {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            files.push(...(await collectFiles(fullPath)));
          } else if (entry.name.endsWith(".ts")) {
            files.push(fullPath);
          }
        }
      } catch {
        // Directory may not exist
      }
      return files;
    }

    const allFiles = [...(await collectFiles(srcDir)), ...(await collectFiles(binDir))];
    const PATTERN = 'name: "register_branch"';

    for (const file of allFiles) {
      if (file.includes("register-branch.ts")) continue;
      const content = await readFile(file, "utf-8");
      if (content.includes(PATTERN)) {
        throw new Error(`Found "${PATTERN}" in unexpected file: ${file}`);
      }
    }
    // If no error thrown, test passes
    expect(true).toBe(true);
  });
});

// TC-018: SSE dispatch も registry から取得する（grep check）
describe("TC-018: SSE dispatch uses getHandler from registry", () => {
  it("session.ts uses getHandler to resolve tool handlers", async () => {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const sessionPath = fileURLToPath(new URL("../src/core/session.ts", import.meta.url));
    const content = await readFile(sessionPath, "utf-8");
    expect(content).toContain("getHandler(event.name)");
    // Should not directly import handler from register-branch
    expect(content).not.toContain('from "./tools/register-branch');
  });
});

// TC-019: register_branch handler — 正常呼び出し（1 回）
describe("TC-019: register_branch handler — single call", () => {
  it("sets branch and returns ok: true", async () => {
    const handler = registerBranchTool.handler;
    const result = await handler({ branch: "feat/x" }, { sessionId: "test" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result["branch"]).toBe("feat/x");
    }
  });
});

// TC-020: register_branch handler — 連続呼び出し（last-write-wins）
describe("TC-020: register_branch handler — last-write-wins", () => {
  it("last branch value wins", async () => {
    const handler = registerBranchTool.handler;
    const ctx = { sessionId: "test" };
    const result1 = await handler({ branch: "a" }, ctx);
    const result2 = await handler({ branch: "b" }, ctx);
    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
    if (result2.ok) {
      expect(result2["branch"]).toBe("b");
    }
  });
});

// TC-021: register_branch handler — 空文字列入力を拒否
describe("TC-021: register_branch handler — empty string rejected", () => {
  it("returns ok: false with error message", async () => {
    const handler = registerBranchTool.handler;
    const result = await handler({ branch: "" }, { sessionId: "test" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("branch must be a non-empty string");
    }
  });
});

// TC-022: register_branch handler — branch プロパティ欠落を拒否
describe("TC-022: register_branch handler — missing branch property", () => {
  it("returns ok: false with error message", async () => {
    const handler = registerBranchTool.handler;
    const result = await handler({}, { sessionId: "test" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("branch must be a non-empty string");
    }
  });
});

// TC-023: register_branch — definition が決定論的に生成される
describe("TC-023: register_branch definition is deterministic", () => {
  it("JSON.stringify produces same result on multiple calls", () => {
    const s1 = JSON.stringify(registerBranchTool.definition);
    const s2 = JSON.stringify(registerBranchTool.definition);
    expect(s1).toBe(s2);
  });
});

// TC-025: register_branch — custom_tool_result id 対応
describe("TC-025: register_branch — custom_tool_result id mapping", () => {
  it("verifies session.ts sends matching custom_tool_use_id in result", async () => {
    // This verifies the implementation design via source inspection
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const sessionPath = fileURLToPath(new URL("../src/core/session.ts", import.meta.url));
    const content = await readFile(sessionPath, "utf-8");
    // Check that event.id is used as custom_tool_use_id
    expect(content).toContain("custom_tool_use_id: event.id");
  });
});
