## Why

PR #51 (cli-finish-command) の archive 時に `openspec archive` が delta spec sync で fail し、`--skip-specs` で迂回した。原因は次の階層的な不整合:

1. PR #50 (cli-doctor-command) が doctor を別 Requirement で追加した際、count を 5 → 6 に上げる delta を入れ忘れた
2. PR #51 (cli-finish-command) は count を「6 サブコマンド」と仮定して MODIFIED delta を書いたが、main に「6」がないため `openspec archive` が "header not found" で fail
3. `--skip-specs` で迂回した結果、現在 main `openspec/specs/cli-commands/spec.md` の Requirement header / body / Scenario は count=5 のまま、実装は 6 サブコマンド（init/login/run/ps/doctor/finish）

加えて、過去の dogfooding テスト残骸 `openspec/changes/test-slug/`（verification-result.md のみ残存）が main にコミットされ削除されていない。`openspec list` 結果を汚染する。

両方とも実装の動作には影響しないが、放置すると次の cli-commands MODIFY が同じ archive 失敗を起こす（cascade）。最小コストで reconcile する。

## What Changes

- `openspec/specs/cli-commands/spec.md` の `Requirement: \`specrunner\` バイナリは 5 つのサブコマンドを提供する` を `6 つのサブコマンド` に rename し、body と全 Scenario を 6 サブコマンド（init/login/run/ps/doctor/finish）に揃える
- delta spec は **`## RENAMED Requirements` + `## MODIFIED Requirements` 併用**（MODIFIED 単独で header を変えると "header not found" が再発するため）
- `openspec/changes/test-slug/` ディレクトリを削除する（dogfooding 残骸、proposal も無いゴミ）
- 実装コード（`src/`）は touch しない

## Capabilities

### Modified Capabilities

- `cli-commands`: count を 5 → 6 に揃えて実装と整合させる。Requirement header を変更するため delta は RENAMED + MODIFIED の併用とする

## Impact

- **Spec drift 解消**: 次回以降の cli-commands spec MODIFY が同じ archive 失敗を起こさない
- **openspec list の clean 化**: test-slug 残骸が消える
- **動作影響なし**: spec / docs ファイル編集のみ。実装コードは touch しないため既存テスト 686/686 は継続して通る想定
