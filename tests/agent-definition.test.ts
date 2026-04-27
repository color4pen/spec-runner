import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

// TC-070: Agent 定義ハッシュ — 同一定義は同一ハッシュ
describe("TC-070: Agent definition hash — same definition produces same hash", () => {
  it("computeDefinitionHash returns identical hash on repeated calls", async () => {
    const { bootstrapTools } = await import("../src/core/tools/index.js");
    const { resetRegistry } = await import("../src/core/tools/registry.js");
    resetRegistry();
    bootstrapTools();

    const { buildAgentDefinition, computeDefinitionHash } = await import(
      "../src/core/agent-definition.js"
    );

    const def1 = buildAgentDefinition();
    const def2 = buildAgentDefinition();

    const hash1 = computeDefinitionHash(def1);
    const hash2 = computeDefinitionHash(def2);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});

// TC-071: Agent 定義ハッシュ — フィールド順序差を吸収する
describe("TC-071: Agent definition hash — absorbs field order differences", () => {
  it("canonicalJson produces the same hash for objects with different key order", async () => {
    const { canonicalJson, computeDefinitionHash } = await import(
      "../src/core/agent-definition.js"
    );

    const objA = { name: "test", model: "claude", tools: [{ type: "a" }, { type: "b" }] };
    const objB = { tools: [{ type: "a" }, { type: "b" }], model: "claude", name: "test" };

    const canonA = canonicalJson(objA);
    const canonB = canonicalJson(objB);

    // Canonical JSON should be identical regardless of key order
    expect(canonA).toBe(canonB);

    // Both should produce the same hash when passed as definition
    // (using a stable mock definition to test the hash stability)
    const { createHash } = await import("node:crypto");
    const hashA = "sha256:" + createHash("sha256").update(canonA).digest("hex");
    const hashB = "sha256:" + createHash("sha256").update(canonB).digest("hex");
    expect(hashA).toBe(hashB);
  });
});
