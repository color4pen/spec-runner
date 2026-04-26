# Propose UI 改善 — ディレクトリ対応 + 導線改善

## Meta

- **type**: refactoring
- **date**: 2026-04-25
- **author**: color4pen

## ワークフローオプション

- **enabled**: []

## 背景

PR #6 で追加された change folder ビューアに2つの問題がある:

1. **specs ディレクトリが開けない**: change folder 内の `specs/` ディレクトリをクリックすると「Unexpected response format from GitHub Contents API」エラーが発生する。`getFileContent()` がディレクトリに対して呼ばれ、GitHub API がファイルではなくディレクトリ一覧を返すため
2. **propose セッション画面に飛ばされる**: propose セッション起動後にストリーミング画面へ遷移し、リクエスト詳細画面（change folder 閲覧）に戻りづらい

## 対象範囲

- `src/app/(protected)/repos/[owner]/[repo]/_components/workspace-client.tsx` — UI コンポーネント
- `src/lib/github-api.ts` — `getDirectoryContents()` の再帰対応または UI 側のハンドリング
- `src/lib/propose-actions.ts` — `getChangeFolderFiles()` の再帰対応

## 振る舞い不変の確認方法

- 既存テストが通ること
- change folder ビューアで proposal.md, design.md, tasks.md が引き続き閲覧可能
- propose セッションの起動・完了検知が正常に動作

## 要件

1. change folder ビューアでディレクトリ（type: 'dir'）をクリックした場合、ファイル取得ではなくディレクトリ内容を展開表示する
2. `specs/app-layout/spec.md` のようなネストされたファイルも閲覧可能にする
3. propose セッション起動後、リクエスト詳細画面に留まる。セッションの進行状況はインラインで表示する（ストリーミング画面への自動遷移をやめる）

## 受け入れ基準

- [ ] specs ディレクトリをクリックして中のファイル一覧が表示される
- [ ] ネストされた spec.md ファイルの内容が閲覧可能
- [ ] propose セッション起動後にリクエスト詳細画面に留まる
- [ ] 既存テストが通る
