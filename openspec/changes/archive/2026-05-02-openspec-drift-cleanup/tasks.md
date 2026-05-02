# Tasks: openspec-drift-cleanup

## 1. Spec drift 解消

- [x] 1.1 `openspec/specs/cli-commands/spec.md` の Purpose を 6 サブコマンドに更新
- [x] 1.2 `### Requirement: \`specrunner\` バイナリは 5 つのサブコマンドを提供する` を `6 つのサブコマンド` に rename
- [x] 1.3 同 Requirement の body を 6 サブコマンド（init/login/run/ps/doctor/finish）の列挙に更新し、`finish` の 1 行説明を usage に含める旨を追記
- [x] 1.4 「引数なし」「不明なサブコマンド」「--help」3 Scenario の文言を `6 サブコマンド` / 6 列挙に更新
- [x] 1.5 delta spec `openspec/changes/openspec-drift-cleanup/specs/cli-commands/spec.md` に `## RENAMED Requirements` + `## MODIFIED Requirements` を併記

## 2. test-slug 残骸削除

- [x] 2.1 `openspec/changes/test-slug/verification-result.md` を削除
- [x] 2.2 `openspec/changes/test-slug/` ディレクトリを削除

## 3. 検証

- [x] 3.1 `npx openspec validate openspec-drift-cleanup --strict` がエラーなしで通る
- [x] 3.2 `npx openspec list` で test-slug が消えている
- [x] 3.3 既存テスト suite が通る（spec 編集のみのため動作影響なし想定）
