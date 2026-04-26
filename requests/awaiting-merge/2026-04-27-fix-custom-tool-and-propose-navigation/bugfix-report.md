# Bugfix Report: 2026-04-27-fix-custom-tool-and-propose-navigation

## Meta

- **reported**: 2026-04-27
- **severity**: normal
- **status**: investigating

## Bug 1: register_branch Custom Tool が Agent に登録されていない

### Symptom

- **何が起きたか**: propose セッションで agent が register_branch を呼ばず、branch_name が DB に保存されない
- **発生条件**: 全ての propose セッション
- **エラーメッセージ**: なし（サイレント障害）

### Reproduction

- **再現手順**:
  1. actions.ts:68 の createAgent の tools 配列を確認
  2. `[{ type: 'agent_toolset_20260401' }]` のみで REGISTER_BRANCH_TOOL が含まれていない
- **再現結果**: コードレベルで再現確認済み

## Bug 2: Propose 起動後にチャット画面へ自動遷移する

### Symptom

- **何が起きたか**: propose 起動後にリクエスト詳細画面からチャット画面に自動遷移する
- **発生条件**: Start Propose 実行時
- **エラーメッセージ**: なし（UI 動線の regression）

### Reproduction

- **再現手順**:
  1. workspace-client.tsx:468-470 を確認
  2. `connectStream()` + `setSelectedManagedSessionId()` が propose 完了後に呼ばれている
- **再現結果**: コードレベルで再現確認済み

## Fix

- **修正内容**:
  - Bug 1: `actions.ts` の `createAgent` tools 配列に `REGISTER_BRANCH_TOOL` を追加
  - Bug 2: `workspace-client.tsx` の propose ハンドラから `connectStream()` + `setSelectedManagedSessionId()` を削除、未使用変数 `result` を除去
- **変更ファイル**:
  - `src/lib/actions.ts`
  - `src/app/(protected)/repos/[owner]/[repo]/_components/workspace-client.tsx`

## Verification

- **修正確認**: コードレベルで確認済み
- **リグレッション**: Build ✓ | Type ✓ | Lint ✓ | Test ✓ (230/230)
- **status**: resolved
