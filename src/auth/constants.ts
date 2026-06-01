/**
 * SpecRunner 公式 GitHub App の client_id。
 *
 * GitHub Device Flow は client_secret を必要としないため、client_id は
 * CLI コードに固定で埋め込まれる（spec: github-device-flow-auth/spec.md）。
 * テスト用に SPECRUNNER_GITHUB_CLIENT_ID 環境変数で上書き可能。
 */
const GITHUB_CLIENT_ID = "Iv23liyDmS0r1qxXDewd";

/**
 * GitHub App client_id を返す。
 *
 * SPECRUNNER_GITHUB_CLIENT_ID が設定されていればその値を使用する（テスト用）。
 * 未設定の場合は CLI に埋め込まれた client_id を返す（既定動作）。
 */
export function getGithubClientId(): string {
  return process.env["SPECRUNNER_GITHUB_CLIENT_ID"] || GITHUB_CLIENT_ID;
}

export const GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code";
export const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
