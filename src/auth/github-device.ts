import { getGithubClientId, GITHUB_DEVICE_CODE_URL, GITHUB_TOKEN_URL, GITHUB_SCOPE } from "./constants.js";
import { stderrWrite } from "../logger/stdout.js";

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface AccessTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

type FetchFn = typeof fetch;

/**
 * Request a device code from GitHub.
 */
export async function requestDeviceCode(
  fetchFn: FetchFn = fetch,
): Promise<DeviceCodeResponse> {
  const clientId = getGithubClientId();
  const response = await fetchFn(GITHUB_DEVICE_CODE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    },
    body: new URLSearchParams({
      client_id: clientId,
      scope: GITHUB_SCOPE,
    }).toString(),
  });

  if (!response.ok) {
    throw new Error(`Failed to request device code: ${response.status}`);
  }

  return response.json() as Promise<DeviceCodeResponse>;
}

export type SleepFn = (ms: number) => Promise<void>;

const defaultSleep: SleepFn = (ms) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Poll GitHub token endpoint until access token is granted.
 * Handles: authorization_pending, slow_down, expired_token, access_denied
 */
export async function pollAccessToken(
  deviceCode: string,
  intervalSeconds: number,
  fetchFn: FetchFn = fetch,
  sleepFn: SleepFn = defaultSleep,
): Promise<AccessTokenResponse> {
  const clientId = getGithubClientId();
  let currentInterval = intervalSeconds;

  while (true) {
    await sleepFn(currentInterval * 1000);

    const response = await fetchFn(GITHUB_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: new URLSearchParams({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }).toString(),
    });

    if (!response.ok) {
      throw new Error(`Token request failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      access_token?: string;
      token_type?: string;
      scope?: string;
      error?: string;
      interval?: number;
    };

    if (data.access_token) {
      return {
        access_token: data.access_token,
        token_type: data.token_type ?? "bearer",
        scope: data.scope ?? GITHUB_SCOPE,
      };
    }

    switch (data.error) {
      case "authorization_pending":
        // Continue polling at current interval
        break;

      case "slow_down":
        // Increase interval by 5 seconds
        currentInterval += 5;
        if (data.interval !== undefined) {
          currentInterval = data.interval + 5;
        }
        break;

      case "expired_token":
        stderrWrite("Authorization timed out. Run 'specrunner login' again.");
        process.exit(1);
        break;

      case "access_denied":
        stderrWrite("Authorization denied by user.");
        process.exit(1);
        break;

      default:
        throw new Error(`Unexpected error from GitHub: ${data.error ?? "unknown"}`);
    }
  }
}

/**
 * Run the full GitHub Device Flow.
 * Displays instructions to the user and polls for token.
 */
export async function runDeviceFlow(
  fetchFn: FetchFn = fetch,
  sleepFn: SleepFn = defaultSleep,
): Promise<{ accessToken: string; scopes: string[] }> {
  const deviceCode = await requestDeviceCode(fetchFn);

  process.stdout.write(
    `Open ${deviceCode.verification_uri} and enter code: ${deviceCode.user_code}\n`,
  );
  process.stdout.write(
    `Code expires in ${deviceCode.expires_in} seconds.\n`,
  );
  process.stdout.write("Waiting for authorization...\n");

  const token = await pollAccessToken(
    deviceCode.device_code,
    deviceCode.interval,
    fetchFn,
    sleepFn,
  );

  return {
    accessToken: token.access_token,
    scopes: token.scope.split(",").map((s) => s.trim()),
  };
}
