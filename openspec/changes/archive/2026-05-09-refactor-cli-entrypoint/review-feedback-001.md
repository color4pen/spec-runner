# Code Review — refactor-cli-entrypoint — Iteration 1

- **verdict**: approved
- **total_score**: 8.60
- **iteration**: 1

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 9 | 0.30 | 2.70 |
| security | 9 | 0.25 | 2.25 |
| architecture | 9 | 0.15 | 1.35 |
| performance | 9 | 0.10 | 0.90 |
| maintainability | 8 | 0.10 | 0.80 |
| testing | 6 | 0.10 | 0.60 |

## Summary

337 行の switch/case を 83 行のレジストリベースディスパッチに置き換え、フラグパースを `parseFlags()` 1 関数に集約した。全受け入れ基準を充足。134 test files / 1311 tests が green、typecheck も green。既存の `specrunner-resume-dispatch.test.ts` が全 pass しており、エラーメッセージ互換性も確認済み。

flag-parser.ts は純粋関数として分離されており、command-registry.ts への依存がない。レジストリは handler とフラグ定義を同居させ、変換ロジックが散逸しない構造になっている。

行動変更はすべて additive（`--flag value` 空白形式の追加、全コマンドへの unknown flag 検出の追加）であり、regression は検出されなかった。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | testing | tests/unit/cli/ | test-cases.md sections 2, 3 の must シナリオ（CommandRegistry 8 件 + entrypoint 11 件）に専用テストが存在しない。flag-parser (section 1) は 14/14 完全カバー。resume は既存 dispatch テストが暗黙カバー | `tests/unit/cli/command-registry.test.ts` を追加し、少なくとも 2-1（全 9 コマンド登録確認）, 2-2（request の ParentCommandDef 確認）, 2-3/2-4（enum 制約確認）をカバーする。entrypoint シナリオは resume dispatch テストのパターンを他コマンドに横展開する |
| 2 | LOW | correctness | src/cli/flag-parser.ts:49 | `-h` は flagDefs を参照せず無条件に `flags.help = true` を設定する。help を定義しないコマンドでも silent accept になる | D3 rule 3 による意図的設計。現状は改善（旧コードでは `-h` が positional に誤認された）。将来 per-command help を実装する際に再検討 |
| 3 | LOW | correctness | src/cli/flag-parser.ts:93 | enum エラーメッセージの文言が旧コードと異なる（`Unknown` → `Invalid`、`"managed" or "local"` → `managed, local`） | D6 で exact match 不要と明記。exit code 2 と stderr 出力は維持。対応不要 |

## Structural Checks

| Check | Result |
|-------|--------|
| `bin/specrunner.ts` 行数 | 83 lines (target: <= 100) |
| switch/case 残存 | 0 件 |
| 外部 arg parser 依存 | 0 件 |
| USAGE / FINISH_USAGE export | bin/specrunner.ts から re-export 維持 |
| flag-parser.ts の独立性 | command-registry / handler への import なし |
| typecheck | passed |
| test suite | 134 files, 1311 tests passed |
