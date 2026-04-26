# Learned Patterns

last-distilled: 2026-04-27 00:14

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

---

## 2026-04-17 — マネージドエージェント向け Bootstrap 機能

**Type**: new-feature
**Outcome**: completed (spec-review: iter 2 approved 6.85→7.90, code-review: iter 2 approved 6.72→7.45)

### Review Patterns

#### Spec Review (6.85 → 7.90, +1.05)
- **新機能の状態遷移が既存状態マシンと未接続 (HIGH)**: bootstrap request を `in-progress` で直接作成していたが、request-management spec の正規パスは `draft -> in-progress`。既存の状態マシンに新機能のライフサイクルを統合する必要があった。新しいエンティティが既存リソースの状態マシンに影響する場合、仕様段階で遷移パスの整合性を検証する
- **delta spec と実装の型定義乖離の踏襲 (HIGH)**: `default_branch` カラムが既存 spec では `TEXT NOT NULL DEFAULT 'main'` だが実装は nullable。delta spec がこの乖離を是正せず踏襲していた。delta spec 作成時は、変更対象カラムだけでなく隣接カラムの spec/実装乖離も確認する
- **design.md と tasks.md の関数シグネチャ不一致 (MEDIUM)**: `startBootstrap` の引数が design.md と tasks.md で異なっていた。設計ドキュメント間の関数インターフェース定義は一箇所を正とし、他は参照する形にする
- **型拡張が spec レベルで未定義 (MEDIUM)**: `RepositorySummary` に `bootstrapStatus` / `bootstrapPrUrl` を追加する変更が tasks.md にのみ記載され、spec に型定義の変更がなかった。公開型の拡張は spec レベルで明示する

#### Code Review (6.72 → 7.45, +0.73)
- **IDOR（3回連続再発）(HIGH x2)**: `handleBootstrapSessionCompletedWithoutPr` と `archiveSessionsByRequest` が `'use server'` ファイルで export されながら認証・認可チェックなし。Phase 2、DB スキーマ再設計に続き3回連続。Server Action の IDOR は最も再発しやすいパターンとして定着。「`'use server'` ファイルの全 exported async 関数に `getAuthenticatedUser()` があるか」を機械的にチェックすべき
- **定義済み関数の未呼び出し (MEDIUM)**: `processBootstrapSessionEvent` と `handleBootstrapSessionCompletedWithoutPr` が定義されていたが SSE ストリーム処理から呼び出されていなかった。関数定義とその呼び出し元の接続が実装時に漏れるパターン。テストケース（TC-028/TC-029）で検出可能だったが、テスト実装も不完全だった
- **正規表現のアンカー不足 (MEDIUM)**: `PR_URL_REGEX` がバリデーション用途にもかかわらず非アンカー。検証用 regex と抽出用 regex は別に定義し、検証用には `^` と `$` アンカーを付ける
- **関数名のタイポ (MEDIUM)**: `processBooststrapSessionEvent`（s が余分）。公開 API/Server Action の関数名は後から修正コストが高いため、命名時に注意する
- **変換コードの重複（2 iteration 未修正）(MEDIUM)**: `RepositoryWithBootstrap` への変換コードが 5 箇所以上で重複。code-fixer が 2 iteration とも未対応。繰り返し検出される重複パターンはヘルパー関数抽出で解消する

### Error Patterns
- **Lint リトライ 1 回、他は初回 PASS**: Build/TypeCheck/Test(116)/Security すべて初回 PASS。Lint のみ 1 回リトライ。Phase 2 と同じ傾向で、Lint ルール違反は build-fixer で機械的に解決可能
- **verification は安定**: 3 フェーズ連続（Phase 2、DB スキーマ再設計、Bootstrap）で Build/TypeCheck/Test が初回 PASS。ワークフローの品質ゲートとして安定して機能している

### Design Decisions
- **`'use server'` の export 制約による純粋関数分離**: `'use server'` ファイルから非 async 関数を export できないため、`bootstrap-utils.ts` を新設して型定義と純粋関数（`validateBootstrapTransition`, `extractPrUrl`）を分離。Server Action の技術的制約を設計に反映する好例
- **createRequest ガード回避のための直接 DB INSERT**: `startBootstrap` 実行時は `bootstrapStatus === 'bootstrapping'` であり、`createRequest` の bootstrap ガード（`ready` でないと作成不可）が発動する。bootstrap request は `createRequest` を経由せず直接 INSERT で作成。ガード条件の例外を仕様で明示する必要がある
- **better-sqlite3 / bun:sqlite 非互換のテスト回避策**: `getDb()` が `better-sqlite3` を使用し Bun テスト環境では動作しない。`createTestDb()` (bun:sqlite) による DB 層テストとソースコード静的検証の 2 種類で対応。テスト環境の制約はプロジェクト固有の対処法として記録しておく価値がある

