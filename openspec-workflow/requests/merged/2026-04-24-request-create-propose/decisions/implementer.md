# Implementer Decisions

## 実装前宣言

- createBoundSession() の role 型を `'propose'` を含む形に拡張する :: session-actions.ts の既存 union 型に propose を追加しないと型エラーになり DB インサートできない
- schema.ts で role enum に 'propose' を追加 + requests に enabled TEXT nullable カラムを追加する :: Drizzle の enum 型は TypeScript の union 型として扱われ、DB 制約はアプリ層バリデーションで補う（SQLite TEXT 型は CHECK 制約を生成しない既存パターン）
- Drizzle マイグレーションを手動 SQL で作成する :: drizzle-kit generate を実行するとスキーマ全体を再評価するため、差分 SQL を直接 drizzle/ に追加するのが安全
- createRequest() の引数をオブジェクト形式にリファクタし enabled フィールドを追加する :: 既存の positional 引数を変更すると workspace-client.tsx の呼び出し側も同時修正が必要
- VALID_ENABLED_OPTIONS 定数を request-actions.ts に定義し server action 層でバリデーションする :: DB レベルでの制約がなく、アプリ層バリデーションが唯一の防衛線（constraints.md パターン）
- enabled の JSON シリアライズ/デシリアライズは request-actions.ts 内で完結させる :: 呼び出し元の UI には string[] として公開し、JSON 実装詳細を漏らさない
- startPropose() は startBootstrap() と同構造にする :: 実績のある try/catch ロールバックパターン。request status draft -> in-progress に遷移し、失敗時は draft に戻す
- propose 用のブランチ名生成・メッセージ生成は純粋関数として propose-actions.ts 内に定義する :: テスタビリティのために副作用ゼロの純粋関数として分離する
- session-completion-handler.ts の switch に 'propose' case を追加する :: default case が既存で、propose は PR 作成しない独自フロー
- getDirectoryContents() と getFileContent() を github-api.ts に追加する :: 既存の pure wrapper パターンに合わせ、404 は空配列/null で返す
- workspace-client.tsx に enabled チェックボックスグループを追加し、Start Propose ボタンと Change Folder ビューアを追加する :: 既存の bootstrap パターンを参照しダイアログ UI を再利用
- propose セッション完了後のポーリングは既存の startStatusPolling パターンを流用しリクエスト status 変化を検知する :: 新しいポーリング機構は作らず既存の /api/repos/{owner}/{repo}/status エンドポイントを確認する
- テストは bun:test + createTestDb() パターンで書く :: 既存テストが全て同パターンを使用
