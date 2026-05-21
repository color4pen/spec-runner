# Design: request-show-rm-removal

## Summary

`specrunner request show` と `specrunner request rm` サブコマンドを CLI から削除する。
plain markdown file に対する `cat` / `rm` で代替可能なため、CLI surface の整理として廃止する。

## Approach

単純な機能削除。設計判断なし。

1. **ソースファイル削除**: `request-show.ts` / `request-rm.ts` を削除
2. **コマンド登録解除**: `command-registry.ts` から import と subcommand 定義を除去
3. **USAGE 定数更新**: help 出力から `request show` / `request rm` 行を除去
4. **テスト削除・修正**: 専用テストファイル削除 + 共有テストの assertion 書き換え
5. **Delta spec**: baseline の該当 Requirement を REMOVED、関連 Requirement を MODIFIED

## Affected Files

| File | Action |
|------|--------|
| `src/core/command/request-show.ts` | DELETE |
| `src/core/command/request-rm.ts` | DELETE |
| `src/cli/command-registry.ts` | EDIT (import 削除 + subcommand 削除 + USAGE 更新) |
| `tests/unit/core/command/request-show.test.ts` | DELETE |
| `tests/unit/core/command/request-rm.test.ts` | DELETE |
| `tests/unit/cli/help-output-tc.test.ts` | EDIT (assertion を `not.toContain` に変更) |
| `tests/unit/core/command/validation-tc.test.ts` | EDIT (TC-46〜TC-48 の削除/書き換え) |

## Risks

なし。削除対象は他モジュールから参照されておらず、副作用もない。
