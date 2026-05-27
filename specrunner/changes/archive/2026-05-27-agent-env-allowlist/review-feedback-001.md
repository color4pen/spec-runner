# Code Review Feedback — agent-env-allowlist — iteration 1

- **verdict**: approved
- **reviewer**: code-review agent
- **date**: 2026-05-27

---

## Summary

実装は正しく、受け入れ基準のうち「コードの動作」に関する項目はすべて満たされている。
5 箇所の spawn 経路すべてに `stripSecrets()` が適用済み。`bun run typecheck && bun run test` green (3138 passed)。

test-cases.md に列挙された must シナリオのうち 7 件がテストカバレッジに存在しないが、
いずれも「現在のバグや機能不全」ではなく「将来の回帰リスク・保守性」に分類される MEDIUM 所見であるため、
CRITICAL/HIGH が 0 件となり verdict は approved。

---

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | MEDIUM | test-coverage | `tests/unit/util/spawn.test.ts` | TC-SPAWN-02 未カバー。TC-35 は `GITHUB_TOKEN` のみ検証しており、`ANTHROPIC_API_KEY` の spawnCommand 経路テストが存在しない。`stripSecrets` 単体では全 4 key テスト済みのため現時点で機能的問題はないが、test-cases.md との不整合がある。 | `spawn.test.ts` に `ANTHROPIC_API_KEY` を対象とした TC-35 相当テストを 1 件追加する。 | no |
| 2 | MEDIUM | test-coverage | `tests/unit/adapter/claude-code/agent-runner.test.ts`, `tests/unit/core/local.test.ts` | TC-SDK-01 / TC-SDK-03 未カバー。`agent-runner.ts` の `queryOptions.env` および `local.ts` の `buildSdkOptions().env` に `stripSecrets` が渡されることを検証する unit test がない。実装は正しいが、将来の無意識なリグレッション検知が困難。 | SDK の `query()` をモックし、渡された `env` に denylist key が含まれないことをアサートするテストを追加する。 | no |
| 3 | MEDIUM | test-coverage | `tests/unit/verification/commands.test.ts`, `tests/unit/verification/runner.test.ts` | TC-VER-01〜04 未カバー。`verification/commands.ts:spawnCommand()` および `runner.ts:spawnScript()` の env フィルタ検証がない。特に TC-VER-02（`{ ...stripSecrets(...), PATH: pathWithLocalBin }` の spread 順序）はリグレッション防止として重要。 | `commands.test.ts` に GITHUB_TOKEN 除去テスト + PATH 拡張維持テストを追加。runner テストに ANTHROPIC_API_KEY / SPECRUNNER_API_KEY 除去テストを追加する。 | no |

---

## 受け入れ基準チェック

| 項目 | 状態 |
|------|------|
| `spawnCommand()` が渡す env に denylist key が含まれない | ✅ 実装済・TC-35 確認済 |
| verification commands の spawn にも同じフィルタが適用される | ✅ 実装済（テスト未カバー → F3） |
| `opts.env` で明示的に渡された変数は引き続き機能する | ✅ TC-36 確認済 |
| 既存テストが通る + フィルタのユニットテストが追加される | ⚠️ 既存テスト通過、must テスト 7 件未追加（MEDIUM） |
| `bun run typecheck && bun run test` が green | ✅ verification-result.md 確認済 |

---

## 実装品質メモ

- `env-filter.ts` の `stripSecrets()` 実装は簡潔・正確。shallow copy + delete で immutability 保証済み。
- `spawn.ts` の merge 順序 `{ ...stripSecrets(process.env), ...opts.env }` はアーキテクト設計と一致。
- `verification/commands.ts` の PATH 上書き順序 `{ ...stripSecrets(...), PATH: pathWithLocalBin }` は正しい。
- `SECRET_DENYLIST` の named export により今後のテスト参照が容易。
- 5 ファイルすべての適用漏れなし（要件 1〜6 対応完了）。
