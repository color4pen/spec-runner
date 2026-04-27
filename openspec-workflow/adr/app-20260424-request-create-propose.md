# Request Create + Propose セッション設計

**Date**: 2026-04-24
**Status**: proposed

## Context

spec-runner は bootstrap フロー以降の開発パイプラインが未実装だった。4セッション直列モデル（propose / spec-review / implement / code-review）の入口として、ユーザーが Web UI から request を作成し、Managed Agents の propose セッションで change folder を自動生成するフローが必要になった。既存の `startBootstrap()` パターン（status transition → Vault setup → createBoundSession → sendMessage）が流用可能な状況であり、新規パターンを導入するか既存を再利用するかの判断が求められた。

## Decision

`startBootstrap()` と同構造の `startPropose()` を実装し、request 作成と propose セッション起動を内部的に分離する（`createRequest()` → `startPropose()` の2ステップ）。ブランチ命名は Server Action 側で制御し、`enabled` フィールドは TEXT（JSON 配列文字列）で DB に保存する。propose 完了時は PR を作成せず、change folder は GitHub Contents API で閲覧する。

## Alternatives Considered

### Alternative 1: 新しいセッション起動パターンを設計

- **Pros**: propose 固有の最適化が可能
- **Cons**: 実装コストが増大し、bootstrap で検証済みのロールバック処理を再実装する必要がある
- **Why not**: 既存パターンで十分機能し、複雑さが増すだけでメリットがない

### Alternative 2: enabled フィールドを正規化テーブル（request_enabled_options）で管理

- **Pros**: DB レベルのリレーショナル制約が効く
- **Cons**: 現時点で検索クエリで enabled の中身を参照する要件がなく、オーバーエンジニアリング
- **Why not**: request 単位の読み書きのみで JOIN の必要性がない。SQLite の特性上、JSON 文字列で十分

### Alternative 3: change folder をクローンしてローカルで読む

- **Pros**: GitHub API rate limit の影響を受けない
- **Cons**: サーバーサイドにファイルシステムが必要で、Next.js のデプロイモデルに不適切
- **Why not**: ユーザー操作起点の低頻度アクセスであり、Contents API で十分

### Alternative 4: request 作成と propose 起動を単一トランザクションで実行

- **Pros**: 一発で完結する操作の一貫性が高い
- **Cons**: エラー時のロールバック粒度が粗くなる。request だけ残して session を巻き戻すユースケースに対応できない
- **Why not**: 単一責任原則に反し、テスタビリティも低下する

## Consequences

### Positive
- 実績のある startBootstrap() パターンの再利用で、信頼性の高いセッション起動フローを短期間で実装できた
- request 作成と propose 起動の分離により、後から手動で propose を起動するユースケースにも対応可能
- `'use server'` 制約を考慮し、純粋関数を `propose-utils.ts` に分離したことでテスタビリティが向上した

### Negative
- propose 完了時に PR を作成しないため、4セッションモデルの後続パイプラインが実装されるまでは change folder の閲覧のみで手動確認が必要
- enabled フィールドの JSON 文字列は DB レベルの制約がなく、Server Action 層でのバリデーションに依存する

### Risks
- slug を `request.createdAt` + タイトルから毎回 deterministically に導出しているため、タイトル変更が入ると整合性が崩れる。現時点ではタイトル変更 UI がないため影響なし
- GitHub Contents API の rate limit は低頻度アクセスのため問題ないが、将来的にポーリングが追加された場合はキャッシュ戦略が必要

### Known Design Debt
- TC-014, TC-015, TC-016 が静的解析（ソースコード文字列マッチング）でビジネスロジックを検証しており、モックベースの統合テストへのリファクタリングが未実施（review-feedback-002 の唯一の未解決 finding）
- `filePath.startsWith(changeFolderPath)` のパス検証でトレイリング `/` を付加しておらず、理論上のプレフィックス衝突リスクが残存（実害なし: slug はサーバー側で生成されるため攻撃不可）
