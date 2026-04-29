# Spec-Review セッション接続 — propose 完了後の自動遷移

## Meta

- **type**: new-feature
- **date**: 2026-04-29
- **author**: color4pen
- **depends-on**: openspec-workflow/requests/merged/2026-04-27-cli-core-pipeline

## ワークフローオプション

- **enabled**:
  - test-case-generator
  - adr
  - module-architect
  - security-reviewer

## 背景

CLI core pipeline（PR #19）で propose セッション 1 段の実装が完了した。次のステップは spec-review セッションを接続し、パイプラインの自動遷移パターンを確立する。

spec-review は openspec-workflow の review/学習層の根幹であり、Author-Bias Elimination の最初の境界（設計者 ≠ レビュアー）を成立させる。Custom Tool は不要で、verdict はブランチ上のファイル（spec-review-result.md）に書き、CLI 側がポーリング完了後に GitHub API で読み取る。

このパターンが確立すれば、後続の implementer / code-review も同じ枠組みで接続できる。今回が「fresh-per-task dispatcher」の最初の実装でもある（propose 完了 → 別セッションを起こして spec-review を実行）。

## 目的

propose 完了後に spec-review セッションを自動起動し、ブランチ上の spec-review-result.md から verdict を読み取り、verdict に応じてパイプラインを遷移させる。

## 要件

### Pipeline Step の追加

1. `src/core/steps/spec-review.ts` を新設し、spec-review セッションの起動・完了検知・verdict 読み取りを実装する
2. propose 完了後、`runProposePipeline` の後段で spec-review セッションを起動する（or `pipeline.ts` を multi-step オーケストレーターに拡張）
3. spec-review セッションは Custom Tool を使わず、ファイル経由 verdict のみ

### Spec-Review セッション

4. spec-review 用の system prompt テンプレートを新設する（`src/prompts/spec-review-system.ts`）
   - architect + spec-reviewer の役割を 1 セッションで担う（Phase 2 では分離も検討）
   - 入力: change folder のパス
   - 出力: `openspec/changes/<slug>/spec-review-result.md` をブランチに push
5. spec-review セッションは Anthropic SDK の sessions.retrieve() ポーリングで完了検知する（SSE 不要）
6. セッション完了後、GitHub API で `spec-review-result.md` を取得し verdict をパース

### Verdict ハンドリング

7. verdict は `approved` / `needs-fix` / `escalation` の 3 値
8. ファイルから verdict 行（`- **verdict**: approved` 等）を機械的にパースする
9. verdict に応じた遷移:
   - `approved`: パイプライン成功として終了（implementer 接続は次 request）
   - `needs-fix`: stdout に findings サマリを出力 + 状態ファイルに記録 + 終了（リトライ自動化は次 request）
   - `escalation`: stdout にエスカレーション理由を出力 + 終了

### 状態管理

10. ジョブ状態ファイルに `spec-review` ステップを追加する
11. spec-review セッション ID、verdict、findings ファイルパスを記録する

### Module 構造

12. `src/core/steps/` 配下に各ステップを配置（既存の propose ロジックを `propose.ts` に移動 or 残置を検討）
13. パイプラインオーケストレーターは step の順次実行と verdict 分岐のみを担う

## 受け入れ基準

- [ ] propose 完了後に spec-review セッションが自動起動される
- [ ] spec-review セッションが change folder を読んで spec-review-result.md をブランチに push する
- [ ] sessions.retrieve() ポーリングで spec-review 完了が検知される
- [ ] GitHub API で spec-review-result.md が取得され、verdict がパースされる
- [ ] verdict が `approved` の場合、ジョブが success で終了する
- [ ] verdict が `needs-fix` / `escalation` の場合、stdout に明示的なメッセージが出力される
- [ ] 状態ファイルに spec-review ステップの履歴が記録される

## 補足

### ADR との整合

- ADR-20260424-session-pipeline-design.md — 4セッション直列モデルの spec-review に該当
- ADR-20260427-cli-first-architecture.md — Custom Tool なしで完結する設計
- ADR-20260429-positioning-vs-gsd-and-openspec.md — fresh-per-task dispatcher の最初の実装

### スコープ外（後続 request）

- spec-fixer セッション自動起動（needs-fix リトライ）
- implementer セッション接続
- code-review セッション接続
- 学習層（observation → instinct → rule）
- decision logging
- security-reviewer / pattern-reviewer の並列起動（Phase 2）

### 設計上の検討事項

- `runProposePipeline` を直接拡張するか、`runPipeline` という上位オーケストレーターを新設するか（後者推奨：fresh-per-task の構造を作るため）
- step ごとに別セッションを作るが、状態ファイル上はジョブ単位で管理する
- spec-review セッションの timeout は propose と独立に設定可能にする（spec-review は短いはず）
