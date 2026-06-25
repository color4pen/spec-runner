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
      GH_TOKEN: "ghp_secret",
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
    expect(result["GH_TOKEN"]).toBeUndefined();
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

  it("(e) removes pattern-matched keys (*_TOKEN / *_API_KEY / *_SECRET)", () => {
    const env: Record<string, string | undefined> = {
      MY_CORP_TOKEN: "v1",
      SVC_API_KEY: "v2",
      DB_SECRET: "v3",
      PATH: "/usr",
    };
    const result = stripSecrets(env);
    expect(result["MY_CORP_TOKEN"]).toBeUndefined();
    expect(result["SVC_API_KEY"]).toBeUndefined();
    expect(result["DB_SECRET"]).toBeUndefined();
    expect(result["PATH"]).toBe("/usr");
  });

  it("(f) preserves benign variables (PATH, HOME, XDG_*, SPECRUNNER_DEBUG)", () => {
    const env: Record<string, string | undefined> = {
      GH_TOKEN: "ghp_secret",
      ANTHROPIC_API_KEY: "sk-ant-secret",
      PATH: "/usr/bin",
      HOME: "/home/user",
      XDG_CONFIG_HOME: "/home/user/.config",
      SPECRUNNER_DEBUG: "pipeline",
    };
    const result = stripSecrets(env);
    expect(result["GH_TOKEN"]).toBeUndefined();
    expect(result["ANTHROPIC_API_KEY"]).toBeUndefined();
    expect(result["PATH"]).toBe("/usr/bin");
    expect(result["HOME"]).toBe("/home/user");
    expect(result["XDG_CONFIG_HOME"]).toBe("/home/user/.config");
    expect(result["SPECRUNNER_DEBUG"]).toBe("pipeline");
  });
});
