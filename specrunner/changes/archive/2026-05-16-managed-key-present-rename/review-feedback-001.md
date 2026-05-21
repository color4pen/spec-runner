# Review Feedback — Iteration 1

## Summary

純粋な rename refactoring が design / tasks / test-cases に沿って完全に実行されている。受け入れ基準 8 項目すべて充足、grep 0 hits、index.ts の import / array / re-export いずれも一貫して新名に更新済み。

## Findings

| # | Severity | Location | Description |
|---|----------|----------|-------------|
| 1 | info | `src/core/doctor/checks/auth/managed-key-valid.ts:8` | `ANTHROPIC_API_TIMEOUT_MS` / `ANTHROPIC_MODELS_URL` という定数名は upstream provider に依存した名前。ただし `tests/unit/remove-session-timeout.test.ts:195` が `ANTHROPIC_API_TIMEOUT_MS` 文字列を直接 assertion しているため、本 request 単独で改名すると既存 test を破壊する。今回 scope 外として妥当。後続 request で扱うのが適切。 |
| 2 | info | `src/core/doctor/checks/auth/managed-key-valid.ts:43,50` | result message 文字列に `"Anthropic API key is valid"` / `"Anthropic API key is invalid"` が残存。これは UI に出る文言で外部契約に近く、命名統一の対象外として今回触らないのは妥当。 |

## Test Coverage

test-cases.md の must (15件) / should (6件) すべて検証済み。

- TC-01〜04 (filesystem): 新 4 ファイル存在、旧 4 ファイル削除を `ls` で確認
- TC-05〜06 (export symbol): `managedKeyPresentCheck` / `managedKeyValidCheck` 宣言確認
- TC-07〜08 (check.name 保持): `"managed/api-key-present"` / `"managed/api-key-valid"` 維持を実ファイルで確認
- TC-09〜10 (index.ts): import path・配列使用・re-export すべて新名に更新済み
- TC-11〜14 (test files): import path・describe 文字列が新名に追従
- TC-15〜16 (remove-session-timeout): L188 description / L191 path 文字列とも新名に更新
- TC-17 (grep 0 hits): `src/` `tests/` 配下とも 0 件確認
- TC-18〜19 (build/test): verification-result.md で typecheck pass、1924 tests passed
- TC-20 (specs unchanged): `git diff main -- specrunner/specs/` 差分なし確認
- TC-21 (他 request): `credentials-provider-parity` への変更なし確認

## Verdict

- **verdict**: approved
