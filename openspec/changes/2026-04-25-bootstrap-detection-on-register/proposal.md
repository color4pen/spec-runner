## Why

`registerRepository()` は bootstrap_status を一律 `uninitialized` で設定するため、既に openspec-workflow がセットアップ済みのリポジトリを登録しても bootstrap を要求される。spec-runner 自身のリポジトリのように bootstrap 済みのリポジトリでは不要な手順が発生し、UX を損なう。

## What Changes

- `registerRepository()` 実行時に GitHub Contents API で対象リポジトリの bootstrap 済み判定ファイルの存在を確認する
  - `openspec/project.md` (OpenSpec 初期化の証拠)
  - `requests/active/` (openspec-workflow bootstrap の証拠)
- 両方存在する場合: `bootstrap_status: 'ready'` で INSERT
- いずれか欠けている場合: `bootstrap_status: 'uninitialized'` で INSERT (従来動作)
- 2つの API 呼び出しは `Promise.all` で並列実行 (レイテンシ最小化)
- GitHub API エラー時は安全側に倒して `uninitialized` で登録 (サイレントフォールバック)

## Capabilities

### New Capabilities

(なし — 既存 capability の振る舞い変更のみ)

### Modified Capabilities

- `repository-registration`: 登録時に GitHub API で bootstrap 済み判定を行い、`bootstrap_status` の初期値を動的に決定する

## Impact

- **コード**: `src/lib/repository-registration-actions.ts` の `registerRepository()` 関数のみ
- **GitHub API**: 既存の `getFileContent` / `getDirectoryContents` (github-api.ts) を活用。新しい API ラッパーは不要
- **DB**: スキーマ変更なし。INSERT する値が `uninitialized` 固定から `ready` / `uninitialized` の動的判定に変わるのみ
- **API 契約**: 戻り値の型は変わらない (`RepositoryWithStatus` の `bootstrapStatus` フィールドの値域は既存)
- **状態マシン**: `bootstrap-status-tracking` spec の遷移マップに影響なし。`ready` は terminal state であり、`ready` で INSERT されたリポジトリは bootstrap フロー自体をスキップする
- **既存データ**: 既存のリポジトリレコードには影響しない (新規登録時のみ)
