# Delta Spec: change-folder-viewer — slug 導出で jobId suffix を除去する

## Changed Requirement: `getChangeFolderFiles` の slug 導出

**Previous**: `branch_name` から slug を導出する際、最初の `/` 以降をそのまま slug として使用する。例: `feat/2026-04-25-my-slug` → `2026-04-25-my-slug`

**Updated**: 最初の `/` 以降を取得した後、末尾の `-[0-9a-f]{8}` パターンにマッチする場合はそれを除去して slug とする。例: `feat/my-slug-abcd1234` → `my-slug`

#### Scenario: getChangeFolderFiles uses DB branch_name with jobId suffix

- **WHEN** `getChangeFolderFiles(requestId)` is called and the request has `branch_name = "feat/my-feature-abcd1234"` in the database
- **THEN** the function derives the slug by taking the substring after the first `/` character (`my-feature-abcd1234`), then stripping the jobId suffix (`-abcd1234`) to get `my-feature`, and constructs the path as `openspec/changes/my-feature/`

#### Scenario: getChangeFolderFiles with suffix-less branch (backward compat)

- **WHEN** `getChangeFolderFiles(requestId)` is called and the request has `branch_name = "feat/readme-status-section"` in the database
- **THEN** the function takes the substring after `/` (`readme-status-section`), `stripJobIdSuffix` is no-op, and constructs the path as `openspec/changes/readme-status-section/`

## Unchanged

- Deterministic derivation fallback（`branch_name` が null の場合）は変更なし
- `getChangeFolderFileContent` の挙動は変更なし（slug 導出は `getChangeFolderFiles` と同じロジック）
- Path traversal prevention は変更なし
- Diff URL display は変更なし（`branch_name` をそのまま URL に使用する）

## Rationale

branch 名フォーマットが `feat/<slug>-<8char>` に変更されるため、branch_name から change folder path を構築する際に jobId suffix の除去が必要になる。

## Note

`change-folder-viewer` は Web UI（Next.js app）の Server Action であり、本リポジトリ（spec-runner CLI）には含まれない。delta spec として記録し、Web UI 側の実装は別途対応する。
