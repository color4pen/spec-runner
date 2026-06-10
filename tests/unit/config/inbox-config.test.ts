/**
 * T-01 (acceptance tests): InboxConfig schema validation and default resolution.
 *
 * - Valid inbox config passes validation
 * - Invalid values (empty approveLabel, negative/non-integer maxStartsPerRun) throw CONFIG_INVALID
 * - Defaults are applied when inbox section is absent
 * - Existing configs without inbox load correctly (regression)
 */
import { describe, it, expect } from "vitest";
import { validateConfig } from "../../../src/config/schema.js";
import {
  resolveInboxConfig,
  DEFAULT_INBOX_APPROVE_LABEL,
  DEFAULT_INBOX_MAX_STARTS_PER_RUN,
} from "../../../src/config/schema.js";
import type { SpecRunnerConfig } from "../../../src/config/schema.js";

function baseRaw(): Record<string, unknown> {
  return { version: 1, agents: {} };
}

describe("inbox config schema", () => {
  it("accepts valid inbox config with approveLabel and maxStartsPerRun", () => {
    const raw = {
      ...baseRaw(),
      inbox: { approveLabel: "my-label", maxStartsPerRun: 5 },
    };
    const cfg = validateConfig(raw);
    expect(cfg.inbox?.approveLabel).toBe("my-label");
    expect(cfg.inbox?.maxStartsPerRun).toBe(5);
  });

  it("accepts maxStartsPerRun: 0 (resume-only mode)", () => {
    const raw = { ...baseRaw(), inbox: { maxStartsPerRun: 0 } };
    const cfg = validateConfig(raw);
    expect(cfg.inbox?.maxStartsPerRun).toBe(0);
  });

  it("rejects empty string approveLabel with CONFIG_INVALID", () => {
    const raw = { ...baseRaw(), inbox: { approveLabel: "" } };
    expect(() => validateConfig(raw)).toThrow("CONFIG_INVALID");
  });

  it("rejects negative maxStartsPerRun with CONFIG_INVALID", () => {
    const raw = { ...baseRaw(), inbox: { maxStartsPerRun: -1 } };
    expect(() => validateConfig(raw)).toThrow("CONFIG_INVALID");
  });

  it("rejects non-integer maxStartsPerRun with CONFIG_INVALID", () => {
    const raw = { ...baseRaw(), inbox: { maxStartsPerRun: 1.5 } };
    expect(() => validateConfig(raw)).toThrow("CONFIG_INVALID");
  });

  it("accepts inbox absent (backward compat)", () => {
    const raw = baseRaw();
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("accepts partial inbox (only approveLabel)", () => {
    const raw = { ...baseRaw(), inbox: { approveLabel: "foo" } };
    const cfg = validateConfig(raw);
    expect(cfg.inbox?.approveLabel).toBe("foo");
    expect(cfg.inbox?.maxStartsPerRun).toBeUndefined();
  });
});

describe("resolveInboxConfig", () => {
  it("applies DEFAULT_INBOX_APPROVE_LABEL when inbox absent", () => {
    const cfg = { version: 1, agents: {} } as SpecRunnerConfig;
    const resolved = resolveInboxConfig(cfg);
    expect(resolved.approveLabel).toBe(DEFAULT_INBOX_APPROVE_LABEL);
    expect(resolved.approveLabel).toBe("specrunner-approved");
  });

  it("applies DEFAULT_INBOX_MAX_STARTS_PER_RUN when inbox absent", () => {
    const cfg = { version: 1, agents: {} } as SpecRunnerConfig;
    const resolved = resolveInboxConfig(cfg);
    expect(resolved.maxStartsPerRun).toBe(DEFAULT_INBOX_MAX_STARTS_PER_RUN);
    expect(resolved.maxStartsPerRun).toBe(3);
  });

  it("returns configured approveLabel when set", () => {
    const cfg = { version: 1, agents: {}, inbox: { approveLabel: "custom-label" } } as SpecRunnerConfig;
    const resolved = resolveInboxConfig(cfg);
    expect(resolved.approveLabel).toBe("custom-label");
  });

  it("returns configured maxStartsPerRun when set", () => {
    const cfg = { version: 1, agents: {}, inbox: { maxStartsPerRun: 10 } } as SpecRunnerConfig;
    const resolved = resolveInboxConfig(cfg);
    expect(resolved.maxStartsPerRun).toBe(10);
  });

  it("maxStartsPerRun: 0 is preserved (not treated as falsy)", () => {
    const cfg = { version: 1, agents: {}, inbox: { maxStartsPerRun: 0 } } as SpecRunnerConfig;
    const resolved = resolveInboxConfig(cfg);
    expect(resolved.maxStartsPerRun).toBe(0);
  });
});
