# リポジトリ登録時の bootstrap 済み自動判定

**Date**: 2026-04-25
**Status**: accepted

## Context

`registerRepository()` は `bootstrap_status` を一律 `uninitialized` で INSERT するため、既に openspec-workflow がセットアップ済みのリポジトリを登録しても bootstrap フローを要求される。spec-runner 自身のリポジトリのように bootstrap 済みのリポジトリでは不要な手順が発生し、UX を損なっていた。既存の `github-api.ts` に `getFileContent()` と `getDirectoryContents()` が実装済みで、GitHub Contents API によるファイル存在確認が可能な状況だった。

## Decision

`registerRepository()` 内にモジュールプライベート関数 `detectBootstrapStatus()` を追加し、GitHub Contents API で `openspec/project.md` と `requests/active/` の存在を `Promise.all` で並列チェックする。両方存在すれば `ready`、いずれか欠けるか API エラー時は `uninitialized` で登録する（安全側倒し）。

## Alternatives Considered

### Alternative 1: `openspec/project.md` のみで判定

- **Pros**: API 呼び出し 1 回で済む
- **Cons**: OpenSpec 初期化のみで workflow が未セットアップのリポジトリを `ready` と誤判定する（false positive）
- **Why not**: `requests/active/` が openspec-workflow bootstrap の証拠であり、AND 条件にしないと判定精度が不十分

### Alternative 2: `.claude/` ディレクトリの存在確認

- **Pros**: Claude Code 固有の設定が確認できる
- **Cons**: bootstrap が何を生成するかに強く依存し、bootstrap 内容の変更で判定が壊れる
- **Why not**: bootstrap 出力の実装詳細に結合してしまい、変更に脆い

### Alternative 3: 新しい API ラッパーを作成して存在チェック専用のユーティリティを提供

- **Pros**: 存在チェックに特化した簡潔なインターフェース
- **Cons**: 既存の `getFileContent`（404 → null）と `getDirectoryContents`（404 → 空配列）が同等の機能を提供しており重複
- **Why not**: 既存 API で十分機能し、新しい抽象化の追加はオーバーエンジニアリング

## Consequences

### Positive

- bootstrap 済みリポジトリの登録時に不要な bootstrap フローがスキップされ、UX が改善される
- 安全側倒し設計により、API エラー時でも登録操作自体は成功する（最悪でも従来動作）
- 既存の `github-api.ts` 関数を再利用し、新しい API ラッパーを追加していない

### Negative

- 登録ごとに 2 回の追加 GitHub API 呼び出しが発生する（並列実行で約 100ms）
- `repository-binding/spec.md` の "Explicit registration from search UI" シナリオが `bootstrap_status: uninitialized` 固定と記述しており、本変更との整合性がまだ更新されていない

### Risks

- GitHub API レートリミット: 登録は低頻度操作のため影響は軽微。エラー時は `uninitialized` にフォールバック
- default branch 以外に bootstrap 済みファイルがある場合は検出できない。ただし bootstrap は default branch に対して実行されるため問題なし
- false negative（bootstrap 済みなのに `uninitialized`）: API エラーやレートリミット時に発生しうるが、手動 bootstrap で解消可能