### Lessons
- **IDOR は「`'use server'` ファイルの exported async 関数」を機械的にスキャンすることで防止すべき**: 3 フェーズ連続で IDOR が検出されている。人間のレビューではなく、静的解析または checklist の機械的チェックが必要。`export async function` が `getAuthenticatedUser()` を冒頭で呼んでいるかのパターンマッチが有効
- **delta spec は変更対象の周辺カラムの既存乖離も是正する**: `default_branch` の乖離は既存から存在していたが、delta spec 作成時に見落とされた。変更対象テーブルの全カラムを spec と実装で突合する習慣が必要
- **新機能の状態遷移は既存の状態マシンに統合する**: 独自の遷移パスを作ると状態マシンのバイパスが発生し整合性が崩れる。既存の `updateRequestStatus` 経由で遷移させることで、バリデーションを一元化できた
- **code-fixer が未対応の MEDIUM 指摘は蓄積する**: `RepositoryWithBootstrap` 変換コードの重複は 2 iteration とも未修正で approved された。blocking ではない MEDIUM 指摘はワークフロー内で解消されにくいため、技術的負債として認識すべき
- **関数定義と呼び出し元の接続は実装とテストの両方で検証する**: 関数が定義されていても呼び出されていないケースは、テストケースが呼び出しフローをカバーしていれば検出可能。TC レベルでの end-to-end シナリオが重要

---

## 2026-04-18 — Bootstrap セッションライフサイクル

**Type**: new-feature
**Outcome**: completed (spec-review: iter 2 approved 6.70→7.75, code-review: iter 2 approved 6.95→7.50)

### Review Patterns

#### Spec Review (6.70 → 7.75, +1.05)
- **既存状態マシンとの遷移パス不整合（4回連続）(HIGH)**: `cancelBootstrap` の pr_pending キャンセル時に `reviewing -> cancelled` 遷移が必要だが、既存の request 状態マシンでは許可されていなかった。前フェーズでも「新機能の状態遷移が既存状態マシンと未接続」が HIGH で検出されており、4フェーズ連続で状態マシン関連の指摘が発生。状態を持つリソースに新しい遷移パスを追加する場合、既存の状態マシン定義を必ず突合する
- **delta spec と既存 spec の CHECK 制約シナリオ競合 (HIGH)**: database delta spec で `bootstrap` を追加する際、既存 spec のどのシナリオを置き換えるかが曖昧だった。delta spec の MODIFIED セクションでは既存 spec の対応シナリオを明示的に参照する必要がある
- **モジュール設計の曖昧さ — `'use server'` vs 純粋関数 (MEDIUM x2)**: session-completion-handler と vault-actions が `'use server'` なのか純粋 lib なのかが不明確で、OAuth トークンの受け渡し方法や IDOR リスクに直結していた。API Route から Server Action を呼ぶのは Next.js のアンチパターン。モジュール境界と呼び出しコンテキスト（Server Action / API Route / lib）は仕様段階で明確化する
- **冪等な再実行の考慮不足 (MEDIUM)**: 再 bootstrap 時に古いブランチが残っている可能性が未定義。事前チェック（`getBranchExists`）+ 削除で冪等性を保証する仕様を追加。失敗→再実行のシナリオは仕様段階で明示的に検討する
- **SDK 型定義の事前調査義務 (MEDIUM)**: Anthropic Managed Agents SDK のイベント型（`session_updated` 等）の正確な構造が未確認のまま設計に含まれていた。外部 SDK に依存する設計は、実装前に型定義を調査し仕様に反映する

#### Code Review (6.95 → 7.50, +0.55)
- **状態マシン違反 — 終端ステータスの上書き (HIGH)**: `cancelBootstrapRequestsForRepository` が `completed` や `cancelled` 等の終端ステータスも含めて全 bootstrap request をキャンセルしていた。`ALLOWED_TRANSITIONS` で定義された状態マシンの遵守が不十分。WHERE 句に非終端ステータスのフィルタ（`inArray`）を追加して解決。一括更新クエリでは終端ステータスの除外フィルタが必須
- **動的 import と静的 import の混在 (MEDIUM x2)**: `bootstrap-actions.ts` で同一モジュール（`github-api.ts`）の関数を静的 import と動的 import の両方で取得していた。不完全なリファクタリングの痕跡。同一モジュールからの import は静的 import に統一する
- **操作順序と状態遷移の不整合 (MEDIUM)**: Vault セットアップとブランチ削除がステータス遷移（`bootstrapping`）より前に実行されていたため、Vault 作成成功→ステータス遷移失敗時にロールバックが効かなかった。副作用を伴う操作はステータス遷移後の try ブロック内で実行し、ロールバックを保証する
- **ソースコード静的解析テストの限界 (MEDIUM, 未修正)**: 多数のテストケースが `toContain` でソースコードの文字列存在を検証するだけで、実際のランタイム動作を検証していなかった。iter 2 でも技術的負債として残存。テスト戦略として source-text 検証は指示系（directive）チェックに限定し、ビジネスロジックはモックを使った振る舞いテストで検証すべき
- **デッドコードの残存 (MEDIUM)**: `extractPrUrl` が本番コードから未参照だがテスト付きで残存していた。リファクタリング後のデッドコード検出は code-review で確実に捕捉されている

