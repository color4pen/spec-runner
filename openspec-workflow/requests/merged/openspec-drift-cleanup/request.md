# openspec drift cleanup — cli-commands count 修正 + test-slug 残骸削除

## Meta

- **type**: bug-fix
- **date**: 2026-05-02
- **author**: color4pen

## ワークフローオプション

- **enabled**: []

## 背景

PR #51 (cli-finish-command) の archive 時に `openspec archive` が delta spec sync で fail し、`--skip-specs` で迂回した。原因は次の階層的な不整合:

1. `openspec/specs/cli-commands/spec.md` の Requirement `### Requirement: \`specrunner\` バイナリは X つのサブコマンドを提供する` が **`5 つのサブコマンド`** のまま
2. PR #50 (cli-doctor-command) は doctor を別 Requirement で追加したが、count を 5 → 6 に上げる delta を入れ忘れた
3. PR #51 (cli-finish-command) は count を「6 サブコマンド」と仮定して MODIFIED delta を書いたが、main に「6」がないため openspec archive が "header not found" で fail
4. `--skip-specs` で迂回した結果、現在 main spec は実装(6 サブコマンド = init/login/run/ps/doctor/finish)と乖離したまま

加えて、test 残骸ディレクトリ `openspec/changes/test-slug/` (pr-create-result.md, verification-result.md) が main に残置されている。これは過去の手動 / dogfooding テストで作成され、archive されずに main にコミットされたゴミ。

両方とも実装の動作には影響しないが:
- 今後 cli-commands spec の同じ Requirement を MODIFY する PR は同じエラーで詰まる（cascade）
- test-slug は openspec list / status の結果を汚染する

放置すると drift が雪だるま式に増えるため、最小コストで reconcile する。

## 目的

- main spec と実装の乖離を解消し、cli-commands count を **6** に揃える
- test-slug 残骸を削除して openspec changes ディレクトリを clean な状態に戻す

## 要件

### 1. cli-commands spec の count を 6 に更新

`openspec/specs/cli-commands/spec.md` の以下を編集:

- 既存 Requirement header `### Requirement: \`specrunner\` バイナリは 5 つのサブコマンドを提供する` を `### Requirement: \`specrunner\` バイナリは 6 つのサブコマンドを提供する` に変更
- body を `init / login / run / ps / doctor / finish` の 6 サブコマンド列挙に更新
- Scenario の usage 文字列を `5 サブコマンド` → `6 サブコマンド` に更新
- `--help` Scenario の文言も `6 サブコマンド` に更新

### 2. delta spec の正しい記述

本 cleanup は `openspec/changes/openspec-drift-cleanup/specs/cli-commands/spec.md` に delta を書く。header 変更を伴うため必ず以下の構造で書く:

```markdown
## RENAMED Requirements

- FROM: ### Requirement: `specrunner` バイナリは 5 つのサブコマンドを提供する
- TO:   ### Requirement: `specrunner` バイナリは 6 つのサブコマンドを提供する

## MODIFIED Requirements

### Requirement: `specrunner` バイナリは 6 つのサブコマンドを提供する

[新 body]
```

`MODIFIED` 単独で header を変えると同じ "header not found" エラーが再発する。これは PR #51 の失敗から学んだ事実。

### 3. test-slug 残骸ディレクトリの削除

`openspec/changes/test-slug/` 全体を削除する:

- `openspec/changes/test-slug/pr-create-result.md`
- `openspec/changes/test-slug/verification-result.md`
- ディレクトリ自体

これは過去の dogfooding テスト残骸であり、archive 対象でも proposal でもない単なるゴミ。

### 4. 検証

- `openspec list` で test-slug が消えていること
- `openspec validate openspec-drift-cleanup` がエラーなしで通ること（archive 時に sync が成功する保証）
- `openspec archive openspec-drift-cleanup` (dry run でなくても) が `--skip-specs` なしで成功すること
- 本 PR merge 後、次回以降の cli-commands spec の MODIFY が同じエラーを起こさないこと

## 受け入れ基準

- [ ] `openspec/specs/cli-commands/spec.md` の Requirement header / body / Scenario が「6 サブコマンド」（init/login/run/ps/doctor/finish）に更新されている
- [ ] `openspec/changes/openspec-drift-cleanup/specs/cli-commands/spec.md` に `## RENAMED Requirements` + `## MODIFIED Requirements` の両方が含まれる
- [ ] `openspec/changes/test-slug/` ディレクトリが削除されている
- [ ] `openspec validate openspec-drift-cleanup` がエラーなしで通る
- [ ] PR merge 後の archive が `--skip-specs` なしで成功する（dogfooding-007 で検証可能）
- [ ] 既存テスト 686/686 が引き続き通る（spec 編集のみのため動作影響なしのはず）

## 補足

### 関連 PR

- PR #50 (cli-doctor-command): count 5 → 6 の delta を入れ忘れた根本原因
- PR #51 (cli-finish-command): `--skip-specs` で迂回した PR
- PR #52 (chore: archive cli-finish-command): finish の archive PR

### スコープ外

- **openspec-workflow 側の改善**（propose agent への RENAMED 規約追加 / spec-reviewer の header consistency check / verification phase に `openspec validate <change>` 追加）は別 request として上げる。本 request は spec-runner 側 drift の reconcile のみ
- 過去の archive 済み change folder (`openspec/changes/archive/...`) の整理は対象外
- 他の spec (例: `openspec/specs/cli-commands/spec.md` 以外) の整合性チェックは対象外

### コード変更

なし（spec / docs ファイル編集のみ）。`src/` 配下は touch しない。
