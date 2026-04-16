## Context

SpecRunner は現在 `users → user_sessions` の2テーブル構造でセッションを管理している。`user_sessions` はユーザーと Managed Agents セッションの1対1の紐付けのみを表現しており、「1つのリクエストに対して複数のセッション（設計・実装・レビュー・修正）がぶら下がる」ワークフロー自動化に対応できない。

技術スタック: Next.js 15 (App Router) + Drizzle ORM + SQLite (better-sqlite3) + Auth.js v5 (JWT)。ローカル開発専用（`bun dev`）。

Phase 2 で学んだ制約:
- IDOR 対策（所有権検証）を全エンドポイントに適用する必要がある
- 外部 API + DB 操作の2段階処理にはロールバック設計が必須
- 新パターン導入時は既存コードへの遡及適用が必要

## Goals / Non-Goals

**Goals:**
- `repositories → requests → sessions` の3層モデルでワークフローの単位を表現する
- リクエスト単位の所有権検証により IDOR を構造的に防止する
- ワークフローステップの状態管理を DB で行い、ポーリングベースの自動化に備える
- 既存データ（user_sessions）を新スキーマに無損失で移行する
- ワークスペース UI をリクエスト中心に再構成する

**Non-Goals:**
- ワークフローの自動実行（ポーリング、Custom Tools 連携）は今回のスコープ外。DB 構造のみ用意
- リクエスト作成のチャット UI（将来的にチャットセッションで実現。今回はフォームまたは簡易 UI）
- リポジトリの自動同期（GitHub API からの自動インポート）。手動接続のみ
- 複数ユーザー間のリクエスト共有・コラボレーション

## Decisions

### D1: テーブル構造 — repositories / requests / sessions の3層

**選択**: `users → repositories → requests → sessions` の4テーブル構成

**代替案**:
- (A) `requests` に `repo` カラムを直接持たせる（repositories テーブルなし）
- (B) 現行の `user_sessions` に `request_id` カラムを追加する

**理由**: (A) はリポジトリ設定（将来的な agent_id, environment_id のデフォルト値等）の置き場がなくなる。(B) は `user_sessions` の命名と責務が不明瞭になり、セッションの role/step 管理が煩雑になる。3層に分離することで各テーブルの責務が明確になり、外部キーによるカスケード削除も自然に表現できる。

### D2: repositories テーブルの設計

**選択**: `repositories(id, user_id, owner, name, full_name, default_branch, created_at)` で、`user_id + full_name` にユニーク制約。

**理由**: 同じリポジトリを複数ユーザーが接続するケースを許容するため、`full_name` だけでなく `user_id` との複合ユニーク制約とする。`owner` と `name` を分離して持つことで、UI 表示やルーティング（`/repos/{owner}/{name}`）で結合操作が不要になる。

### D3: requests テーブルの設計

**選択**: `requests(id, repository_id, type, status, title, content, created_at, updated_at)` で、ワークフローの単位を表現。

- `type`: `new-feature | spec-change | refactoring | bugfix`（将来のワークフロータイプに対応）
- `status`: `draft | in-progress | reviewing | completed | cancelled`
- `content`: リクエストの本文（Markdown）。`request.md` の内容に相当

**理由**: リクエストがワークフローの起点となるため、ワークフローの状態（status）と内容（content）を一元管理する。影響チェック結果は `request.md` 側で管理されるため、DB には含めない（YAGNI）。

### D4: sessions テーブルの設計

**選択**: `sessions(id, request_id, managed_session_id, role, step, status, title, created_at, updated_at)` で、Managed Agents セッションとの紐付けを表現。

- `role`: `implementer | reviewer | fixer | explorer`（ワークフロー内での役割）
- `step`: 自由テキスト（例: `propose`, `implement`, `review`）。将来のステップ定義に柔軟に対応
- `status`: Managed Agents API のステータスをキャッシュ（`active | waiting | completed | archived`）

**理由**: `session_id` を `managed_session_id` にリネームして、DB の主キー `id` との混同を防ぐ。`role` と `step` を持つことで、同じリクエストに対する複数セッション（設計セッション、実装セッション等）を区別できる。

### D5: 主キーの型 — INTEGER AUTO INCREMENT を維持

