# Code Review — github-token-source-visibility — Iteration 1

- **date**: 2026-05-16
- **reviewer**: code-review agent
- **verdict**: needs-fix

---

## Summary

実装の大部分は仕様どおり正しく実装されている。`PreflightResult` / `DoctorContext` のフィールド追加、`runPreflight` の source propagate + info ログ、`github-token-present` のパスメッセージ変更、テストカバレッジ（TC-01〜TC-06）すべて合格。  
ただし受け入れ基準に明示された「living spec ファイルの更新」が未実施で、major 判定とする。

---

## Findings

### [major] `specrunner/specs/github-device-flow-auth/spec.md` が更新されていない

- **location**: `specrunner/specs/github-device-flow-auth/spec.md`（diff に含まれない）
- **description**: request の受け入れ基準「関連 spec が新挙動を反映している」および要件 5 に「specrunner/specs/github-device-flow-auth/spec.md の credentials 解決節に『token 取得元は preflight / doctor 出力で可視化される』を 1 行追加する」と明示されている。delta spec (`specrunner/changes/github-token-source-visibility/delta-spec/github-device-flow-auth.md`) は作成済みだが、living spec 本体は変更されておらず、tasks.md の T-06 が未完了状態にある。delta spec は変更意図の記録であり living spec の代替ではない。
- **fix**: `specrunner/specs/github-device-flow-auth/spec.md` の credentials 解決節に以下 1 行を追加する。
  ```
  token 取得元（credentials ファイル / 環境変数）は preflight および doctor の出力で可視化される。
  ```

---

### [info] TC-07 は既存テストと重複している

- **location**: `tests/core/doctor/checks/config/github-token-present.test.ts:59`
- **description**: `resolvedGitHubToken === null` で fail を返すパスは、変更前から存在する TC-015 と同等。correctness 上の問題はないが冗長。

---

## Checklist

| 要件 | 結果 |
|---|---|
| `PreflightResult.githubTokenSource` non-optional で追加 | ✅ |
| `DoctorContext.githubTokenSource` null 許容で追加 | ✅ |
| `runPreflight` が `resolved.source` を propagate | ✅ |
| `runPreflight` が info ログ `GitHub token source: ...` を出力 | ✅ |
| `github-token-present` pass message に `(source: ...)` を含む | ✅ |
| `github-token-valid` の pass message を変更しない | ✅ |
| TC-a: credentials 経由で `githubTokenSource === "credentials"` | ✅ |
| TC-b: env 経由で `githubTokenSource === "env"` | ✅ |
| TC-c: `github-token-present` pass message にソース文字列を含む | ✅ |
| TC-d: `runPreflight` info ログにソース文字列を含む | ✅ |
| `specrunner/specs/github-device-flow-auth/spec.md` を更新 | ❌ |
| `bootstrap.ts` / `finish.ts` の既存挙動を壊さない | ✅ |
| 型安全（`any` キャストなし） | ✅ |
