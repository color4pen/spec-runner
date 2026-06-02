import { describe, it, expect } from "vitest";
import { resolveGitHubHost, resolveGitHubApiBaseUrl } from "../github-host.js";

describe("resolveGitHubHost", () => {
  it("returns github.com when config is undefined", () => {
    expect(resolveGitHubHost(undefined)).toBe("github.com");
  });

  it("returns github.com when host is not set", () => {
    expect(resolveGitHubHost({})).toBe("github.com");
  });

  it("returns the configured host", () => {
    expect(resolveGitHubHost({ host: "ghes.corp.example.com" })).toBe("ghes.corp.example.com");
  });
});

describe("resolveGitHubApiBaseUrl", () => {
  it("returns public API URL when config is undefined", () => {
    expect(resolveGitHubApiBaseUrl(undefined)).toBe("https://api.github.com");
  });

  it("returns public API URL when host is github.com", () => {
    expect(resolveGitHubApiBaseUrl({ host: "github.com" })).toBe("https://api.github.com");
  });

  it("returns public API URL when config is empty object", () => {
    expect(resolveGitHubApiBaseUrl({})).toBe("https://api.github.com");
  });

  it("derives GHES API URL from host", () => {
    expect(resolveGitHubApiBaseUrl({ host: "ghes.corp.example.com" })).toBe(
      "https://ghes.corp.example.com/api/v3",
    );
  });

  it("uses apiBaseUrl when set, regardless of host", () => {
    expect(
      resolveGitHubApiBaseUrl({ host: "ghes.example.com", apiBaseUrl: "https://override/api" }),
    ).toBe("https://override/api");
  });

  it("strips trailing slash from apiBaseUrl", () => {
    expect(resolveGitHubApiBaseUrl({ apiBaseUrl: "https://custom.proxy/gh/" })).toBe(
      "https://custom.proxy/gh",
    );
  });

  it("uses apiBaseUrl without host", () => {
    expect(resolveGitHubApiBaseUrl({ apiBaseUrl: "https://custom.proxy/gh" })).toBe(
      "https://custom.proxy/gh",
    );
  });
});
