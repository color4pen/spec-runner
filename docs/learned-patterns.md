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
- **DB 主導のセッション管理**: Managed Agents API の sessions.list() はフィルタがなく N+1 問題が発生するため、`user_sessions` テーブルで紐付けを管理

### Lessons
- **認証(authn)と認可(authz)は別の関心事**: 認証ミドルウェアやレイアウトの認証チェックを通過しても、リソースの所有権検証は個別のエンドポイント/アクションで必要。Route Groups の構造的保護が API Route に及ばないことが典型的な見落としパターン
- **仕様レビューで設計ドキュメント間の矛盾を検出できる**: tasks.md と design.md の不整合を spec-review が HIGH で検出し、実装前に解消できた。仕様段階での矛盾検出は実装コストを大幅に削減する
- **既存コードへのセキュリティパターン遡及適用を忘れない**: 新機能で導入したセキュリティパターン（所有権検証）は、既存の関連コードにも必ず適用する。code-review の IDOR 検出がこれをカバーした
- **外部 API + DB の2段階操作にはロールバック設計が必要**: Managed Agents API でセッション作成後に DB INSERT が失敗するケースのロールバック処理が architecture カテゴリで検出された
- **Lint ルール違反は build-fixer で自動解決可能**: ESLint の `no-explicit-any`, `no-unused-vars`, Next.js の `no-img-element` は機械的に修正可能。verification のリトライで対応できる
