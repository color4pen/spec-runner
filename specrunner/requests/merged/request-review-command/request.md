# specrunner request review: request.md の architect レビュー

## Meta

- **type**: new-feature
- **slug**: request-review-command
- **base-branch**: main
- **date**: 2026-05-14
- **author**: color4pen

## ワークフローオプション

- **enabled**: []

## 背景

複雑な機能開発では、対話の中で request.md を作成した後、パイプライン実行前に architect レビューで設計リスクや要件の抜け漏れを検出したい。現在 `specrunner request` には `template` と `validate` があるが、validate はフォーマットチェックのみで内容の評価は行わない。

watch コマンド（issue 駆動の自動実行）でも、リスク評価の gate として request review を利用できる。

また、現在 architect レビューはパイプライン内のサブエージェントとして起動されるため、マネージャーセッションのコンテキストとコストを消費する。独立コマンドにすることで、対話セッションから直接叩けてコスト効率が良い。

## 目的

`specrunner request review <file>` コマンドで request.md の内容を architect 観点でレビューし、実行可否の判定を stdout に返す。stateless な one-shot コマンドとして実装する。

## 要件

### コマンド

1. `specrunner request review <file>` サブコマンドを新設する
2. 既存の `request validate` と同じ `parseRequestMdContent` をインラインで呼び、フォーマットチェックを先に通す（subprocess にしない）

### レビュー実行

3. SDK の `query()` を `executeReview()` から直接呼ぶ。Pipeline machinery（StepExecutor / AgentStep / JobState）は使わない
4. `query()` には既存パイプラインステップと同等のツール（Read, Grep, Glob, Agent 等）を渡し、architect がコードベースを深く探索できるようにする。ツール制限は本コマンド固有ではなくパイプライン横断の設計方針に従う
5. レビュー用システムプロンプトを `src/prompts/request-review-system.ts` に新設する
6. プロジェクトコンテキストは `projectMdPath()` から直接読み込み、初期メッセージに注入する
6. レビュー観点:
   - 要件の明確性・網羅性
   - スコープの適切さ（大きすぎないか）
   - 既存アーキテクチャとの整合性
   - リスク評価（変更規模、影響範囲、設計判断の有無）

### Verdict

7. 結果を verdict として返す: `approve` / `needs-discussion` / `reject`
   - `approve`: そのまま run 可能
   - `needs-discussion`: 人間の判断が必要な論点をコメント付きで提示
   - `reject`: 要件不足や矛盾があり、request.md の修正が必要
8. verdict 型は `RequestReviewVerdict` として独立定義する（pipeline の `Verdict` とは別）
9. verdict と理由を stdout に出力する
10. exit code: approve=0, needs-discussion=0, reject=1
    - approve と needs-discussion は非エラーのため 0（Unix 慣例準拠）
    - verdict の詳細は `--json` で取得する

### 構造化出力

11. `--json` フラグで構造化出力に対応する（watch コマンドの gate として利用を想定）
12. JSON スキーマ:
    ```
    {
      verdict: "approve" | "needs-discussion" | "reject",
      findings: [{ severity: "HIGH" | "MEDIUM" | "LOW", category: string, description: string }],
      summary: string
    }
    ```

## 受け入れ基準

- [ ] `specrunner request review <file>` が実行できる
- [ ] verdict が approve / needs-discussion / reject のいずれかで返る
- [ ] レビュー理由が具体的に出力される
- [ ] `--json` で定義済みスキーマの構造化出力が得られる
- [ ] exit code が approve/needs-discussion=0, reject=1 で返る
- [ ] `bun run typecheck && bun run test` が green

## 補足

- stateless な one-shot コマンド。ファイル出力なし、状態管理なし
- review の結果の永続化は呼び出し側（watch 等）の責務
- request.md は worktree ではなく main の `specrunner/requests/` に置く運用を想定
- 将来的に review の結果を request.md に追記する機能も考えられるが、本 request のスコープ外
- レビュー用システムプロンプトは openspec-workflow の architect エージェント定義を再現する。以下が全体構造:

  ### レビュープロセス（この順序で実行）

  1. **現状分析**: 既存アーキテクチャとパターンの確認、規約の特定、技術的負債の把握
  2. **要件整理**: 機能要件（request.md から）、非機能要件（パフォーマンス、セキュリティ、スケーラビリティ）、統合ポイント、データフロー
  3. **設計評価**: コンポーネント責務の明確性、データモデルの適切性、API 契約の一貫性、既存アーキテクチャとの整合性
  4. **トレードオフ分析**: 設計判断ごとに Pros / Cons / Alternatives / Recommendation を提示
  5. **Domain Synthesis（findings 3件以上の場合）**: 全 findings を俯瞰し、同一関心事・同一ライフサイクル・同一不変条件から生じている症状をクラスタリング。個別パッチではなく統合抽象（モジュール・インターフェース・関数群）を提案。クラスタに属さない findings は個別維持
  6. **Devil's Advocate**: 代替案検討（もっと単純な方法はないか、既存ライブラリで代替できないか）、過剰設計検出（YAGNI、不要な抽象化）、隠れたコスト分析（保守・学習・移行・運用コスト）、リスク分析（単一障害点、外部依存、スケーリング破綻）

  ### 設計原則

  - モジュール性: 単一責任原則、高凝集・低結合、明確なインターフェース
  - スケーラビリティ: ステートレス設計の優先、効率的なクエリ、キャッシュ戦略
  - 保守性: 一貫したパターン、テストの容易さ、理解の容易さ

  ### アンチパターン検出

  | アンチパターン | Severity |
  |--------------|----------|
  | God Object（1つのクラス/コンポーネントが全てを担当） | HIGH |
  | Tight Coupling（コンポーネント間の過度な依存） | HIGH |
  | Scattered Fixes（同一関心事の症状を統合抽象なしに個別適用） | HIGH |
  | Big Ball of Mud（明確な構造がない） | HIGH |
  | Golden Hammer（全てに同じソリューションを適用） | MEDIUM |
  | Premature Optimization（早すぎる最適化） | MEDIUM |
  | Over-Engineering（要件以上の複雑さ） | MEDIUM |

  ### プロジェクト固有の設計観点

  `specrunner/project.md` の Tech Stack を読み、該当技術に応じた設計観点で動的にレビューする

  ### 出力フォーマット

  ```
  ## Findings Summary
  | # | Severity | Category | Description |
  |---|----------|----------|-------------|

  ## Domain Cluster（クラスタが識別された場合のみ）
  | Cluster | Findings | Proximity | Proposed Abstraction |
  |---------|----------|-----------|---------------------|

  ## Alternative Proposals
  | # | 現在の設計 | 懸念 | 代替案 | トレードオフ |
  |---|-----------|------|--------|------------|
  ```

  verdict は Findings の Severity 集計から導出する:
  - HIGH が 0 件 → `approve`
  - HIGH が 1 件以上だが設計判断で解決可能 → `needs-discussion`
  - HIGH が複数かつ要件矛盾・構造破綻 → `reject`

## architect 評価済みの設計判断

- Pipeline machinery は不使用。SDK `query()` をパイプライン同等のツール付きで直接呼ぶ
- Verdict 型は pipeline の Verdict とは独立定義
- exit code は 2-way（0/1）。verdict 詳細は `--json` で提供
- JSON 出力スキーマは `{ verdict, findings[], summary }` で確定
- project context は `projectMdPath()` から直接読み込み
