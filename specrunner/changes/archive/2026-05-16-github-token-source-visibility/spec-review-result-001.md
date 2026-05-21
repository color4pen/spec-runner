# Spec Review Result: github-token-source-visibility

- **verdict**: approved
- **reviewer**: spec-reviewer
- **date**: 2026-05-16

## Summary

request.md の全要件が design.md / tasks.md / delta-spec に正確にトレースされている。既存コードとの整合性を確認済み。

## Verification Against Codebase

| Claim in request.md | Verified |
|---------------------|----------|
| `resolveGitHubToken` returns `{ token, source }` | Yes — `src/core/credentials/github.ts:92` |
| `preflight.ts:81` が `.token` のみ取得 | Yes — L80-81 |
| `doctor.ts:91-119` が source 未参照 | Yes — L91-94 |
| `DoctorContext` に `resolvedGitHubToken: string \| null` 存在 | Yes — L107 |
| `github-token-present.ts` が "GitHub token is available" 固定 | Yes — L14-16 |
| `logInfo` が `src/logger/stdout.ts` に存在 | Yes — L50 |

## Design Adequacy

- **型設計**: `PreflightResult.githubTokenSource` が non-optional、`DoctorContext.githubTokenSource` が nullable — 既存パターン（`resolvedGitHubToken`）と整合。妥当。
- **責務分離**: `github-token-present` に source 表示を集約し `github-token-valid` は変更しない判断は request.md の明示要件通り。
- **スコープ制御**: `bootstrap.ts` / `finish.ts` は下流に消費者がないため変更しない判断は合理的。

## Tasks Completeness

| 受け入れ基準 | Covered by |
|-------------|------------|
| `PreflightResult` / `DoctorContext` に field 存在 | T-01, T-02 |
| `runPreflight` が source を propagate | T-01 (1-b, 1-d) |
| `github-token-present` pass message に source 含む | T-04 |
| 両ケースで test が verify | T-05 (5-b, 5-c) |
| spec が新挙動を反映 | T-06 (delta-spec 2件) |
| typecheck + test green | 受け入れ基準チェックリスト末尾 |

## Delta Spec Review

- `delta-spec/github-device-flow-auth.md` — baseline spec 存在確認済み。追記内容は最小で正確。
- `delta-spec/cli-commands.md` — baseline spec 存在確認済み。2 Requirement の追加は request 要件 3, 4 に対応。

## Minor Notes (non-blocking)

1. request.md のセクション番号が "5. test" と "5. spec" で重複している（typo）。実害なし。
2. tasks.md T-05c のテストモック import パス `../../src/...` はテストファイル配置次第で調整が必要だが、実装時に解決可能な詳細。

## Security

セキュリティ上の懸念なし。token の値ではなく取得元ラベル（"credentials" / "env"）のみを出力する変更であり、機密情報の露出リスクは増加しない。
