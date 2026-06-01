import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  requestDeviceCode,
  pollAccessToken,
} from "../src/auth/github-device.js";

let originalClientIdEnv: string | undefined;

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  // Stub client_id so tests don't hit GitHub with the real built-in default.
  originalClientIdEnv = process.env["SPECRUNNER_GITHUB_CLIENT_ID"];
  process.env["SPECRUNNER_GITHUB_CLIENT_ID"] = "Iv1.testdefault";
});

afterEach(() => {
  if (originalClientIdEnv !== undefined) {
    process.env["SPECRUNNER_GITHUB_CLIENT_ID"] = originalClientIdEnv;
  } else {
    delete process.env["SPECRUNNER_GITHUB_CLIENT_ID"];
  }
});

// TC-075: authorization_pending — continues polling
describe("TC-075: authorization_pending — continues polling", () => {
  it("retries when authorization_pending is returned", async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ error: "authorization_pending" }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ access_token: "gho_test", token_type: "bearer" }),
      });
    });

    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const result = await pollAccessToken("device_code_123", 5, mockFetch as unknown as typeof fetch, sleepFn);
    expect(result.access_token).toBe("gho_test");
    expect(callCount).toBe(2); // Called twice: once pending, once success
  });
});

// TC-076: slow_down — increases interval by 5
describe("TC-076: slow_down — interval increases by 5", () => {
  it("increases interval by 5 seconds on slow_down", async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ error: "slow_down" }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ access_token: "gho_test", token_type: "bearer" }),
      });
    });

    const sleepCalls: number[] = [];
    const sleepFn = vi.fn().mockImplementation((ms: number) => {
      sleepCalls.push(ms);
      return Promise.resolve();
    });

    await pollAccessToken("device_code_123", 5, mockFetch as unknown as typeof fetch, sleepFn);

    // First sleep: 5 * 1000 = 5000ms
    // After slow_down: interval becomes 5+5=10, so next sleep 10*1000=10000ms
    expect(sleepCalls[0]).toBe(5000);
    expect(sleepCalls[1]).toBe(10000);
  });
});

// TC-077: expired_token — throws error (no longer calls process.exit directly)
describe("TC-077: expired_token — throws", () => {
  it("throws when expired_token is returned and prints timeout message", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ error: "expired_token" }),
    });
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    await expect(
      pollAccessToken("device_code_123", 5, mockFetch as unknown as typeof fetch, sleepFn),
    ).rejects.toThrow();

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining("Authorization timed out"),
    );
  });
});

// TC-078: access_denied — throws error (no longer calls process.exit directly)
describe("TC-078: access_denied — throws", () => {
  it("throws when access_denied is returned and prints denied message", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ error: "access_denied" }),
    });
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    await expect(
      pollAccessToken("device_code_123", 5, mockFetch as unknown as typeof fetch, sleepFn),
    ).rejects.toThrow();

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining("Authorization denied by user"),
    );
  });
});

// TC-079: SPECRUNNER_GITHUB_CLIENT_ID 環境変数で上書き
describe("TC-079: SPECRUNNER_GITHUB_CLIENT_ID override", () => {
  it("uses env var client_id in device code request", async () => {
    const originalEnv = process.env["SPECRUNNER_GITHUB_CLIENT_ID"];
    process.env["SPECRUNNER_GITHUB_CLIENT_ID"] = "Iv1.test123";

    let capturedBody = "";
    const mockFetch = vi.fn().mockImplementation((_url: string, opts: RequestInit) => {
      capturedBody = opts.body as string;
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            device_code: "dc",
            user_code: "ABC-123",
            verification_uri: "https://github.com/login/device",
            expires_in: 900,
            interval: 5,
          }),
      });
    });

    await requestDeviceCode(mockFetch as unknown as typeof fetch);

    expect(capturedBody).toContain("client_id=Iv1.test123");

    if (originalEnv !== undefined) {
      process.env["SPECRUNNER_GITHUB_CLIENT_ID"] = originalEnv;
    } else {
      delete process.env["SPECRUNNER_GITHUB_CLIENT_ID"];
    }
  });
});
