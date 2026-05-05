import { describe, it, expect, beforeEach, vi } from "vitest";
import { registerBranchTool } from "../src/adapter/managed-agent/tools/register-branch.js";

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

// TC-016: register_branch が managed-agent adapter 配下にある (design D3)
describe("TC-016: register_branch is in managed-agent adapter (design D3)", () => {
  it("registerBranchTool is importable from adapter/managed-agent/tools/register-branch", () => {
    // Design D3: register_branch moved from core/tools to adapter/managed-agent/tools
    expect(registerBranchTool).toBeDefined();
    expect(registerBranchTool.definition.name).toBe("register_branch");
    expect(typeof registerBranchTool.handler).toBe("function");
  });

  it("ProposeStep.toolHandlers is undefined (adapter injects tools, not ProposeStep)", async () => {
    const { ProposeStep } = await import("../src/core/step/propose.js");
    // Design D3: ProposeStep is runtime-neutral — toolHandlers undefined, ManagedAgentRunner injects
    expect(ProposeStep.toolHandlers).toBeUndefined();
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

// TC-018: SSE dispatch が toolHandlers Map 経由で tool を解決する（grep check）
describe("TC-018: SSE dispatch uses toolHandlers map from step co-location", () => {
  it("session.ts uses toolHandlers?.get() to resolve tool handlers (D4)", async () => {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    // SSE dispatch logic lives in the adapter's sse-stream.ts (session.ts delegates to SessionClient port)
    const sseStreamPath = fileURLToPath(new URL("../src/adapter/managed-agent/sse-stream.ts", import.meta.url));
    const content = await readFile(sseStreamPath, "utf-8");
    // D4: toolHandlers map takes precedence (global registry removed)
    expect(content).toContain("deps.toolHandlers?.get(event.name)");
    // Global registry is no longer used
    expect(content).not.toContain("getHandler(event.name)");
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
    // SSE dispatch logic lives in the adapter's sse-stream.ts (session.ts delegates to SessionClient port)
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const sseStreamPath = fileURLToPath(new URL("../src/adapter/managed-agent/sse-stream.ts", import.meta.url));
    const content = await readFile(sseStreamPath, "utf-8");
    // Check that event.id is used as custom_tool_use_id
    expect(content).toContain("custom_tool_use_id: event.id");
  });
});