### Error Patterns
- **全フェーズ初回 PASS（リトライなし）**: Build/TypeCheck/Lint/Test(149→144)/Security すべて初回 PASS。4フェーズ連続で verification が安定。Lint リトライも発生せず、過去の学習が実装品質に反映されている
- **verification の成熟**: Phase 2 では Lint リトライ 1 回、Bootstrap 初回も Lint リトライ 1 回だったが、今回は完全初回 PASS。ワークフローの品質ゲートとして最も安定したフェーズ

### Design Decisions
- **SSE route の責務分離**: SSE route はイベントストリーミングのみに専念し、bootstrap 固有ロジック（完了検知、archive、PR 作成）を session-completion-handler に分離。将来の execute-request 対応（複数 role）への拡張基盤
- **role ベースの完了ハンドラ分岐**: セッション完了時の処理を session role で分岐する汎用的な仕組み。bootstrap は最も単純なケース（1 session / 1 role）として実装し、将来の implementer / reviewer / fixer role に拡張可能
- **Vault の書き込み専用設計**: Vault に GitHub OAuth トークンを保存し、MCP 経由でエージェントに提供。409 エラー時は既存 Vault を削除して再作成する冪等な設計
- **ADR-0011 で ADR-0010 D6 を supersede**: bootstrap のセッション管理がライフサイクルに統合されたことで、旧 ADR の session-binding 設計を明示的に supersede

### Lessons
- **状態マシン関連の指摘は4フェーズ連続で発生している**: Phase 2（遷移ルール未定義）、DB スキーマ再設計（遷移パス未定義）、Bootstrap 初回（既存状態マシンと未接続）、今回（遷移パス不整合 + 終端ステータス上書き）。状態マシンは仕様・実装の両段階で最も頻出する指摘カテゴリであり、constraints への昇格が急務
- **delta spec のマージ戦略はシナリオ単位の参照が必要**: 既存 spec のどのシナリオを置き換えるかを明示しないと、archive 時のマージで矛盾が残る。delta spec 作成時の必須チェックリスト項目とすべき
- **`'use server'` vs 純粋 lib の設計判断は IDOR リスクに直結する**: vault-actions や session-completion-handler のモジュール境界が不明確だったことで、IDOR 懸念と API Route からの Server Action 呼び出しアンチパターンが発生。モジュールの `'use server'` 宣言はセキュリティ設計の一部として仕様段階で決定する
- **一括更新クエリは終端ステータスの除外が必須**: `cancelBootstrapRequestsForRepository` の事例。WHERE 句なしの一括更新は状態マシンを破壊する。一括操作クエリには必ず状態フィルタを含める
- **ソースコード静的解析テストは技術的負債として蓄積する**: better-sqlite3 / bun:sqlite 非互換のためモックテストが困難な現状は理解できるが、source-text 検証で approved されたテストは振る舞い検証に順次置き換える計画が必要
- **verification の初回 PASS 率は学習により向上する**: 過去の Lint エラーパターン（`no-explicit-any`, `no-unused-vars`）を実装時に回避することで、リトライなしの verification が達成されている。continuous-learning のフィードバックループが機能している証拠

---

## 2026-04-24 — Request Create + Propose セッション機能

**Type**: new-feature
**Outcome**: completed (spec-review: iter 2 approved 6.65→8.05, code-review: iter 2 approved 6.55→7.80)

### Review Patterns

#### Spec Review (6.65 → 8.05, +1.40)
- **database/spec.md の delta spec 欠落 (HIGH)**: `requests` テーブルへの `enabled` カラム追加と `sessions.role` CHECK 制約への `'propose'` 追加が、正のスキーマ定義である `database/spec.md` に反映されていなかった。個別ドメインの delta spec（request-management, session-management）だけでは CHECK 制約の更新が漏れる。スキーマ変更時は必ず `database/spec.md` の delta spec も同梱する
- **slug 導出アルゴリズムの仕様化不足 (MEDIUM)**: slug の変換ルール（特殊文字、長さ上限、日本語制限、重複時挙動）が spec レベルで未定義だった。design.md の Open Questions に記載があるだけでは不十分。アルゴリズムの決定的導出が複数モジュールで必要な場合、仕様段階で明示化する
- **`'use server'` 宣言方針の spec 未記載 (MEDIUM)**: propose-actions.ts のモジュール境界が spec に未記載。review-lessons 既知パターン（「モジュールの `'use server'` 宣言はセキュリティ設計の一部」）だったが再発（5フェーズ目）。`'use server'` の宣言は仕様段階で必ず明示する
- **`createRequest()` の引数設計 (MEDIUM)**: 位置引数の5番目に optional parameter を追加する設計は fragile。options object パターンへの移行を仕様段階で決定し、将来の引数追加に備える

