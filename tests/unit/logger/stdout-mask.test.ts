/**
 * Unit tests for maskSensitive in src/logger/stdout.ts
 *
 * Verifies that:
 * - sk-ant- keys with underscores in the body are fully masked (AC scenario 1)
 * - Uppercase sk-ant variants are masked case-insensitively (AC scenario 2)
 * - sk-proj keys with underscores in the body are fully masked (AC scenario 3)
 * - Non-secret strings pass through unchanged
 * - gho_ / ghr_ / etc. variants are still masked (regression guard)
 */
import { describe, it, expect } from "vitest";
import { maskSensitive } from "../../../src/logger/stdout.js";

describe("maskSensitive", () => {
  it("fully masks sk-ant- key body containing underscores (AC scenario 1)", () => {
    const result = maskSensitive("sk-ant-api03-abc_xyz123");
    expect(result).toBe("sk-ant-...");
    expect(result).not.toContain("abc");
    expect(result).not.toContain("xyz");
  });

  it("masks uppercase sk-ant variant case-insensitively (AC scenario 2)", () => {
    const result = maskSensitive("SK-ANT-api03-abc123");
    // Prefix case is preserved by $1 capture group
    expect(result).toBe("SK-ANT-...");
    expect(result).not.toContain("abc");
    expect(result).not.toContain("123");
  });

  it("fully masks sk-proj key body containing underscores (AC scenario 3)", () => {
    const result = maskSensitive("sk-proj-abc_def_ghi_jkl_mno_pqr");
    expect(result).toBe("sk-proj-...");
    expect(result).not.toContain("abc");
    expect(result).not.toContain("def");
  });

  it("returns non-secret strings unchanged", () => {
    expect(maskSensitive("hello world")).toBe("hello world");
    expect(maskSensitive("PATH=/usr/bin")).toBe("PATH=/usr/bin");
    expect(maskSensitive("")).toBe("");
  });

  it("masks gho_ token (regression guard for existing gh* behaviour)", () => {
    const result = maskSensitive("gho_ABCdef123");
    expect(result).toBe("gho_...");
    expect(result).not.toContain("ABCdef");
  });

  it("masks ghr_ token variant", () => {
    const result = maskSensitive("ghr_XYZabc456");
    expect(result).toBe("ghr_...");
  });

  it("masks github_pat_ token (regression guard)", () => {
    const result = maskSensitive("github_pat_abcDEF123_moreParts");
    expect(result).toBe("github_pat_...");
    expect(result).not.toContain("abcDEF");
  });

  it("masks sk-svcacct- token (regression guard)", () => {
    const result = maskSensitive("sk-svcacct-aaaaBBBBccccDDDDeeeeFFFf");
    expect(result).toBe("sk-svcacct-...");
  });

  it("masks embedded token in a longer string", () => {
    const result = maskSensitive("token=sk-ant-api03-abc_xyz123 is used here");
    expect(result).toBe("token=sk-ant-... is used here");
  });

  it("does not mask short sk- prefixed strings (under minimum length for generic sk- rule)", () => {
    // The generic sk- rule requires 20+ chars after the prefix
    const result = maskSensitive("sk-short");
    expect(result).toBe("sk-short");
  });
});
