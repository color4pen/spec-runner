/**
 * TC-033: all 7 agents registered → pass
 * TC-034: 1 agent missing → fail with name
 */
import { describe, it, expect } from "vitest";
import { agentsRegisteredCheck } from "../../../../../src/core/doctor/checks/agents/agents-registered.js";
import { buildMockContext, buildMockConfig } from "../../mock-context.js";

const fullAgentsConfig = {
  "propose": { agentId: "a1", definitionHash: "sha256:a" },
  "spec-review": { agentId: "a2", definitionHash: "sha256:b" },
  "spec-fixer": { agentId: "a3", definitionHash: "sha256:c" },
  "implementer": { agentId: "a4", definitionHash: "sha256:d" },
  "build-fixer": { agentId: "a5", definitionHash: "sha256:e" },
  "code-review": { agentId: "a6", definitionHash: "sha256:f" },
  "code-fixer": { agentId: "a7", definitionHash: "sha256:g" },
};

describe("agentsRegisteredCheck", () => {
  // TC-033
  it("returns pass when all 7 agents are registered", async () => {
    const ctx = buildMockContext({
      config: buildMockConfig({ agents: fullAgentsConfig }),
    });
    const result = await agentsRegisteredCheck.check(ctx);
    expect(result.status).toBe("pass");
  });

  // TC-034
  it("returns fail when 'implementer' is missing", async () => {
    const agentsWithoutImplementer = { ...fullAgentsConfig };
    delete (agentsWithoutImplementer as Record<string, unknown>)["implementer"];
    const ctx = buildMockContext({
      config: buildMockConfig({ agents: agentsWithoutImplementer }),
    });
    const result = await agentsRegisteredCheck.check(ctx);
    expect(result.status).toBe("fail");
    expect(result.message).toContain("implementer");
  });
});