#### Code Review (6.55 → 7.80, +1.25)
- **`encodeURIComponent()` によるパス破壊 (HIGH)**: `getDirectoryContents()` と `getFileContent()` で `encodeURIComponent(path)` を使用しており、`/` が `%2F` にエンコードされて GitHub API が 404 を返す。URL パスの構成要素に対して `encodeURIComponent` を使うとスラッシュが破壊される。パスのエンコードはセグメント単位で行うか、そもそもエンコードしない判断が必要
- **パストラバーサル検証の欠如 (HIGH)**: `getChangeFolderFileContent()` がクライアントからの `filePath` パラメータを検証なしで受け入れ、リポジトリ内の任意のファイルを読み取り可能だった。所有権検証（request の ownership）はあっても、ファイルパスの範囲制限がなければ横方向のデータアクセスが可能。Server Action でファイルパスを受け取る場合は必ず想定プレフィックスの `startsWith` チェック + `..` 排除を行う
- **slug 日付ソースの不一致 (MEDIUM x2)**: `startPropose()` が `new Date()` で slug を生成し、下流の `getChangeFolderFiles()` と `session-completion-handler` が `request.createdAt` で再導出していた。日付境界（23:59 UTC → 00:01 UTC）で slug が不一致になるレイテントバグ。slug の導出ソースは単一にする（`request.createdAt` に統一）
- **ロールバック不完全 — orphaned session (MEDIUM)**: `startPropose()` のエラーハンドリングが request status のみ rollback し、作成済みの session を放置していた。外部 API + DB の多段操作では、全リソースの rollback を保証する。これは Phase 2 の「非トランザクション操作のロールバック」パターンの再発
- **所有権検証ロジックの3重複 (MEDIUM)**: `startPropose()`, `getChangeFolderFiles()`, `getChangeFolderFileContent()` で同一の ownership verification + repository join クエリが3箇所に存在。constraints.md 既知パターン（「所有権検証ロジックは既存のヘルパー関数に委譲」）だったが再発。`verifyRequestWithRepository()` ヘルパーを抽出して解消
- **静的解析テストによるビジネスロジック検証 (MEDIUM, 未修正)**: TC-014/015/016 が `toContain` でソースコード文字列を検証するのみ。review-lessons 既知パターン（3フェーズ連続）だが、better-sqlite3 / bun:sqlite 非互換のため mock ベーステストへの移行が進まず。技術的負債として累積中
- **プロンプトインジェクション防御 (MEDIUM)**: request content をそのまま managed agent の指示メッセージに含めていた。XML デリミタ（`<user-request>...</user-request>`）で content boundaries を明示する defense-in-depth 対策を追加

### Error Patterns
- **TypeCheck エラー（retry 1回で解決）**: テストファイルの型キャスト問題で TypeCheck 6 errors が発生。build-fixer で自動修正。Build/Lint/Test は初回 PASS
- **verification は概ね安定**: 5フェーズ連続で Build/Test が初回 PASS。TypeCheck のみ 1 回リトライ。Lint リトライは発生しなかった（過去の学習が効いている）

### Design Decisions
- **`startBootstrap()` パターンの再利用**: `startPropose()` を `startBootstrap()` と同構造（status transition → Vault setup → createBoundSession → sendMessage）で実装。実績パターンの流用により信頼性とスピードを両立
- **request 作成と propose 起動の分離（2ステップ設計）**: `createRequest()` → `startPropose()` の分離により、後から手動で propose を起動するユースケースにも対応可能。単一責任原則に基づく設計判断
- **enabled フィールドの JSON TEXT 保存**: 正規化テーブル（request_enabled_options）ではなく TEXT（JSON 配列文字列）で保存。検索クエリで enabled の中身を参照する要件がないため、オーバーエンジニアリングを回避
- **change folder の GitHub Contents API 閲覧**: クローンではなく Contents API でブランチ上のファイルを読み取り。Next.js デプロイモデルとの相性と低頻度アクセスの前提から選択
- **`'use server'` 制約による純粋関数分離（propose-utils.ts）**: `'use server'` ファイルから非 async 関数を export できない制約に対し、`propose-utils.ts` を新設して slug 導出・ブランチ名生成・メッセージ構築等の純粋関数を分離。テスタビリティの向上にも寄与

### Lessons
- **`encodeURIComponent` はパス全体に適用してはならない**: ディレクトリ区切り `/` がエンコードされて API が破壊される。パスのエンコードはセグメント単位で行うか、そもそもエンコードしない判断が必要。GitHub Contents API のパスパラメータは unencoded で渡す
- **Server Action でファイルパスを受け取る場合、パストラバーサル防止が必須**: 所有権検証だけでは不十分。ファイルパスの範囲を想定プレフィックスに制限する `startsWith` チェックが必要。さらにトレイリング `/` を付加してプレフィックス衝突（`slug-evil/secret.txt` vs `slug`）を防止する
- **決定的導出のソースは単一にする**: slug のように複数モジュールで再導出されるデータは、導出ソース（`request.createdAt` vs `new Date()`）が分散するとレイテントバグを生む。単一ソースの原則を徹底する
- **所有権検証ロジックの重複は5フェーズ連続で検出されている**: Phase 2 から毎回指摘されるパターン。ヘルパー関数（`verifyRequestWithRepository`）の抽出で解消されるが、新規 Server Action 追加時に再発しやすい。constraints に「新規 Server Action は既存の ownership verification ヘルパーを使う」を明記すべき
- **静的解析テスト（source-text 検証）の技術的負債は蓄積し続けている**: 4フェーズ連続で未修正。better-sqlite3 / bun:sqlite 非互換がブロッカーだが、mock.module による回避が可能になりつつある。優先度を上げて対処すべき
- **外部 API + DB の多段操作 rollback は再発パターン**: Phase 2 で初出し、今回も session rollback の漏れとして再発。`createBoundSession` 後のエラーで session が orphaned になるパターン。try-catch の rollback ブロックに全リソースの cleanup を列挙するチェックリスト化が有効
- **プロンプトインジェクション防御はユーザー入力を agent に渡す全箇所で必要**: XML デリミタによる content boundary の明示は defense-in-depth の基本。managed agent にユーザー入力を送信する際は、指示部分と入力部分を構造的に分離する
- **IDOR は今回検出されなかった（5フェーズ目で初めて）**: `getAuthenticatedUser()` パターンが定着し、Server Action での IDOR が初めてゼロだった。constraints / review-lessons への昇格と code-review の繰り返し検出が防止に寄与した証拠。このパターンの学習サイクルは成功している

