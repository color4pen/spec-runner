# Code Review: github-token-source-visibility — Iteration 2

## Summary

Iteration 1 で指摘した spec ファイル未更新が解消され、living spec (`specrunner/specs/github-device-flow-auth/spec.md`) に可視化の 1 行が追加された。R1〜R8 すべて充足、TC-01〜TC-15 もコード上で確認できた。`bun run typecheck` および追加テスト両方 green。merge 可能。

## Findings

### [info] preflight テストの `beforeEach` で `vi.clearAllMocks()` を呼んでいるが `resolveGitHubToken` のデフォルト戻り値が未設定

- **file**: tests/core/preflight.test.ts
- **line**: 37-39
- **issue**: `vi.clearAllMocks()` 後、各テストが個別に `mockResolvedValue` を再設定しているので機能的には問題ない。ただし `clearAllMocks` ではなく `resetAllMocks` を使うかどうかは vitest のベストプラクティス次第で、現状は意図どおり動作。注意点として info 扱い。
- **suggestion**: アクション不要。現状で正しく動く。

### [info] `buildMockConfig` の import がテストファイル内で未使用

- **file**: tests/core/doctor/checks/config/github-token-present.test.ts
- **line**: 7
- **issue**: `buildMockConfig` が import されているが本ファイル内で参照されていない。ただし変更前から存在するデッドコードであり、本 change で導入されたものではない。
- **suggestion**: アクション不要。別途リファクタで除去可。

### [info] `delta-spec/cli-commands.md` が存在するが baseline `specrunner/specs/cli-commands/spec.md` が存在しない可能性

- **file**: specrunner/changes/github-token-source-visibility/delta-spec/cli-commands.md
- **line**: 3
- **issue**: delta spec が `Baseline: specrunner/specs/cli-commands/spec.md` を参照しているが、cli-commands spec 本体は本 change 内では更新されていない（diff には github-device-flow-auth/spec.md のみ）。doctor / preflight 挙動の正規記述先が cli-commands spec か github-device-flow-auth spec のどちらかで分岐するが、request.md 要件 5 では「credentials 解決節（= github-device-flow-auth spec）に 1 行追加」のみが必須要求であり、cli-commands 側は明示要求されていない。受け入れ基準にも違反しない。
- **suggestion**: アクション不要。cli-commands 側への正式な反映は別 change で扱える。

## Test Coverage

test-cases.md の TC-01〜TC-15 をすべて確認した。

| TC | Priority | 実装場所 | 状態 |
|----|----------|----------|------|
| TC-01 (credentials propagate) | must | tests/core/preflight.test.ts:42 | pass |
| TC-02 (env propagate) | must | tests/core/preflight.test.ts:54 | pass |
| TC-03 (log credentials) | must | tests/core/preflight.test.ts:66 | pass |
| TC-04 (log env) | must | tests/core/preflight.test.ts:77 | pass |
| TC-05 (check pass credentials) | must | tests/core/doctor/checks/config/github-token-present.test.ts:37 | pass |
| TC-06 (check pass env) | must | tests/core/doctor/checks/config/github-token-present.test.ts:48 | pass |
| TC-07 (token null fail) | must | tests/core/doctor/checks/config/github-token-present.test.ts:59 | pass（TC-015 と重複だが redundancy として許容） |
| TC-08 (source null pass) | should | tests/core/doctor/checks/config/github-token-present.test.ts:70 | pass |
| TC-09 (doctor.ts inject success) | must | typecheck で担保 | satisfied |
| TC-10 (doctor.ts inject failure) | must | typecheck で担保 | satisfied |
| TC-11 (PreflightResult non-optional) | must | typecheck で担保 | satisfied |
| TC-12 (DoctorContext nullable) | must | typecheck で担保 | satisfied |
| TC-13 (mock default) | should | tests/core/doctor/mock-context.ts:72 | satisfied |
| TC-14 (github-token-valid regress) | should | github-token-valid.ts 未変更 | satisfied |
| TC-15 (typecheck + test green) | must | verification-result.md | satisfied |

request.md 受け入れ基準 (a)〜(d) すべて TC-01〜TC-06 が直接 cover。

## Requirements Verification

| 要件 | 結果 | 場所 |
|---|---|---|
| R1: `PreflightResult.githubTokenSource` non-optional | OK | src/core/preflight.ts:24 |
| R2: `DoctorContext.githubTokenSource` null 許容 | OK | src/core/doctor/types.ts:112 |
| R3: `runPreflight` が `resolved.source` を保持 | OK | src/core/preflight.ts:86 |
| R4: `doctor.ts` で `githubTokenSource` 注入 | OK | src/cli/doctor.ts:92, 96, 121 |
| R5: `github-token-present` pass message に `(source: ...)` | OK | src/core/doctor/checks/config/github-token-present.ts:14-18 |
| R6: `github-token-valid` 未変更 | OK | src/core/doctor/checks/auth/github-token-valid.ts（diff になし） |
| R7: info ログ `GitHub token source: ...` を resolve 直後に出力 | OK | src/core/preflight.ts:87 |
| R8: spec.md 更新 | OK | specrunner/specs/github-device-flow-auth/spec.md:72 |

## Verdict

- **verdict**: approved
