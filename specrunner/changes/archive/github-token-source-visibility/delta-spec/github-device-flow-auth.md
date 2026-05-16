# Delta Spec: github-device-flow-auth

Baseline: `specrunner/specs/github-device-flow-auth/spec.md`

## MODIFIED

### R-token-source-visibility (追記)

「取得した access_token は config に保存される」Requirement の末尾に以下を追加：

token 取得元（credentials file / GITHUB_TOKEN env var）は `specrunner doctor` の `github-token-present` check 出力および `specrunner run` の preflight info ログで可視化される。