---

## 2026-04-25 — リポジトリ登録時の bootstrap 済み判定

**Type**: spec-change
**Outcome**: completed (spec-review: iter 1 approved 8.25, code-review: iter 1 approved 8.10)

### Review Patterns

#### Spec Review (8.25, 初回 approved)
- **既存 spec との整合性は依然として最頻出 MEDIUM (MEDIUM)**: `repository-binding/spec.md` の "Explicit registration from search UI" シナリオが `bootstrap_status` を `uninitialized` 固定と記述しており、delta spec の動的判定と矛盾。spec-change では毎回、関連 spec の記述が変更後の挙動と矛盾しないかの突合が必要。5フェーズ連続で consistency 関連の指摘が発生
- **状態マシンの直接 INSERT パスに対する注記不足 (LOW)**: `bootstrap-status-tracking` spec の状態マシン定義に、`ready` で直接 INSERT されるパス（遷移パスに入らない）への言及がない。仕様上は問題ないが読者の混乱を招く。状態マシンに関連する仕様変更時は、遷移パス外の入口も明示すると clarity が向上する
- **引数 4 個は閾値未満だが拡張リスクあり (LOW)**: `detectBootstrapStatus` の引数が 4 つ（token, owner, repo, defaultBranch）。constraints の 5 個閾値には達していないが、将来の引数追加余地を考慮すると options object が望ましい。現時点では対応不要

#### Code Review (8.10, 初回 approved)
- **JSDoc コメントと実装の乖離 (MEDIUM)**: `registerRepository` の JSDoc が `bootstrap_status: 'uninitialized'` 固定と記述されたままで、動的検出への変更が反映されていなかった。実装変更時は JSDoc も同時に更新する。コメントとコードの乖離は maintainability カテゴリの定番指摘
- **末尾スラッシュの不統一 (LOW)**: `getDirectoryContents` のパス引数 `'requests/active/'` に末尾スラッシュがあるが、`getFileContent` 呼び出しでは末尾スラッシュなし。GitHub API は許容するが、同一ファイル内のスタイル統一が望ましい
- **should テストケースの未実装 (LOW)**: TC-012（defaultBranch パラメータ転送の検証）が独立テストとして未実装。TC-007 の URL キャプチャで間接的にカバーされているが、異なるブランチ名での明示テストがない。should priority のため blocking ではない

### Error Patterns
- **全フェーズ初回 PASS（リトライなし）**: Build/TypeCheck/Lint/Test(198)/Security すべて初回 PASS。6フェーズ連続で verification が安定。今回はエラー・リトライ・エスカレーションがゼロ
- **spec-review も code-review も初回 approved**: 過去5フェーズは全て iter 2 で approved だったが、今回は初めて両レビューが iter 1 で approved。constraints / review-lessons の蓄積と、変更範囲の限定（単一関数・追加のみ）が寄与

### Design Decisions
- **`detectBootstrapStatus` をモジュールプライベート関数として配置**: export せず `repository-registration-actions.ts` 内に閉じ込める。将来の再利用ニーズが出たら lib 分離する方針。YAGNI に基づく判断
- **`Promise.all` による並列 API 呼び出し**: `getFileContent` と `getDirectoryContents` を並列実行。登録レイテンシへの影響を最小化。GitHub Contents API は通常 100ms 以下で、追加の API 呼び出しは 2 回のみ
- **エラー時の安全側倒し（`'uninitialized'` フォールバック）**: `detectBootstrapStatus` の try-catch で、あらゆるエラーを catch して `'uninitialized'` を返す。bootstrap が不要なリポジトリに bootstrap を要求するのは inconvenience だが、bootstrap 済みリポジトリを `ready` と誤判定する方がリスクが高い
- **既存の `github-api.ts` 関数の再利用**: 新しい API ラッパーを作らず、既存の `getFileContent` / `getDirectoryContents` を使用。コード量の最小化と保守性の向上

