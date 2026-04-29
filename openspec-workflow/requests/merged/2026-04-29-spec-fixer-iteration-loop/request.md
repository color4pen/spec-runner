# Spec-Fixer + Iteration Loop — spec-review の自動修復ループ

## Meta

- **type**: new-feature
- **date**: 2026-04-29
- **author**: color4pen
- **depends-on**: openspec-workflow/requests/awaiting-merge/2026-04-29-spec-review-pipeline (PR #22)

## ワークフローオプション

- **enabled**:
  - test-case-generator
  - adr
  - module-architect

## 背景

PR #22 で spec-review セッションを実装したが、`needs-fix` を返した時点でパイプラインは停止する暫定実装になっている。openspec-workflow の本来の挙動は、spec-fixer がレビュー指摘を読んで change folder を修正し、新しい spec-review セッションを起こして再評価する **iteration ループ** で完結することにある。

このループは spec-review だけでなく code-review でも同じ仕組みで動くため、いま spec-fixer を実装することで loop プリミティブを Pipeline 層に確立し、後続の implementer / code-review で再利用できる構造を作る。

また、PR #22 で表面化した「同一 Agent を異なる role で再利用すると system prompt と user message が矛盾する」問題（ADR-20260429-positioning-vs-gsd-and-openspec の Managed Agents 制約）を踏まえ、本 request では spec-fixer 専用 Agent を新設し、設計の起点から構造的にこの罠を避ける。

## 目的

spec-review が `needs-fix` を返した場合に spec-fixer セッションを自動起動して change folder を修正し、新しい spec-review セッションで再評価するループを実現する。retry 上限まで approved にならなければ `escalation` で停止する。

## 要件

### Agent 設計（Managed Agents 制約への対処）

1. spec-fixer 専用 Agent を `specrunner init` で作成する
   - role-specific system prompt（修正のみ、レビュー禁止、Author-Bias Elimination の精神を明記）
   - Custom Tools なし（`register_branch` を含めない）
   - propose Agent との混在を構造的に防ぐ
2. config を `agents.{propose, specReview, specFixer}` の構造に拡張する
   - 既存の `config.agent.id` は backward compat のため残し、deprecation コメントを付ける
   - `agents.propose.id` 等を優先参照、なければ `config.agent.id` にフォールバック
3. spec-review も将来的に専用 Agent 化する余地を残す（本 request では実施しない、補足に記載）

### Iteration Loop プリミティブ（Pipeline 層）

4. Pipeline 層に loop プリミティブを導入する
   - シグネチャ案: `runLoopUntil(state, deps, { body: AgentStep, evaluator, maxIterations, onExceeded })`
   - body が verdict を返し、evaluator が「approved → exit / needs-fix → 次 iter / escalation → exit」を判定
   - maxIterations 到達時は onExceeded（デフォルト: verdict を escalation に書き換えて exit）
5. 既存の `runPipeline` をリファクタし、step を順次実行する while-style ではなく、step + loop の合成として表現可能にする
   - 現在の `runPipeline` の API は維持しつつ、内部で loop 対応に拡張
6. iteration ごとに別セッションを作る（既存セッションへのメッセージ追加ではない、Author-Bias Elimination のため）

### Spec-Fixer Step

7. `src/core/steps/spec-fixer.ts` を新設
   - 入力: 直前の spec-review-result.md のパス、change folder のパス
   - 処理: spec-fixer セッションを起動、findings を読んで change folder を修正、ブランチに push
   - 出力: なし（次の spec-review が成果物を確認する）。state には spec-fixer セッション ID と iteration 番号を記録
8. `src/prompts/spec-fixer-system.ts` を新設
   - 修正のみ実行、レビューや方針変更はしない旨を明記
   - findings テーブルの各行に対応する修正を行う
   - 修正後にブランチへ commit + push する手順を含める

### State 拡張

9. `JobState.steps[stepName]` を `Array<StepResult>` に変更し、iteration ごとの結果を時系列で保存する
   - 既存テストとの互換のため、`StepResult.iteration` フィールドを追加（必須、1-origin）
   - 後方互換: 既存の単一値読み出し API は last iteration を返す
10. iteration 履歴から「verdict 推移」を判定するヘルパを追加（plateaued/improving/regressing 検出は本 request ではスコープ外、追加するための土台のみ）

### Pipeline 制御

11. spec-review の verdict が `needs-fix` の場合、自動的に spec-fixer → spec-review iteration loop に入る
12. iteration loop の max は 2（openspec-workflow 準拠）
   - 設定可能にする: `config.pipeline.maxRetries`（既定値 2）
   - request.md の補足から override 可能にするかは design.md で評価
13. retry 上限到達時:
    - 最終 verdict を `escalation` として記録（新しい verdict 値は導入しない）
    - stdout に「retries exhausted, escalating」と理由を出力
    - state に `error.code = SPEC_REVIEW_RETRIES_EXHAUSTED` を記録
14. spec-review が `escalation` を返した時点で loop を抜ける（fixer 起動なし）

### 出力 / UX

15. iteration ごとに stdout に進捗を出す（`[iter 1] spec-review verdict: needs-fix → spawning spec-fixer`）
16. 最終結果のサマリに iteration 数と verdict 推移を含める

## 受け入れ基準

- [ ] `specrunner init` で spec-fixer 専用 Agent が作成され config に保存される
- [ ] spec-review が needs-fix を返すと spec-fixer セッションが自動起動する
- [ ] spec-fixer は spec-review-result.md を読んで change folder を修正しブランチに push する
- [ ] 修正後、新しい spec-review セッションが起動し再評価される
- [ ] approved になったら loop を抜けて成功
- [ ] max retries（既定 2）を超えると `escalation` で終了
- [ ] iteration ごとの状態が JobState.steps[stepName] の配列に記録される
- [ ] spec-fixer Agent の system prompt と Custom Tools が propose Agent と分離されている
- [ ] stdout に iteration 進捗が表示される
- [ ] config が `agents.{propose, specReview, specFixer}` 構造に拡張される（後方互換あり）

## 補足

### Managed Agents の制約（PR #22 で表面化した問題への対応）

本 request は PR #19 / #22 で得た以下の知見を前提とする:

- `SessionCreateParams` には `system` フィールドがない（per-session の system prompt 上書き不可）
- Agent の system prompt / tools / model は Agent バージョンに固定される
- 同一 Agent を異なる role で再利用すると、Agent の system prompt と user message が矛盾する
- Custom Tool は Agent レベルで定義されるため、role-specific に出し分けできない

**結論**: role が異なるなら原則新しい Agent を作る。本 request では spec-fixer を専用 Agent とする。spec-review は PR #22 では既存 Agent を流用しているが、専用 Agent 化は別 request（本 request のスコープ外）。

参照: ADR-20260429-positioning-vs-gsd-and-openspec.md

### Iteration Loop の設計判断

design.md で以下を評価し、選択した案を記録すること:

1. **loop プリミティブの実装場所**: Pipeline 層 vs spec-fixer step 内
   - 推奨: Pipeline 層（code-review でも再利用するため）
2. **iteration ごとのセッション分離**: 新規セッション vs 既存セッションへの追記
   - 推奨: 新規セッション（Author-Bias Elimination の精神。コスト増は許容）
3. **max retries**: 固定 vs config 化
   - 推奨: config 化（既定 2、`config.pipeline.maxRetries`）
4. **retry 上限到達時の verdict**: 既存 verdict 値の流用 vs 新規導入
   - 推奨: `escalation` に統合（state.error.code で詳細を区別）

### Step interface 抽象化はスコープ外

PR #22 の振り返りで「propose / spec-review に共通パターンがあり、Step interface で抽象化できる」という議論があったが、本 request には含めない。理由:

- spec-fixer 実装で 3 ステップ目が揃い、共通パターンが確実に見える
- 抽象化は別 request で 3 ステップまとめてリファクタする方が安全
- 本 request は loop プリミティブの確立に集中する

ただし spec-fixer 実装時に「どのみち重複するな」と判明したヘルパ（createSessionForStep, githubGet 等）は局所的に抽出して構わない。Step interface 全体の抽象化は別 request のスコープ。

### スコープ外（後続 request）

- Step interface の汎用化と既存ステップのリファクタ
- iteration loop の plateaued / regressing 検出（GAN ループの収束判定）
- spec-review 専用 Agent への移行
- implementer セッション接続
- code-review セッション接続（spec-fixer の loop パターンを再利用予定）
- decision logging（subagent 横断）

### 参照

- PR #22: spec-review pipeline の実装
- openspec-workflow `skills/spec-review/` — spec-fixer agent の責務定義
- ADR-20260424-session-pipeline-design.md — 4 セッション直列モデル
- ADR-20260427-cli-first-architecture.md — CLI ファースト方針
- ADR-20260429-positioning-vs-gsd-and-openspec.md — Managed Agents 制約と review ループの差別化
