# リポジトリ登録時の bootstrap 済み判定

## Meta

- **type**: spec-change
- **date**: 2026-04-25
- **author**: color4pen

## ワークフローオプション

- **enabled**:
  - test-case-generator
  - adr

## 背景

リポジトリ登録（registerRepository）時に bootstrap_status を一律 `uninitialized` で設定している。そのため、既に openspec-workflow がセットアップ済みのリポジトリを追加しても bootstrap を要求される。spec-runner 自身のリポジトリのように bootstrap 済みのリポジトリでは不要な手順が発生する。

## 現在の仕様

- `registerRepository()` は bootstrap_status を常に `'uninitialized'` で INSERT する
- ユーザーは登録後に手動で bootstrap を実行する必要がある

## 変更後の仕様

- `registerRepository()` 実行時に GitHub API で対象リポジトリの以下のファイル/ディレクトリの存在を確認する:
  - `openspec/project.md` — OpenSpec 初期化の証拠
  - `requests/active/` — openspec-workflow bootstrap の証拠
- 両方存在する場合: `bootstrap_status: 'ready'` で登録
- いずれか欠けている場合: `bootstrap_status: 'uninitialized'` で登録（従来動作）
- 2つの API 呼び出しは並列実行する（レイテンシ最小化）

## 影響範囲

- `src/lib/repository-registration-actions.ts` の `registerRepository()` 関数のみ
- 既存のリポジトリレコードには影響しない（新規登録時のみ）
- API 契約の変更なし（戻り値の型は変わらない、bootstrap_status の値が変わるだけ）

## 受け入れ基準

- [ ] openspec-workflow セットアップ済みリポジトリが `ready` で登録される
- [ ] 未セットアップのリポジトリが `uninitialized` で登録される
- [ ] openspec/project.md のみ存在（requests/active/ なし）の場合は `uninitialized`
- [ ] GitHub API エラー時は安全側に倒して `uninitialized` で登録される
- [ ] 既存テストが通る

## 補足

- 実装は既に `repository-registration-actions.ts` に着手済み（未コミット）
- GitHub Contents API (`GET /repos/{owner}/{repo}/contents/{path}`) を使用
- 404 は「存在しない」として扱う（エラーではない）