### Lessons
- **初回 approved の達成は constraints / review-lessons の蓄積効果**: 過去5フェーズの学習（IDOR 防止、状態マシン遷移チェック、`'use server'` 認証パターン等）が実装品質に反映された結果、初回のレビューで承認閾値を超えた。continuous-learning のフィードバックループが実証的に機能している
- **spec-change は「関連 spec の突合」が最大の注意点**: 今回も `repository-binding/spec.md` との整合性が MEDIUM で指摘された。spec-change では delta spec の対象だけでなく、変更の影響を受ける全 spec のシナリオを走査する必要がある。6フェーズ連続で consistency 関連の指摘が出ており、仕様作成段階での防止が課題
- **JSDoc コメントの更新漏れは実装変更の副作用**: コードの振る舞いが変わったときに JSDoc が追従しないパターン。自動検出は困難だが、code-review の maintainability カテゴリで確実に捕捉されている。実装者が「関数の振る舞いを変えたら JSDoc も更新する」習慣を持つことが最善の防止策
- **変更範囲の限定は品質向上に直結する**: 今回は単一関数への追加のみで、既存コードの破壊リスクが極小だった。スコープの小ささが初回 approved の主因の一つ。大きな変更を小さな change に分割する戦略の有効性が改めて示された
- **IDOR は2フェーズ連続で検出ゼロ**: 前回に続き今回も IDOR 指摘なし。`getAuthenticatedUser()` パターンの定着と constraints 昇格の効果が持続している。このパターンの学習サイクルは成功として確定

---

## 2026-04-25 — Propose UI 改善: ディレクトリ対応 + 導線改善

**Type**: refactoring
**Outcome**: completed (spec-review: approved 7.95 iter 1, code-review: approved 7.65 iter 1)

### Review Patterns

#### Spec Review (7.95, iter 1 approved)
- **既存 spec との振る舞い変更の明示 (MEDIUM)**: delta spec で既存 spec の「Nested directory listing」シナリオを shallow listing + lazy expansion に置き換えているが、置き換えであることの注記が不足していた。delta spec で既存シナリオの振る舞いを変更する場合、「replaces the previous behavior」等の明示的注記が必要
- **loading state シナリオの未定義 (MEDIUM)**: ディレクトリ展開フェッチ中の UI 状態（loading indicator）が未定義だった。非同期データ取得を伴う UI 操作では、loading / error / success の3状態を仕様段階で定義する
- **trailing slash 付き path validation の未明記 (MEDIUM)**: `startsWith` チェック時の trailing slash 付加方針が spec に未記載。constraints.md に既存パターンがあるにもかかわらず spec で再言及されていなかった。constraints.md で定義済みのセキュリティパターンは、新しい spec でも明示的に参照する

#### Code Review (7.65, iter 1 approved)
- **trailing slash 欠如によるプレフィックス衝突リスク (MEDIUM)**: `changeFolderPath` に trailing `/` が付加されておらず、`startsWith(changeFolderPath)` でプレフィックス衝突が発生しうる。spec-review でも同じ指摘（MEDIUM）。constraints.md 既知パターンだが実装に反映されなかった。ただし既存コード（`getChangeFolderFileContent`）も同一パターンであり pre-existing issue
- **再帰の depth guard 欠如 (MEDIUM)**: `renderFileTree` の再帰に depth guard がない。GitHub API の自然な制限で実害は低いが、防御的実装として `if (depth > 10) return null;` の1行で対応可能。再帰関数には常に depth guard を入れる習慣が有効
- **Server Action 冒頭ロジックの重複 (LOW)**: `getChangeFolderDirectoryContents` と `getChangeFolderFileContent` の冒頭（認証、所有権検証、slug/branch/changeFolderPath 導出、path traversal guard）が完全に重複。新規 Server Action 追加時に同一パターンをコピーペーストする傾向がある。共通部分を helper に抽出する設計を推奨

### Error Patterns
- **全フェーズ初回 PASS（リトライなし）**: Build/TypeCheck/Lint/Test(189/189) すべて初回 PASS。6フェーズ連続で Build/Test が初回 PASS。verification は完全に安定
- **初回イテレーションで承認（リトライなし）**: spec-review、code-review ともに iter 1 で approved。CRITICAL: 0, HIGH: 0。ワークフロー全体で最も効率的な完了。変更範囲が小さい（3ファイル、約120行）refactoring タイプでは iter 1 承認が達成しやすい

