# DB スキーマ再設計: リクエスト・ワークフロー中心モデルへの移行

## Meta

- **type**: spec-change
- **date**: 2026-04-16
- **author**: color4pen
- **depends-on**: requests/done/2026-04-16-phase2-auth-and-app-foundation

## 影響チェック

- **spec**: yes — セッション一覧がリクエスト単位に変わる。ワークスペースの構造が変わる
- **security**: yes — リクエスト単位の所有権チェック、セッションへのアクセスがリクエスト経由になる
- **data-model**: yes — スキーマ再設計が主目的。user_sessions → requests + sessions に分離
- **public-api**: yes — Server Actions の引数・戻り値がリクエスト中心に変わる

## 背景

Phase 2 では user_sessions テーブルで「ユーザーとセッションの直接紐付け」を実装した。しかし今後のワークフロー自動化（Custom Tools + オーケストレーター）に向けて、リクエストがデータモデルの中心になる必要がある。

現在の構造:
```
users → user_sessions (session_id, repo, status)
```

あるべき姿:
```
users → repositories → requests → sessions
```

1リクエストに対して複数セッション（設計・実装・レビュー等）がぶら下がる構造が必要。また、ワークフローの進捗状態をアプリの DB で管理し、ポーリングベースのバックグラウンド実行に備える。

## 目的

DB スキーマを「リクエスト中心」に再設計し、ワークフロー自動化の土台を作る。Phase 2 の user_sessions にとらわれず、あるべき姿からスキーマを定義する。

## 要件

1. **スキーマ再設計**
   - `repositories` テーブル: ユーザーが接続したリポジトリ情報
   - `requests` テーブル: ワークフローの単位。type, status, content, 影響チェック結果を保持
   - `sessions` テーブル: Managed Agents Session との紐付け。role（implementer/reviewer/fixer）、step、status を保持
   - `user_sessions` テーブルの廃止（requests + sessions に分離）

2. **Drizzle マイグレーション**
   - 既存データの移行（user_sessions → requests + sessions）
   - マイグレーションの冪等性確保

3. **Server Actions の更新**
   - セッション操作がリクエスト経由になる
   - リクエストの CRUD（作成・一覧・詳細・ステータス更新）
   - リクエストに紐づくセッション一覧

4. **ワークスペース画面の更新**
   - サイドバーにリクエスト一覧を表示（セッション一覧から変更）
   - リクエスト詳細画面（ステータス、紐づくセッション、進捗）
   - リクエスト作成フロー

5. **所有権チェックの更新**
   - リクエスト単位の所有権検証
   - セッションへのアクセスはリクエスト経由で検証

## 受け入れ基準

- [ ] repositories, requests, sessions テーブルが作成されている
- [ ] user_sessions テーブルが廃止されている
- [ ] Drizzle マイグレーションが正常に動作する
- [ ] ワークスペースのサイドバーにリクエスト一覧が表示される
- [ ] リクエストを作成し、セッションを紐づけられる
- [ ] リクエスト所有権チェックが全エンドポイントで動作する
- [ ] 既存テストが新スキーマに対応して通る

## 補足

- 今日の議論で決まった方向性:
  - create-request は将来的にチャットセッションで実現（今回はフォームまたは簡易 UI で可）
  - ワークフローステップは将来 Custom Tools + ポーリングで自動化（今回はステップ管理の DB 構造だけ用意）
  - sessions テーブルの role カラムで implementer/reviewer/fixer を区別
- デプロイ先は引き続きローカル開発（bun dev）
- SQLite + Drizzle ORM は維持（ADR-20260416-sqlite-local-first）
