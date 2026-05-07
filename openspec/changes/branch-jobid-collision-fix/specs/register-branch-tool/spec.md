# Delta Spec: register-branch-tool — slug 導出で jobId suffix を除去する

## Changed Requirement: ハンドラの slug 導出ロジック

**Previous**: slug 未指定時、handler は `stripBranchPrefix(branch)` の結果をそのまま slug として使用する。

**Updated**: slug 未指定時、handler は `stripJobIdSuffix(stripBranchPrefix(branch))` を適用して slug を導出する。`stripJobIdSuffix` は末尾の `-[0-9a-f]{8}` パターンにマッチする場合のみ suffix を切り落とす。

#### Scenario: 1 回呼び出し（slug 省略・jobId-suffixed branch から導出）

- **WHEN** ハンドラが `{ branch: "feat/my-feature-abcd1234" }` のみで呼ばれる
- **THEN** handler が prefix `feat/` を strip し、さらに jobId suffix `-abcd1234` を strip して `my-feature` を導出し `state.request.slug` に設定する。戻り値は `{ ok: true, branch: "feat/my-feature-abcd1234", slug: "my-feature" }`

#### Scenario: 1 回呼び出し（slug 省略・suffix なし branch — 後方互換）

- **WHEN** ハンドラが `{ branch: "feat/readme-status-section" }` のみで呼ばれる（jobId suffix なし）
- **THEN** `stripJobIdSuffix` が no-op で動作し、従来通り `readme-status-section` を slug として導出する。戻り値は `{ ok: true, branch: "feat/readme-status-section", slug: "readme-status-section" }`

#### Scenario: slug 明示入力は stripJobIdSuffix の影響を受けない

- **WHEN** ハンドラが `{ branch: "feat/my-feature-abcd1234", slug: "my-feature" }` で呼ばれる
- **THEN** 明示 slug `my-feature` がそのまま使用される。`stripJobIdSuffix` は呼ばれない

## Unchanged

- `register_branch` の `input_schema`（branch required, slug optional）は変更なし
- handler の入力検証ロジック（空文字列 branch の拒否等）は変更なし
- handler の冪等性（last-write-wins）は変更なし

## Rationale

branch 名フォーマットが `feat/<slug>-<8char>` に変更されるため、slug 省略時の branch → slug 導出で jobId suffix の除去が必要になる。