**選択**: 全テーブルで `integer('id').primaryKey({ autoIncrement: true })` を維持。

**代替案**: UUID v4 に変更する。

**理由**: SQLite のローカルファイル DB であり、分散環境での ID 衝突は起きない。AUTO INCREMENT の方がインデックス効率が良く、デバッグ時の可読性も高い。既存の `users` テーブルとの一貫性も保てる。spec の `database` capability では UUID が記載されているが、実装（`schema.ts`）は INTEGER を使っている。実装に合わせる。

### D6: 所有権検証の経路

**選択**: リクエスト所有権は `requests → repositories → users` のチェーンで検証。セッションアクセスは `sessions → requests → repositories → users` で検証。

**代替案**: 各テーブルに `user_id` を冗長に持たせて直接検証する。

**理由**: 冗長な `user_id` はデータ不整合のリスクがある。外部キーチェーンによる検証はクエリが1回の JOIN で済み、データ整合性も外部キー制約で担保される。SQLite のローカル DB では JOIN のコストは無視できる。

### D7: マイグレーション戦略 — 段階的移行

**選択**: Drizzle Kit で新テーブル作成 → データ移行スクリプト → 旧テーブル削除の3段階。

1. 新テーブル（repositories, requests, sessions）を作成
2. `user_sessions` のデータを `repositories` → `requests` → `sessions` に変換・挿入
3. アプリケーションコードを新テーブル参照に切り替え
4. `user_sessions` テーブルを削除

**理由**: ローカル開発専用のため、ダウンタイムやブルーグリーンデプロイは不要。ただし、マイグレーションの冪等性は確保する（re-run で重複データが生じない）。

### D8: Server Actions の再編

**選択**: `session-actions.ts` を `request-actions.ts`（リクエスト CRUD + 所有権検証）と `session-actions.ts`（セッション操作、リクエスト経由の所有権検証）に分割。

**理由**: 責務の分離。リクエスト操作とセッション操作は呼び出し元が異なる（リクエスト一覧 vs セッション操作）。既存の `verifySessionOwnership` は `verifyRequestOwnership` + `verifySessionAccess` に分解する。

## Risks / Trade-offs

- **マイグレーション時のデータ損失** → `user_sessions` から `requests` への変換で、1 user_session = 1 request + 1 session のマッピングを行う。repo 情報から `repositories` レコードを自動生成。変換前にバックアップを取る手順をタスクに含める
- **所有権検証の JOIN コスト増加** → SQLite ローカル DB のため実質的な影響なし。将来のスケーリング時に再検討
- **UI の破壊的変更** → サイドバーの表示単位が変わるため、既存のワークフロー（セッション直接選択）が一時的に使えなくなる。リクエスト経由のフローに統一することで長期的には改善
- **step カラムの自由テキスト** → enum にしないことで柔軟性を確保するが、typo やバリデーション漏れのリスクがある → アプリケーション層で定数定義 + バリデーションを行う
- **外部 API + DB の2段階操作** → Phase 2 の learned-pattern に基づき、セッション作成時のロールバック処理を sessions テーブルでも同様に実装する

## Migration Plan

1. **スキーマ定義**: `schema.ts` に `repositories`, `requests`, `sessions` テーブルを追加
2. **マイグレーション生成**: `bunx drizzle-kit generate` で SQL マイグレーション生成
3. **データ移行**: `user_sessions` → 新テーブルへのデータ変換スクリプトをマイグレーション SQL に含める
4. **Server Actions 更新**: `request-actions.ts` 新設、`session-actions.ts` を新スキーマ対応に書き換え
5. **UI 更新**: ワークスペースのサイドバー・メインエリアをリクエスト中心に変更
6. **旧テーブル削除**: `user_sessions` テーブルと関連コードを削除
7. **ロールバック**: マイグレーション適用前に `data/spec-runner.db` のバックアップを取る。失敗時はバックアップから復元

## Open Questions

- `repositories` テーブルに `agent_id` / `environment_id` のデフォルト値を持たせるか → 今回はスコープ外とし、リクエスト作成時に指定する方式とする
- `requests.content` の最大長制限 → SQLite の TEXT 型は実質無制限だが、UI 側でバリデーションを入れるか → 今回は制限なしで進める
