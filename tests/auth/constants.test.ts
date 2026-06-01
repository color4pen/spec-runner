import { describe, it, expect, afterEach } from "vitest";
import { getGithubClientId } from "../../src/auth/constants.js";

describe("getGithubClientId", () => {
  afterEach(() => {
    delete process.env["SPECRUNNER_GITHUB_CLIENT_ID"];
  });

  it("returns hardcoded client_id when env is unset", () => {
    delete process.env["SPECRUNNER_GITHUB_CLIENT_ID"];
    const result = getGithubClientId();
    expect(result).toMatch(/^Iv23li/); // GitHub App client_id prefix
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns env value when SPECRUNNER_GITHUB_CLIENT_ID is set", () => {
    process.env["SPECRUNNER_GITHUB_CLIENT_ID"] = "Iv1.test123";
    const result = getGithubClientId();
    expect(result).toBe("Iv1.test123");
  });

  it("returns hardcoded client_id when env is empty string", () => {
    process.env["SPECRUNNER_GITHUB_CLIENT_ID"] = "";
    const result = getGithubClientId();
    expect(result).toMatch(/^Iv23li/); // GitHub App client_id prefix
  });
});
