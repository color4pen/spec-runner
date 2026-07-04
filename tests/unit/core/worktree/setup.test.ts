/**
 * Unit tests for resolveWorkspaceSetupPlan.
 *
 * TC-WSP-001: setup defined with string commands → { kind: "commands", commands: normalized }
 * TC-WSP-002: setup defined with object commands → { kind: "commands", commands: with name/run }
 * TC-WSP-003: setup is empty array → { kind: "commands", commands: [] } (explicit skip)
 * TC-WSP-004: setup undefined + hasJsTraces → { kind: "detect-install" }
 * TC-WSP-005: setup undefined + no JS traces → { kind: "skip" }
 * TC-WSP-006: string command normalized to { run }
 * TC-WSP-007: object command with name preserved
 * TC-WSP-008: object command without name — name field absent
 */
import { describe, it, expect } from "vitest";
import { resolveWorkspaceSetupPlan } from "../../../../src/core/worktree/setup.js";

// TC-WSP-001: string commands → commands plan
describe("TC-WSP-001: string commands → { kind: 'commands' }", () => {
  it("returns commands plan when setup is string array", () => {
    const result = resolveWorkspaceSetupPlan(["uv sync"], false);
    expect(result.kind).toBe("commands");
    if (result.kind === "commands") {
      expect(result.commands).toEqual([{ run: "uv sync" }]);
    }
  });

  it("returns commands plan with multiple strings", () => {
    const result = resolveWorkspaceSetupPlan(["go mod download", "go build ./..."], true);
    expect(result.kind).toBe("commands");
    if (result.kind === "commands") {
      expect(result.commands).toEqual([
        { run: "go mod download" },
        { run: "go build ./..." },
      ]);
    }
  });
});

// TC-WSP-002: object commands → commands plan
describe("TC-WSP-002: object commands → { kind: 'commands' }", () => {
  it("returns commands plan with named object command", () => {
    const result = resolveWorkspaceSetupPlan([{ name: "deps", run: "go mod download" }], false);
    expect(result.kind).toBe("commands");
    if (result.kind === "commands") {
      expect(result.commands).toEqual([{ name: "deps", run: "go mod download" }]);
    }
  });

  it("returns commands plan with object without name", () => {
    const result = resolveWorkspaceSetupPlan([{ run: "pip install -r requirements.txt" }], false);
    expect(result.kind).toBe("commands");
    if (result.kind === "commands") {
      expect(result.commands[0]).toEqual({ run: "pip install -r requirements.txt" });
      expect(result.commands[0]!.name).toBeUndefined();
    }
  });
});

// TC-WSP-003: empty array → commands plan with empty commands (explicit skip)
describe("TC-WSP-003: empty array → { kind: 'commands', commands: [] }", () => {
  it("returns commands plan with empty list when setup is [] (explicit skip)", () => {
    const result = resolveWorkspaceSetupPlan([], true);
    expect(result.kind).toBe("commands");
    if (result.kind === "commands") {
      expect(result.commands).toEqual([]);
    }
  });

  it("empty array is treated as explicit skip even with JS traces", () => {
    const result = resolveWorkspaceSetupPlan([], true);
    expect(result.kind).toBe("commands"); // not detect-install
  });
});

// TC-WSP-004: setup undefined + JS traces → detect-install
describe("TC-WSP-004: setup undefined + hasJsTraces → { kind: 'detect-install' }", () => {
  it("returns detect-install when setup is undefined and JS traces exist", () => {
    const result = resolveWorkspaceSetupPlan(undefined, true);
    expect(result).toEqual({ kind: "detect-install" });
  });
});

// TC-WSP-005: setup undefined + no JS traces → skip
describe("TC-WSP-005: setup undefined + no JS traces → { kind: 'skip' }", () => {
  it("returns skip when setup is undefined and no JS traces", () => {
    const result = resolveWorkspaceSetupPlan(undefined, false);
    expect(result).toEqual({ kind: "skip" });
  });
});

// TC-WSP-006: string normalization
describe("TC-WSP-006: string command normalized to { run }", () => {
  it("string command becomes { run: string } with no name property", () => {
    const result = resolveWorkspaceSetupPlan(["uv sync"], false);
    expect(result.kind).toBe("commands");
    if (result.kind === "commands") {
      const cmd = result.commands[0]!;
      expect(cmd.run).toBe("uv sync");
      expect(cmd.name).toBeUndefined();
    }
  });
});

// TC-WSP-007: object command with name
describe("TC-WSP-007: object command with name preserved", () => {
  it("preserves name field from object command", () => {
    const result = resolveWorkspaceSetupPlan([{ name: "install", run: "uv sync" }], false);
    expect(result.kind).toBe("commands");
    if (result.kind === "commands") {
      expect(result.commands[0]).toEqual({ name: "install", run: "uv sync" });
    }
  });
});

// TC-WSP-008: object command without name
describe("TC-WSP-008: object command without name — name field absent", () => {
  it("does not include name field when object has no name", () => {
    const result = resolveWorkspaceSetupPlan([{ run: "go mod download" }], false);
    expect(result.kind).toBe("commands");
    if (result.kind === "commands") {
      const cmd = result.commands[0]!;
      expect(cmd.run).toBe("go mod download");
      expect("name" in cmd && cmd.name).toBeFalsy();
    }
  });
});

// Mixed string + object
describe("resolveWorkspaceSetupPlan: mixed string and object commands", () => {
  it("normalizes mixed list correctly", () => {
    const result = resolveWorkspaceSetupPlan(
      ["uv sync", { name: "test", run: "pytest" }, { run: "mypy" }],
      false,
    );
    expect(result.kind).toBe("commands");
    if (result.kind === "commands") {
      expect(result.commands).toEqual([
        { run: "uv sync" },
        { name: "test", run: "pytest" },
        { run: "mypy" },
      ]);
    }
  });
});
