import { describe, expect, it } from "vitest";
import {
  getStepExecutionConfig,
  traceStepExecutionConfig,
} from "../../src/config/step-config.js";
import type { SpecRunnerConfig } from "../../src/config/schema.js";

function makeConfig(steps: SpecRunnerConfig["steps"]): SpecRunnerConfig {
  return {
    version: 1,
    runtime: "local",
    agents: {},
    steps,
  };
}

describe("traceStepExecutionConfig", () => {
  it("reports observed case: user step byRequestType beats project defaults", () => {
    const config = makeConfig({
      defaults: { model: "gpt-5.5" },
      design: {
        byRequestType: {
          "bug-fix": { model: "claude-sonnet-4-6" },
        },
      },
    });

    const traced = traceStepExecutionConfig(
      config,
      "design",
      { model: "claude-opus-4-6[1m]", maxTurns: 15 },
      "bug-fix",
      {
        userGlobal: {
          path: "/home/user/.config/specrunner/config.json",
          migrated: {
            steps: {
              design: {
                byRequestType: {
                  "bug-fix": { model: "claude-sonnet-4-6" },
                },
              },
            },
          },
        },
        projectLocal: {
          path: "/repo/.specrunner/config.json",
          migrated: {
            steps: {
              defaults: { model: "gpt-5.5" },
            },
          },
        },
      },
    );

    expect(traced.fields.model.value).toBe("claude-sonnet-4-6");
    expect(traced.fields.model.source).toMatchObject({
      layer: "user",
      level: "step.byRequestType",
      path: "steps.design.byRequestType.bug-fix.model",
    });
  });

  it("changes trace when request type changes", () => {
    const config = makeConfig({
      defaults: {
        model: "claude-sonnet-4-6",
        byRequestType: {
          "bug-fix": { model: "claude-opus-4-6" },
        },
      },
    });

    const bugFix = traceStepExecutionConfig(config, "implementer", { model: "claude-haiku-4-5" }, "bug-fix", {
      projectLocal: { path: "/repo/.specrunner/config.json", migrated: config },
    });
    const chore = traceStepExecutionConfig(config, "implementer", { model: "claude-haiku-4-5" }, "chore", {
      projectLocal: { path: "/repo/.specrunner/config.json", migrated: config },
    });

    expect(bugFix.fields.model.value).toBe("claude-opus-4-6");
    expect(bugFix.fields.model.source.level).toBe("defaults.byRequestType");
    expect(chore.fields.model.value).toBe("claude-sonnet-4-6");
    expect(chore.fields.model.source.level).toBe("defaults");
  });

  it("reports stepdef for hardcoded model fallback and sdk for unset nullable fields", () => {
    const config = makeConfig(undefined);

    const traced = traceStepExecutionConfig(config, "request-review", {
      model: "claude-sonnet-4-6",
    });

    expect(traced.fields.model).toEqual({
      value: "claude-sonnet-4-6",
      source: { layer: "stepdef", level: "stepdef", path: null },
    });
    expect(traced.fields.maxTurns).toEqual({
      value: null,
      source: { layer: "sdk", level: "sdk", path: null },
    });
    expect(traced.fields.timeoutMs).toEqual({
      value: null,
      source: { layer: "sdk", level: "sdk", path: null },
    });
  });

  it("treats null as a winning value for nullable fields", () => {
    const config = makeConfig({
      defaults: { maxTurns: 30, timeoutMs: 1000 },
      implementer: { maxTurns: null, timeoutMs: null },
    });

    const traced = traceStepExecutionConfig(config, "implementer", {
      model: "claude-sonnet-4-6",
      maxTurns: 60,
      timeoutMs: 2000,
    }, undefined, {
      projectLocal: { path: "/repo/.specrunner/config.json", migrated: config },
    });

    expect(traced.fields.maxTurns.value).toBeNull();
    expect(traced.fields.maxTurns.source).toMatchObject({ layer: "project", level: "step" });
    expect(traced.fields.timeoutMs.value).toBeNull();
    expect(traced.fields.timeoutMs.source).toMatchObject({ layer: "project", level: "step" });
  });

  it("traced effective values match getStepExecutionConfig", () => {
    const config = makeConfig({
      defaults: { model: "claude-sonnet-4-6", maxTurns: 20, timeoutMs: 5000 },
      "code-review": {
        byRequestType: {
          "spec-change": { model: "claude-opus-4-6[1m]", maxTurns: null },
        },
      },
    });
    const stepDefaults = { model: "claude-haiku-4-5", maxTurns: 15 };

    const resolved = getStepExecutionConfig(config, "code-review", stepDefaults, "spec-change");
    const traced = traceStepExecutionConfig(config, "code-review", stepDefaults, "spec-change", {
      projectLocal: { path: "/repo/.specrunner/config.json", migrated: config },
    });

    expect({
      model: traced.fields.model.value,
      maxTurns: traced.fields.maxTurns.value,
      timeoutMs: traced.fields.timeoutMs.value,
    }).toEqual(resolved);
  });
});
