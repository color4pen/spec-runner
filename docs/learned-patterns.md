# Learned Patterns

ワークフロー完了時に抽出されたパターンの蓄積。
continuous-learning スキルが追記し、distill-learnings / promote-rule が消費する。

---

## 2026-04-16 — Phase 2: GitHub OAuth 認証とアプリケーション基盤

**Type**: new-feature
**Outcome**: completed (approved at iteration 2)

### Review Patterns

#### Spec Review (6.80 → 7.85, +1.05)
- **tasks.md と design.md の矛盾 (HIGH)**: tasks.md に `@auth/drizzle-adapter` のインストールが記載されていたが、design.md は JWT 戦略を採用し Drizzle Adapter は不要と明記していた。設計ドキュメントと実装タスクの間の依存関係の矛盾は HIGH severity で検出される
- **セキュリティ仕様の不足 (MEDIUM x3)**: OAuth scope の選定根拠未記載、トークン失効時の挙動未定義、入力バリデーション要件未定義。セキュリティ関連の仕様は「正常系だけでなく異常系・エッジケースの明記」が必須
- **ページネーション未定義 (MEDIUM)**: リスト系 API のページネーション・上限は仕様段階で定義すべき。実装時に後付けするとアーキテクチャに影響する

#### Code Review (6.50 → 7.40, +0.90)
- **IDOR（Insecure Direct Object Reference）が最頻出パターン (HIGH x3)**: 認証チェック（authn）は入っているが認可チェック（authz = 所有権検証）が欠落するパターンが3箇所で発生。`session-actions.ts` の新規コードには正しく所有権チェックが入っていたが、`actions.ts` の既存 Server Actions と SSE エンドポイントには未適用だった
- **新旧コードの一貫性の欠如**: 新規ファイル（`session-actions.ts`）では正しいパターン（`verifySessionOwnership`）を実装していたが、既存ファイル（`actions.ts`）の既存関数に同じパターンを適用していなかった。新しいセキュリティパターンを導入した際は、既存コードへの遡及適用が必要
- **非トランザクション操作のロールバック (MEDIUM)**: 外部 API 呼び出し + DB 操作の組み合わせで、部分的失敗時のロールバック処理が漏れやすい

### Error Patterns
- **Lint エラー (retry 1回で解決)**: `no-explicit-any` (3件), `no-unused-vars` (1件), `no-img-element` (1件)。build-fixer で自動修正。TypeScript の strict な型付けと Next.js の Image コンポーネント使用は初回実装時に注意すべき
- **verification は Build/TypeCheck/Test が安定**: 42/42 テスト PASS、型チェック PASS。Lint のみがリトライ対象だった

### Design Decisions
- **Auth.js v5 + JWT 戦略**: DB アダプタに縛られず独自スキーマで管理できる。ただし JWT ペイロードサイズ増大と即時無効化不可のトレードオフがある
- **Route Groups によるレイアウト分離**: `(auth)` と `(protected)` で認証境界を構造的に表現。API Route は Route Groups の外にあるため個別の認証ガードが必要（これが IDOR 検出につながった）
- **DB 主導のセッション管理**: Managed Agents API の sessions.list() はフィルタがなく N+1 問題が発生するため、requests 中心モデル（repositories → requests → sessions）で紐付けを管理

### Lessons
- **認証(authn)と認可(authz)は別の関心事**: 認証ミドルウェアやレイアウトの認証チェックを通過しても、リソースの所有権検証は個別のエンドポイント/アクションで必要。Route Groups の構造的保護が API Route に及ばないことが典型的な見落としパターン
- **仕様レビューで設計ドキュメント間の矛盾を検出できる**: tasks.md と design.md の不整合を spec-review が HIGH で検出し、実装前に解消できた。仕様段階での矛盾検出は実装コストを大幅に削減する
- **既存コードへのセキュリティパターン遡及適用を忘れない**: 新機能で導入したセキュリティパターン（所有権検証）は、既存の関連コードにも必ず適用する。code-review の IDOR 検出がこれをカバーした
- **外部 API + DB の2段階操作にはロールバック設計が必要**: Managed Agents API でセッション作成後に DB INSERT が失敗するケースのロールバック処理が architecture カテゴリで検出された
- **Lint ルール違反は build-fixer で自動解決可能**: ESLint の `no-explicit-any`, `no-unused-vars`, Next.js の `no-img-element` は機械的に修正可能。verification のリトライで対応できる

---

## 2026-04-16 — DB スキーマ再設計: リクエスト中心モデルへの移行

**Type**: spec-change
**Outcome**: completed (spec-review: iter 2 approved 6.8→8.0, code-review: iter 2 approved 7.10→7.90)

### Review Patterns

