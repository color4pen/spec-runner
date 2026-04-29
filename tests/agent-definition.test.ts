import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

// TC-070: Agent 定義ハッシュ — 同一定義は同一ハッシュ
describe("TC-070: Agent definition hash — same definition produces same hash", () => {
  it("hashObject returns identical hash on repeated calls with ProposeStep.agent", async () => {
    const { hashObject } = await import("../src/core/agent/hash.js");
    const { ProposeStep } = await import("../src/core/step/propose.js");

    const hash1 = hashObject(ProposeStep.agent);
    const hash2 = hashObject(ProposeStep.agent);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});

// TC-071: Agent 定義ハッシュ — フィールド順序差を吸収する
describe("TC-071: Agent definition hash — absorbs field order differences", () => {
  it("canonicalJson produces the same hash for objects with different key order", async () => {
    const { canonicalJson, hashObject } = await import("../src/core/agent/hash.js");

    const objA = { name: "test", model: "claude", tools: [{ type: "a" }, { type: "b" }] };
    const objB = { tools: [{ type: "a" }, { type: "b" }], model: "claude", name: "test" };

    const canonA = canonicalJson(objA);
    const canonB = canonicalJson(objB);

    // Canonical JSON should be identical regardless of key order
    expect(canonA).toBe(canonB);

    // Both should produce the same hash
    const hashA = hashObject(objA);
    const hashB = hashObject(objB);
    expect(hashA).toBe(hashB);
  });
});