### Lessons
- **refactoring タイプは iter 1 承認を達成しやすい**: 新機能追加（5フェーズ連続 iter 2 必要）と比較して、既存パターンの踏襲と変更範囲の限定が iter 1 承認に寄与した。refactoring の weight override（architecture=0.25, maintainability=0.15）も高スコアに有利に作用
- **trailing slash パターンは constraints.md に記載されていても実装時に見落とされる**: spec-review と code-review の両方で検出されたが、既存コード（pre-existing issue）も同じ問題を抱えていた。constraints.md の記述だけでは防止力が弱い。checklist への追加（「`startsWith` で path prefix を比較する場合、trailing `/` を付加しているか」）が有効
- **Server Action の冒頭ロジック重複は新規追加のたびに拡大する**: Phase 5（Request Create + Propose）で所有権検証ロジックの3重複が指摘され `verifyRequestWithRepository` ヘルパーが抽出されたが、今回の `getChangeFolderDirectoryContents` では別の冒頭ロジック（slug/branch/changeFolderPath 導出 + path traversal guard）が再び重複。同種のロジックは Server Action 追加前にヘルパー抽出を検討する
- **IDOR は2フェーズ連続で検出ゼロ**: Phase 5 に続き今回もゼロ。`getAuthenticatedUser()` パターンの定着と constraints / review-lessons の効果が持続している
- **loading/error 状態の仕様化は非同期 UI の標準チェック項目にすべき**: ディレクトリ展開のような非同期操作で loading state が未定義だった。spec-review の review-criteria に「非同期データ取得を伴う UI 操作は loading / error / success の3状態を定義しているか」を追加推奨
- **既存の pre-existing issue は refactoring のスコープ判断が重要**: trailing slash 欠如は pre-existing だが、今回の変更で同じパターンを新規追加したことで MEDIUM 指摘になった。既存問題のある箇所に変更を加える場合、pre-existing issue の修正もスコープに含めるか明示的に判断する

---

## 2026-04-25 — Slug 生成のエージェント委譲 + ブランチ名追跡

**Type**: new-feature
**Outcome**: completed

### Review Patterns

#### Spec Review (6.90 → 7.90, +1.00)
- **公開型拡張の delta spec 欠落 (HIGH)**: `RequestSummary` / `RequestDetail` 型への `branch_name` 追加が tasks.md にのみ記載され、対応する delta spec が存在しなかった。constraints.md「公開型の拡張は spec レベルで明示的に定義する」に違反。型拡張は tasks.md だけでなく delta spec に必ず反映する
- **冪等性シナリオの欠落 (HIGH)**: `register_branch` が同一 `request_id` に複数回呼ばれた場合の挙動が未定義。Custom Tool のような外部エージェントが呼ぶインターフェースは、リトライ・再実行を前提とした冪等性シナリオを初回設計時に含めるべき
- **型記述の揺れ (MEDIUM)**: `request_id` が scenario 間で `integer` と `string-or-integer` で不一致。入力パラメータの型は全 scenario で統一表記する
- **アルゴリズムの曖昧な記述 (MEDIUM)**: branch_name から slug を抽出するロジックが「extracting the slug portion after the prefix」と曖昧。具体的なアルゴリズム（最初の `/` 以降を取得）を spec に明示すべき
- **タイムアウト・断線のシナリオ欠落 (MEDIUM)**: Custom Tool 処理中のタイムアウトと SSE 切断のリカバリ戦略が未記載。外部 API と非同期通信を含むフローでは異常系シナリオを初回 spec に含める

#### Code Review (7.45, iteration 1 で approved)
- **静的解析テスト（source-text toContain）が再び主要な減点要因**: 5 つの must-priority テストケースが `toContain` による静的ソース解析のみ。testing スコア 6/10。review-lessons.md に「source static analysis tests should be limited to directive checks, not business logic verification」と記載済みだが改善されていない（6 フェーズ連続で未修正）
- **path.resolve() 不使用のパストラバーサル検査 (MEDIUM)**: `startsWith` のみの文字列ベースチェック。`path.resolve()` / `path.normalize()` による正規化を前処理に入れるべき
- **Dead code: 受け取るが使わないパラメータ (MEDIUM)**: `customTools` が `createBoundSession` に受け取られるが Anthropic API に渡されない。SDK 未対応なら受け取らないか、明示的な TODO トラッキングを付ける
- **Last-50 イベント取得の脆弱性 (MEDIUM)**: `fetchAndHandleCustomTool` が直近 50 イベントから custom_tool_use を探す実装。長時間セッションでは対象イベントが範囲外になる可能性。ストリーミング中にキャッシュする設計が推奨

### Error Patterns
- **Build 型不一致 (retry 1)**: SSE route で `EventSendParams` 型が SDK の型定義と一致しなかった。SDK 型の変更は verification の Build phase で初めて検出される傾向がある
- **テスト event shape 不一致 (retry 2)**: Build fix 後にテストの期待値が実装と乖離。SDK 型の修正は連鎖的にテストの期待値も壊す。型修正時はテストの event fixture も同時に更新する
- **verification は 3 回目で全 PASS**: Build → Test の連鎖失敗パターン。SDK 型起因のエラーは build-fixer だけでなく test fixture の修正も必要

### Design Decisions
- **Custom Tool Handler のディスパッチャパターン**: `custom-tool-handler.ts` を `session-completion-handler.ts` と対称的なディスパッチャとして設計。`'use server'` なしの lib モジュールで、ツール名によるルーティングを担う。将来の `submit_verdict`, `submit_artifacts` 等の追加が容易
- **register_branch の last-write-wins 冪等性**: 同一 request_id への複数回呼び出しは上書き（last-write-wins）で対応。エラーにしない理由は、エージェントのリトライやブランチ再作成のシナリオを自然に許容するため
- **slug 生成のエージェント委譲**: アプリ側の `generateSlug()` が日本語タイトルで空 slug を生成する問題を、エージェントに slug 決定を委ねることで根本解決。エージェントはリポジトリ文脈を踏まえて英語 slug を生成する