#### Spec Review (6.8 → 8.0, +1.2)
- **リスト API のページネーション未定義 (HIGH)**: `listRequests`, `listSessionsByRequest`, `listUserRepositories` にページネーション・上限の仕様がなかった。review-lessons で既知パターン（出現: 1回）だったが再発。リスト系 API を定義する際は仕様段階で `limit`/`offset` パラメータとデフォルト上限を必ず明記する
- **リポジトリ登録時の GitHub アクセス権検証欠如 (HIGH)**: `getOrCreateRepository` が認証済みユーザーの GitHub リポジトリアクセス権を検証せず、任意のリポジトリを登録できてしまう仕様だった。外部サービス連携時は「認証済み≠認可済み」を仕様段階で区別する
- **ステータス遷移ルール（状態マシン）未定義 (MEDIUM)**: `requests.status` の許容遷移パスが未定義。CRUD 設計時に status カラムがある場合、遷移ルール（状態マシン）を仕様に明記する
- **CRUD の D（Delete）方針未記載 (MEDIUM)**: リクエスト削除の方針が明示されていなかった。意図的に省略する場合も Non-Goal として記載が必要
- **既存 spec と実装の型乖離 (MEDIUM)**: `users.id` の型が既存 spec（UUID TEXT）と実装（INTEGER autoincrement）で乖離していた。delta spec で変更を重ねる際は、既存 spec との整合性チェックが不可欠
- **アプリ層の暗黙的ルール未仕様化 (MEDIUM)**: `updated_at` の更新方針（SQLite に ON UPDATE トリガーがないためアプリ層で明示更新）が仕様に書かれていなかった。ORM/DB の制約に起因するアプリ層の規約は仕様に明記する
- **CHECK 制約による多層防御の方針未記載 (MEDIUM)**: TEXT 型 enum カラムに CHECK 制約を付けるかの方針が仕様になかった。防御の多層化（DB 制約 + アプリバリデーション）の方針を仕様段階で決定する

#### Code Review (7.10 → 7.90, +0.80)
- **Server Action の IDOR 再発 (HIGH)**: `findRepositoryByFullName` が `'use server'` エクスポートで raw `userId` を受け取っており、認証済みユーザー以外の userId で呼び出し可能だった。Phase 2 の IDOR パターンと同根。Server Action は「外部からの入力として userId を受け取らない」原則を徹底する
- **N+1 クエリパターン (MEDIUM x2)**: `listUserRepositories` で N 件のリポジトリ取得後に N 回の COUNT クエリ。`getOrCreateRepository` でも同様。リスト取得 + 関連カウントはインライン subquery または JOIN + GROUP BY で1クエリにまとめる
- **所有権検証ロジックの重複 (MEDIUM)**: `listSessionsByRequest` が `verifyRequestOwnership` を呼ばずにインラインで同等の JOIN クエリを書いていた。検証ロジックは既存のヘルパーに委譲し、重複を避ける
- **テストが実関数ではなく定数配列のみを検証 (MEDIUM)**: TC-012 で `createRequest` の型バリデーションを定数配列のチェックのみで済ませていた。SQLite の TEXT 型は Drizzle の enum オプションで CHECK 制約を生成しないため、アプリ層バリデーションの実テストが必要

### Error Patterns
- **Lint/Build/Test すべて PASS（リトライなし）**: Phase 2 では Lint リトライが1回発生したが、今回は初回で全フェーズ PASS。Lint ルール違反の学習が効いている
- **verification は安定**: Build, TypeCheck, Lint, Test（61→62 tests）すべて初回 PASS。セキュリティスキャナは未設定（N/A）

### Design Decisions
- **リクエスト中心の3層スキーマ（repositories → requests → sessions）**: `user_sessions` の2テーブル構造からの再設計。FK チェーンによる所有権検証で IDOR を構造的に防止。ADR-20260416-request-centric-schema として記録
- **FK チェーンによる所有権検証（user_id の冗長化を排除）**: 各テーブルに user_id を持たせず、sessions → requests → repositories → users の JOIN で検証。SQLite ローカル DB では JOIN コスト無視可能。データ不整合リスクを排除
- **CASCADE DELETE でリポジトリ配下を連鎖削除**: リクエスト・セッションの孤立レコードを防止。マイグレーションは INSERT OR IGNORE + IF NOT EXISTS で冪等性確保
- **旧 ADR（session-binding-design）の supersede**: スキーマ再設計により旧 ADR が陳腐化。明示的に superseded として新 ADR から参照

### Lessons
- **IDOR は認証(authn)と認可(authz)の混同から繰り返し発生する**: Phase 2（`actions.ts` の既存関数）に続き、Phase 3 でも `findRepositoryByFullName` で再発。Server Action が `userId` を引数に取るパターンは IDOR の強いシグナル。「Server Action は外部入力として userId を受け取らず、内部で `getAuthenticatedUser()` を呼ぶ」をルール化すべき
- **リスト API のページネーションは review-lessons 既知パターンなのに再発した**: spec-review が検出したが、仕様作成段階で prevent できていない。constraints.md への昇格（「リスト系 API は必ず limit/offset を定義」）が必要
- **spec-change では既存 spec との整合性チェックが最重要**: users.id の型乖離（UUID TEXT vs INTEGER）が delta spec 作成時に見落とされていた。spec-change 時は変更対象だけでなく、関連する既存 spec を必ず突合する
- **状態を持つリソースには遷移ルールの明記が必須**: status カラムの仕様に遷移ルール（状態マシン）がないと、実装者が独自判断で許容遷移を決めてしまう。spec 段階で terminal status と許容パスを定義する
- **N+1 クエリは「リスト取得 + 関連データ集計」の組み合わせで発生する**: 今回は repositories の一覧取得 + 各リポジトリの requests 件数カウントで典型的に発生。インライン subquery パターンで解決。パフォーマンスレビューの定番チェックポイント
- **テストはアプリ層の実バリデーションを検証すべき**: DB 制約（特に SQLite の TEXT enum）に依存せず、アプリ層のバリデーション関数を直接テストする。DB 制約の有無は実装依存であり、テストの信頼性に影響する
