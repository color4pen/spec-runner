/**
 * Unit tests for src/util/env-filter.ts
 *
 * (a) denylist keys are removed
 * (b) non-denylist keys are preserved
 * (c) original env object is not mutated (immutability)
 * (d) missing denylist keys do not cause errors
 */
import { describe, it, expect } from "vitest";
import { stripSecrets, SECRET_DENYLIST } from "../../../src/util/env-filter.js";

describe("stripSecrets", () => {
  it("(a) removes all denylist keys", () => {
    const env: Record<string, string | undefined> = {
      GITHUB_TOKEN: "ghp_abc",
      SPECRUNNER_API_KEY: "sk-sr",
      ANTHROPIC_API_KEY: "sk-ant",
      ANTHROPIC_BASE_URL: "https://custom.example.com",
      PATH: "/usr/bin",
    };
    const result = stripSecrets(env);
    for (const key of SECRET_DENYLIST) {
      expect(result[key]).toBeUndefined();
    }
  });

  it("(b) preserves non-denylist keys", () => {
    const env: Record<string, string | undefined> = {
      GITHUB_TOKEN: "ghp_abc",
      PATH: "/usr/bin",
      HOME: "/home/user",
      MY_APP_VAR: "value",
    };
    const result = stripSecrets(env);
    expect(result["PATH"]).toBe("/usr/bin");
    expect(result["HOME"]).toBe("/home/user");
    expect(result["MY_APP_VAR"]).toBe("value");
  });

  it("(c) does not mutate the original env object", () => {
    const env: Record<string, string | undefined> = {
      GITHUB_TOKEN: "ghp_abc",
      PATH: "/usr/bin",
    };
    const original = { ...env };
    stripSecrets(env);
    expect(env).toEqual(original);
  });

  it("(d) does not throw when denylist keys are absent", () => {
    const env: Record<string, string | undefined> = {
      PATH: "/usr/bin",
      HOME: "/home/user",
    };
    expect(() => stripSecrets(env)).not.toThrow();
    const result = stripSecrets(env);
    expect(result["PATH"]).toBe("/usr/bin");
  });
});