### Lessons
- **冪等性は外部エージェント向けインターフェースの必須要件**: Custom Tool のようにエージェントが呼ぶ API は、リトライ・再実行を前提に設計する。冪等性シナリオを spec 初回作成時に含めるルールを確立すべき
- **静的解析テスト（source-text 検証）の技術的負債は 6 フェーズ連続で未修正**: testing スコアの主要な足枷。mock.module や pure function の export + 直接テストなど、代替手段が提示されているが移行が進んでいない。対処の優先度を上げる必要がある
- **SDK 型変更は Build + Test の連鎖失敗を引き起こす**: SDK の型定義に依存するコードを修正する際は、実装だけでなくテストの event fixture も同時に更新する。build-fixer の修正が test failure を生む連鎖パターンを認識する
- **Dead code パラメータは即座に除去するか TODO を付ける**: SDK 未対応で使えないパラメータを「将来のため」に受け取ると、コードレビューで maintainability 減点になる。明示的な TODO + tracking reference がなければ削除する
- **IDOR ゼロ記録を 2 フェーズ連続で維持**: Phase 5 に続き Phase 6 でも IDOR 指摘なし。`getAuthenticatedUser()` + ownership verification パターンの定着が確認された。constraints / review-lessons への昇格による学習サイクルの有効性がさらに裏付けられた
- **spec review で型記述・アルゴリズムの曖昧さは MEDIUM で検出される**: 型の揺れ（integer vs string-or-integer）や曖昧なアルゴリズム記述は iteration 1 で必ず指摘される。spec 作成時に入力パラメータの型統一と具体的なアルゴリズム記述を意識する

---

## 2026-04-27 — [BugFix] Custom Tool 未登録 + Propose 画面遷移 regression

**Type**: bug-fix
**Severity**: normal
**Root Cause**: Agent 作成時の tools 配列に Custom Tool が含まれていない + merge conflict 解消で削除済みコードが復活

### Bug Pattern

#### Bug 1: register_branch Custom Tool が Agent に未登録
- 症状: propose セッションで agent が register_branch を呼ばず、branch_name が DB に null のまま
- 直接原因: `actions.ts:68` の `createAgent` の tools 配列が `[{ type: 'agent_toolset_20260401' }]` のみで `REGISTER_BRANCH_TOOL` が含まれていない
- 根本原因: PR #11 で Custom Tool の実装（ツール定義、ハンドラ、SSE requires_action 処理）を追加した際、Agent 作成側の tools 配列への登録が漏れた。実装の「出口」側（ツール定義・ハンドラ）は完成しても「入口」側（Agent への登録）が漏れるパターン

#### Bug 2: Propose 起動後にチャット画面へ自動遷移（regression）
- 症状: Start Propose 実行後にリクエスト詳細画面からチャット画面に自動遷移する
- 直接原因: `workspace-client.tsx:468-470` の `connectStream()` + `setSelectedManagedSessionId()` が propose 完了ハンドラ内に存在
- 根本原因: PR #10 で修正済みだった行が PR #11 の merge conflict 解消で復活した

### Process Gap
- 検出すべきだったフェーズ: code-review（両バグとも実装段階で検出可能）
- 観点の有無:
  - Bug 1: なかった → ギャップ — checklist.md に「新規 tool/resource の全登録箇所確認」の観点がない
  - Bug 2: なかった → ギャップ — merge conflict resolution 後の意図しない行復活を検出するルールがない
- 改善アクション:
  - checklist.md に「Custom Tool/Resource 追加時に Agent の tools 配列への登録確認」を追加
  - checklist.md に「merge conflict resolution 後、削除済みコードの意図しない復活がないか確認」を追加

### Lessons
- **新しい機能の「出口」と「入口」の両方を確認する**: Custom Tool の実装（ツール定義、ハンドラ、SSE 処理）が揃っていても、Agent 側の tools 配列に登録されなければ機能しない。新機能追加時は「定義側」と「利用側」の接続を必ず検証する。これは Phase 3（Bootstrap）の「定義済み関数の未呼び出し」パターンと同根
- **merge conflict resolution は新たなバグの温床**: conflict 解消時に意図的に削除した行が復活するパターンは、通常の diff レビューでは検出困難。conflict marker の解消後に「この PR で意図的に削除した変更が残っているか」を確認するプロセスが必要
- **サイレント障害（エラーなし・機能しない）はテストでのみ検出できる**: Bug 1 はエラーメッセージが出ない。Agent がツールを呼ばないだけで、正常系と区別がつかない。Custom Tool の呼び出しを検証する end-to-end テストが最も有効な防止策
- **同一 PR への複数機能の集約はリスクを高める**: PR #11 に Custom Tool 実装と他の変更が含まれていたため、merge conflict が発生しやすくなった。機能単位での PR 分割が conflict リスクを低減する
