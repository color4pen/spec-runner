/**
 * TC-055: check that throws → fail result (no propagation)
 * TC-056: checks run in declaration order (sequential)
 * TC-080: runner adds name/category/required to results
 */
import { describe, it, expect, vi } from "vitest";
import { runChecks } from "../../../src/core/doctor/runner.js";
import type { DoctorCheck } from "../../../src/core/doctor/types.js";
import { buildMockContext } from "./mock-context.js";

function makePassCheck(name: string): DoctorCheck {
  return {
    name,
    category: "runtime",
    required: true,
    check: vi.fn().mockResolvedValue({ status: "pass", message: `${name} passed` }),
  };
}

function makeThrowingCheck(name: string): DoctorCheck {
  return {
    name,
    category: "runtime",
    required: true,
    check: vi.fn().mockRejectedValue(new Error("unexpected error")),
  };
}

describe("runChecks", () => {
  // TC-056: sequential order
  it("returns results in declaration order", async () => {
    const checkA = makePassCheck("a");
    const checkB = makePassCheck("b");
    const checkC = makePassCheck("c");
    const ctx = buildMockContext();
    const results = await runChecks([checkA, checkB, checkC], ctx);
    expect(results.map((r) => r.name)).toEqual(["a", "b", "c"]);
  });

  // TC-055: throw → fail result
  it("catches check throws and returns fail result without propagating", async () => {
    const throwingCheck = makeThrowingCheck("bad-check");
    const ctx = buildMockContext();
    const results = await runChecks([throwingCheck], ctx);
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("fail");
    expect(results[0]!.message).toContain("unexpected error");
  });

  it("continues running remaining checks after a throw", async () => {
    const throwingCheck = makeThrowingCheck("bad");
    const passCheck = makePassCheck("good");
    const ctx = buildMockContext();
    const results = await runChecks([throwingCheck, passCheck], ctx);
    expect(results).toHaveLength(2);
    expect(results[0]!.status).toBe("fail");
    expect(results[1]!.status).toBe("pass");
  });

  // TC-080: name/category/required are preserved in result
  it("merges name, category, required into each result", async () => {
    const check: DoctorCheck = {
      name: "test-check",
      category: "runtime",
      required: true,
      check: vi.fn().mockResolvedValue({ status: "pass", message: "ok" }),
    };
    const ctx = buildMockContext();
    const results = await runChecks([check], ctx);
    expect(results[0]!.name).toBe("test-check");
    expect(results[0]!.category).toBe("runtime");
    expect(results[0]!.required).toBe(true);
  });
});
