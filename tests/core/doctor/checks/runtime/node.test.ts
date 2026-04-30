/**
 * TC-001: node >= 18 → pass
 * TC-002: node < 18 → fail
 * TC-069: v18.0.0 boundary → pass
 * TC-070: v17.9.1 boundary → fail
 */
import { describe, it, expect } from "vitest";
import { nodeVersionCheck } from "../../../../../src/core/doctor/checks/runtime/node.js";
import { buildMockContext } from "../../mock-context.js";

describe("nodeVersionCheck", () => {
  // TC-001
  it("returns pass when processVersion is v20.0.0", async () => {
    const ctx = buildMockContext({ processVersion: "v20.0.0" });
    const result = await nodeVersionCheck.check(ctx);
    expect(result.status).toBe("pass");
  });

  // TC-002
  it("returns fail when processVersion is v16.0.0", async () => {
    const ctx = buildMockContext({ processVersion: "v16.0.0" });
    const result = await nodeVersionCheck.check(ctx);
    expect(result.status).toBe("fail");
    expect(result.hint).toBeDefined();
    expect(result.hint).toMatch(/[Uu]pgrade/i);
  });

  // TC-069
  it("returns pass at boundary v18.0.0", async () => {
    const ctx = buildMockContext({ processVersion: "v18.0.0" });
    const result = await nodeVersionCheck.check(ctx);
    expect(result.status).toBe("pass");
  });

  // TC-070
  it("returns fail for v17.9.1", async () => {
    const ctx = buildMockContext({ processVersion: "v17.9.1" });
    const result = await nodeVersionCheck.check(ctx);
    expect(result.status).toBe("fail");
  });
});
